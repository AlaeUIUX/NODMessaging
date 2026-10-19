"use client";

import { useState } from "react";
import { Segmented } from "@/components/chat/ui";
import { IconAlert, IconChart, IconClose, IconCloud } from "@/components/chat/Icons";
import {
  ago, attentionScore, clock, CREWS, firstName, onSite, pendingRequests, STATUS_LABEL, staffing, zoneOf,
  type Audience, type Broadcast, type CrewId, type FeedEvent, type OpState,
} from "./data";
import * as op from "./store";
import { Av, BroadcastItem, Code, FloorMap, RequestCard, requestTitle, useUi, ZoneTile } from "./parts";
import { DayReport } from "./Insights";
import { RadioMonitor } from "./RadioScreen";
import c from "./command.module.css";

/* ---------------------------------------------------------------------------
   The Command display: three columns on a tablet or laptop, stacked tabs on
   a phone (a container query decides, so it works in any frame).
--------------------------------------------------------------------------- */

export function Console({ s, onClose, startRight = "feed" }: { s: OpState; onClose?: () => void; startRight?: "feed" | "radio" }) {
  const ui = useUi();
  const [tab, setTab] = useState<"zones" | "requests" | "feed" | "radio">("zones");
  const [right, setRight] = useState<"feed" | "radio">(startRight);
  const mode = tab === "radio" || tab === "feed" ? tab : right;
  const onAir = s.radio.tx.find((x) => x.live);
  const pending = pendingRequests(s);
  const urgent = pending.filter((r) => r.urgency === "urgent").length;
  const sending = s.requests.filter((r) => r.sending).length;
  return (
    <div className={c.console}>
      <header className={c.conHead}>
        <div className={c.conTitle}>
          <span className={c.opBadge}>EWC</span>
          <span>
            <b>{s.name}</b>
            <small><i className={c.liveDot} />Live · Day {s.day} of {s.days} · {s.venue}</small>
          </span>
        </div>
        <div className={c.conStats}>
          <span><b>{onSite(s)}</b>on site</span>
          <span className={pending.length ? c.statWarn : undefined}><b>{pending.length}</b>pending{urgent ? ` · ${urgent} urgent` : ""}</span>
          <span><b>{s.zones.filter((z) => z.status === "issue").length}</b>issues</span>
        </div>
        <div className={c.conTools}>
          <Segmented value={s.shift} onChange={(v) => op.setShift(v)} options={[{ id: "morning", label: "Morning" }, { id: "evening", label: "Evening" }]} />
          <span className={c.cloud} title="Queued on this device">
            <IconCloud size={16} />{sending ? `${sending} sending…` : "Synced"}
          </span>
          <button className={c.btnGhostSm} onClick={() => ui.sheet(<DayReport s={s} />)}><IconChart size={15} />Report</button>
          {onClose && <button className={c.headBtn} onClick={onClose} aria-label="Close"><IconClose size={18} /></button>}
        </div>
      </header>
      <nav className={c.conTabs} role="tablist">
        {(["zones", "requests", "feed", "radio"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? c.tabOn : undefined} onClick={() => setTab(t)}>
            {t === "zones" ? "Zones" : t === "requests" ? `Requests${pending.length ? ` · ${pending.length}` : ""}` : t === "feed" ? "Feed" : "Radio"}
          </button>
        ))}
      </nav>
      <div className={c.conCols} data-tab={tab}>
        <section className={`${c.col} ${c.colZones}`}><ZonesColumn s={s} /></section>
        <section className={`${c.col} ${c.colReq}`}><QueueColumn s={s} /></section>
        <section className={`${c.col} ${c.colFeed}`}>
          <div className={c.rightSwitch}>
            <Segmented value={right} onChange={(v) => { setRight(v); if (tab === "feed" || tab === "radio") setTab(v); }} options={[{ id: "feed", label: "Feed" }, { id: "radio", label: onAir ? "● Radio" : "Radio" }]} />
          </div>
          {mode === "radio" ? <RadioMonitor s={s} /> : <>
            <h3 className={c.colTitle}>Broadcast</h3>
            <BroadcastComposer s={s} />
            <h3 className={c.colTitle}>Ops feed</h3>
            <FeedList s={s} limit={40} />
          </>}
        </section>
      </div>
    </div>
  );
}

function ZonesColumn({ s }: { s: OpState }) {
  const [view, setView] = useState<"grid" | "map">("grid");
  const [sort, setSort] = useState<"attention" | "code">("attention");
  const [pin, setPin] = useState<string | null>("b2");
  const zones = [...s.zones].sort((a, b) => (sort === "attention" ? attentionScore(s, b) - attentionScore(s, a) : a.code.localeCompare(b.code)));
  const pinned = zoneOf(s, pin);
  return (
    <>
      <div className={c.colHead}>
        <h3 className={c.colTitle}>Zones</h3>
        <Segmented value={view} onChange={setView} options={[{ id: "grid", label: "Grid" }, { id: "map", label: "Map" }]} />
      </div>
      {view === "grid" ? (
        <>
          <div className={c.sortRow}>
            Sort
            <button className={sort === "attention" ? c.sortOn : undefined} onClick={() => setSort("attention")}>Needs attention</button>
            <button className={sort === "code" ? c.sortOn : undefined} onClick={() => setSort("code")}>A–Z</button>
          </div>
          <div className={c.zoneGrid}>{zones.map((z) => <ZoneTile key={z.id} s={s} z={z} variant="tile" />)}</div>
        </>
      ) : (
        <>
          <FloorMap s={s} onPick={setPin} picked={pin} />
          <div className={c.legend}>
            <span><i style={{ background: "var(--ok-mark)" }} />Staffed</span>
            <span><i style={{ background: "var(--warn-mark)" }} />Short or busy</span>
            <span><i style={{ background: "var(--bad-mark)" }} />Issue or critical</span>
            <span>Size = headcount</span>
          </div>
          {pinned && <ZoneTile s={s} z={pinned} />}
        </>
      )}
    </>
  );
}

function QueueColumn({ s }: { s: OpState }) {
  const pending = pendingRequests(s).sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent") || a.at - b.at);
  const recent = s.requests.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? b.at) - (a.decidedAt ?? a.at)).slice(0, 6);
  return (
    <>
      <div className={c.colHead}><h3 className={c.colTitle}>Requests · {pending.length} pending</h3></div>
      {pending.length ? pending.map((r) => <RequestCard key={r.id} s={s} r={r} />) : <p className={c.emptyBox}>Nothing waiting. 👌</p>}
      {recent.length > 0 && <>
        <h3 className={c.colTitle}>Decided</h3>
        {recent.map((r) => <RequestCard key={r.id} s={s} r={r} compact />)}
      </>}
    </>
  );
}

/* ---- Broadcast composer ---- */

export function BroadcastComposer({ s, compact }: { s: OpState; compact?: boolean }) {
  const ui = useUi();
  const [text, setText] = useState("");
  const [level, setLevel] = useState<Broadcast["level"]>("normal");
  const [aud, setAud] = useState<"all" | "crews" | "zones">("all");
  const [crews, setCrews] = useState<CrewId[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const audience: Audience = aud === "all" ? { all: true } : aud === "crews" ? { crews } : { zones };
  const ok = text.trim() && (aud === "all" || (aud === "crews" ? crews.length : zones.length));
  const send = () => {
    if (!ok) return;
    op.sendBroadcast(text.trim(), level, audience, ui.me);
    ui.toast(level === "critical" ? "Critical broadcast sent · breaks through mute" : "Broadcast sent");
    setText("");
    setLevel("normal");
  };
  const tog = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className={`${c.composerBox} ${level === "critical" ? c.composerCritical : ""}`}>
      <textarea
        className={c.input}
        rows={compact ? 2 : 3}
        placeholder="Doors open in 10 minutes. All crews to positions."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={c.composerRow}>
        <span className={c.composerLabel}>To</span>
        <Segmented value={aud} onChange={setAud} options={[{ id: "all", label: "Everyone" }, { id: "crews", label: "Crews" }, { id: "zones", label: "Zones" }]} />
      </div>
      {aud === "crews" && (
        <div className={c.codes}>{CREWS.filter((x) => x.id !== "command").map((x) => <button key={x.id} className={crews.includes(x.id) ? c.codeOn : undefined} onClick={() => setCrews(tog(crews, x.id))}>{x.name}</button>)}</div>
      )}
      {aud === "zones" && (
        <div className={c.codes}>{s.zones.map((z) => <button key={z.id} className={zones.includes(z.id) ? c.codeOn : undefined} onClick={() => setZones(tog(zones, z.id))}>{z.code}</button>)}</div>
      )}
      <div className={c.composerRow}>
        <span className={c.composerLabel}>Level</span>
        <Segmented value={level} onChange={setLevel} options={[{ id: "normal", label: "Normal" }, { id: "critical", label: "Critical" }]} />
      </div>
      {level === "critical" && <p className={c.criticalNote}><IconAlert size={13} />Full screen on every phone, ignores mute and Do Not Disturb, needs “Got it”.</p>}
      <button className={level === "critical" ? c.btnDanger : c.btnPrimary} disabled={!ok} onClick={send}>
        {level === "critical" ? "Send critical broadcast" : "Send broadcast"}
      </button>
      {!compact && <LastBroadcasts s={s} />}
    </div>
  );
}

function LastBroadcasts({ s }: { s: OpState }) {
  const ui = useUi();
  return (
    <div className={c.lastBc}>
      {[...s.broadcasts].reverse().slice(0, 2).map((b) => (
        <BroadcastItem key={b.id} s={s} b={b} onRemind={() => { const n = op.remind(b.id, ui.me); ui.toast(`Reminded ${n} people`); }} />
      ))}
    </div>
  );
}

/* ---- the feed ---- */

export function FeedList({ s, limit = 30 }: { s: OpState; limit?: number }) {
  const ui = useUi();
  const items = [...s.feed].reverse().slice(0, limit);
  return (
    <ol className={c.feed}>
      {items.map((e) => <FeedRow key={e.id} s={s} e={e} now={ui.now} />)}
    </ol>
  );
}

function FeedRow({ s, e, now }: { s: OpState; e: FeedEvent; now: number }) {
  const ui = useUi();
  let icon = "•";
  let body: React.ReactNode = null;
  const zl = (id?: string | null) => { const z = zoneOf(s, id); return z ? <button className={c.codeLink} onClick={() => ui.openZone(z.id)}>{z.code}</button> : <span>—</span>; };
  switch (e.kind) {
    case "checkin": icon = "→"; body = <>{firstName(e.userId)} checked in to {zl(e.zoneId)}{e.via === "qr" ? " by QR" : ""}</>; break;
    case "checkout": icon = "←"; body = <>{firstName(e.userId)} left {zl(e.zoneId)}</>; break;
    case "move": icon = "↔"; body = <>{firstName(e.userId)} moved {e.fromZoneId ? <>{zl(e.fromZoneId)} → </> : "to "}{zl(e.zoneId)}</>; break;
    case "request": {
      const r = s.requests.find((x) => x.id === e.requestId);
      icon = r?.kind === "issue" ? "⚠" : "✋";
      body = r ? <>{firstName(e.by)} raised <b>{requestTitle(s, r)}</b>{r.urgency === "urgent" ? <span className={c.feedUrgent}> urgent</span> : null}</> : null; break;
    }
    case "decision": {
      const r = s.requests.find((x) => x.id === e.requestId);
      icon = e.approved ? "✓" : "✕";
      body = r ? <>{firstName(e.by)} {e.approved ? "approved" : "declined"} <b>{requestTitle(s, r)}</b> · {ago(e.at - r.at)}</> : null; break;
    }
    case "broadcast": {
      const b = s.broadcasts.find((x) => x.id === e.broadcastId);
      if (!b) return null;
      const aud = op.audienceSize(s, b);
      const read = Math.min(aud, Object.keys(b.acks).length);
      icon = "📣";
      body = <>{b.level === "critical" ? <span className={c.feedCritical}>Critical · </span> : null}“{b.text}” <span className={c.feedMeta}>{read}/{aud} read</span></>; break;
    }
    case "remind": icon = "🔔"; body = <>{firstName(e.by)} reminded {e.count} who hadn’t read</>; break;
    case "task": {
      const t = s.tasks.find((x) => x.id === e.taskId);
      icon = "☑";
      body = t ? <>{firstName(e.by)} finished <b>{t.title}</b> in {zl(t.zoneId)}</> : null; break;
    }
    case "zone": icon = "◉"; body = <>{firstName(e.by)} set {zl(e.zoneId)} to <span className={c[`fs_${e.status}`]}>{STATUS_LABEL[e.status]}</span></>; break;
  }
  if (!body) return null;
  return (
    <li className={c.feedRow}>
      <span className={c.feedIcon} aria-hidden="true">{icon}</span>
      <span className={c.feedBody}>{body}</span>
      <time className={c.feedTime} title={clock(e.at)}>{ago(now - e.at)}</time>
    </li>
  );
}

export { Av, Code, staffing };
