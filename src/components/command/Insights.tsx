"use client";

import { useState } from "react";
import { DonutChart, PartBars, StackedBar, TrendChart, type Part, type Point } from "@/components/chat/Charts";
import { Segmented, Sheet } from "@/components/chat/ui";
import { ago, KIND_LABEL, onSite, staffing, zoneOf, type OpState, type RequestKind } from "./data";
import * as op from "./store";
import { requestTitle, useUi } from "./parts";
import c from "./command.module.css";

/* ---------------------------------------------------------------------------
   Ops widgets for the Dashboard (an "Ops starter"), and the Day report.
--------------------------------------------------------------------------- */

const n0 = (n: number) => String(Math.round(n));
const mins = (n: number) => `${Math.round(n)} min`;

function staffParts(s: OpState, only: "short" | "all"): Part[] {
  return s.zones
    .map((z) => ({ z, st: staffing(s, z) }))
    .filter(({ st }) => only === "all" || st.n < st.target)
    .map(({ z, st }) => ({
      key: z.id,
      label: z.code,
      value: st.n,
      color: st.level === "critical" ? "var(--bad-mark)" : st.level === "short" ? "var(--warn-mark)" : st.level === "over" ? "var(--chart-3)" : "var(--ok-mark)",
    }));
}

function decideTimes(s: OpState) {
  return s.requests.filter((r) => r.decidedAt).map((r) => ({ r, m: ((r.decidedAt ?? r.at) - r.at) / 60_000 }));
}

function byKind(s: OpState): Part[] {
  const colors: Record<RequestKind, string> = { staff: "var(--chart-1)", move: "var(--chart-2)", supplies: "var(--chart-3)", issue: "var(--bad-mark)" };
  return (Object.keys(KIND_LABEL) as RequestKind[]).map((k) => ({ key: k, label: KIND_LABEL[k], value: s.requests.filter((r) => r.kind === k).length, color: colors[k] }));
}

function onSiteSeries(s: OpState): Point[] {
  return s.headcount.map((h, i, all) => ({ x: h.h, label: h.h === "Now" ? "Now" : `${h.h}:00`, value: i === all.length - 1 ? onSite(s) : h.value }));
}

const decideTrend = (s: OpState): Point[] => {
  const base = [9, 7, 8, 5, 4];
  const live = decideTimes(s);
  const avg = live.length ? live.reduce((a, x) => a + x.m, 0) / live.length : 4;
  return [...base.map((v, i) => ({ x: `${10 + i * 2}`, label: `${10 + i * 2}:00`, value: v })), { x: "Now", label: "Now", value: Math.round(avg * 10) / 10 }];
};

export function OpsWidgets({ s }: { s: OpState }) {
  const ui = useUi();
  const [only, setOnly] = useState<"short" | "all">("short");
  const pending = s.requests.filter((r) => r.status === "pending").length;
  const times = decideTimes(s);
  const avg = times.length ? times.reduce((a, x) => a + x.m, 0) / times.length : 0;
  const lastB = s.broadcasts[s.broadcasts.length - 1];
  const aud = lastB ? op.audienceSize(s, lastB) : 1;
  const read = lastB ? Math.min(aud, Object.keys(lastB.acks).length) : 0;
  const parts = staffParts(s, only);
  return (
    <div className={c.widgets}>
      <article className={`${c.widget} ${c.widgetWide}`} onClick={() => ui.openConsole?.()}>
        <header><span className={c.wTag}>Ops</span><b>Zones staffing</b>
          <span onClick={(e) => e.stopPropagation()}><Segmented value={only} onChange={setOnly} options={[{ id: "short", label: "Understaffed" }, { id: "all", label: "All" }]} /></span>
        </header>
        <div className={c.wChart}>{parts.length ? <PartBars parts={parts} format={n0} /> : <p className={c.emptyBox}>Every zone is staffed.</p>}</div>
        <footer>{s.zones.filter((z) => staffing(s, z).n < z.target).length} of {s.zones.length} zones under target · on site vs target</footer>
      </article>
      <article className={c.widget} onClick={() => ui.openConsole?.()}>
        <header><span className={c.wTag}>Ops</span><b>Requests</b></header>
        <div className={c.wBig}><b>{pending}</b><span>pending · avg {mins(avg)} to decide</span></div>
        <div className={c.wSpark}><TrendChart data={decideTrend(s)} kind="area" format={mins} names={{ value: "Avg to decide" }} xTicks={["10", "Now"]} /></div>
        <StackedBar parts={byKind(s)} format={n0} />
      </article>
      <article className={c.widget} onClick={() => ui.openConsole?.()}>
        <header><span className={c.wTag}>Ops</span><b>Broadcast reach</b></header>
        <div className={c.wDonut}>
          <DonutChart
            parts={[{ key: "read", label: "Read", value: read, color: "var(--ok-mark)" }, { key: "unread", label: "Not yet", value: aud - read, color: "var(--fill-2)" }]}
            center={<span className={c.donutCenter}><b>{Math.round((read / aud) * 100)}%</b><small>{read}/{aud}</small></span>}
            format={n0}
          />
        </div>
        <footer className={c.clip}>“{lastB?.text}”</footer>
      </article>
      <article className={c.widget} onClick={() => ui.sheet(<DayReport s={s} />)}>
        <header><span className={c.wTag}>Ops</span><b>On site</b></header>
        <div className={c.wBig}><b>{onSite(s)}</b><span>people now</span></div>
        <div className={c.wSpark}><TrendChart data={onSiteSeries(s)} kind="area" format={n0} names={{ value: "On site" }} xTicks={["08", "Now"]} /></div>
      </article>
    </div>
  );
}

export function DayReport({ s }: { s: OpState }) {
  const ui = useUi();
  const [shift, setShift] = useState(s.shift);
  const times = decideTimes(s);
  const decided = times.length;
  const approved = s.requests.filter((r) => r.status === "approved" || r.status === "done").length;
  const avg = decided ? times.reduce((a, x) => a + x.m, 0) / decided : 0;
  const tasksDone = s.tasks.filter((t) => t.step === "done").length;
  const readRates = s.broadcasts.map((b) => Math.min(1, Object.keys(b.acks).length / op.audienceSize(s, b)));
  const reach = readRates.length ? readRates.reduce((a, b) => a + b, 0) / readRates.length : 0;
  const slow = [...s.requests].map((r) => ({ r, m: ((r.decidedAt ?? ui.now) - r.at) / 60_000 })).sort((a, b) => b.m - a.m).slice(0, 5);
  return (
    <Sheet title="Day report" onClose={() => ui.sheet(null)}>
      <Segmented value={shift} onChange={setShift} options={[{ id: "morning", label: "Day 2 · Morning" }, { id: "evening", label: "Day 2 · Evening" }]} />
      {shift === "morning" ? (
        <p className={c.emptyBox}>Morning shift closed at 16:00 · 24 on site at peak · 9 requests · avg 6 min to decide · 31 tasks done.</p>
      ) : <>
        <div className={c.totals}>
          <div><b>{onSite(s)}</b><small>on site</small></div>
          <div><b>{s.requests.length}</b><small>requests</small></div>
          <div><b>{approved}</b><small>approved</small></div>
          <div><b>{mins(avg)}</b><small>avg to decide</small></div>
          <div><b>{tasksDone}</b><small>tasks done</small></div>
          <div><b>{Math.round(reach * 100)}%</b><small>broadcast read</small></div>
        </div>
        <div className={c.label}>People on site through the day</div>
        <div className={c.reportChart}><TrendChart data={onSiteSeries(s)} kind="area" format={n0} names={{ value: "On site" }} xTicks={onSiteSeries(s).map((p) => p.x)} /></div>
        <div className={c.label}>Staffing now, by zone</div>
        <div className={c.reportChart}><PartBars parts={staffParts(s, "all")} format={n0} /></div>
        <div className={c.label}>Requests by kind</div>
        <StackedBar parts={byKind(s)} format={n0} height={14} />
        <div className={c.legendRow}>{byKind(s).map((p) => <span key={p.key}><i style={{ background: p.color }} />{p.label} {p.value}</span>)}</div>
        <div className={c.label}>Slowest requests</div>
        <ol className={c.slow}>
          {slow.map(({ r, m }) => (
            <li key={r.id}>
              <span><b>{requestTitle(s, r)}</b><small>{zoneOf(s, r.zoneId)?.name} · {r.status === "pending" ? "still pending" : r.status}</small></span>
              <em className={m > 5 ? c.overdue : undefined}>{ago(m * 60_000)}</em>
            </li>
          ))}
        </ol>
        <p className={c.sheetHint}>Export to PDF or CSV · Soon</p>
      </>}
    </Sheet>
  );
}
