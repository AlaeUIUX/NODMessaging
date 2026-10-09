"use client";

import type { ReactNode } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { dayKey } from "@/lib/chat/mind";
import { money } from "@/lib/chat/ops";
import { priorityRank, PRIORITIES } from "@/lib/chat/project";
import { userById } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import { chartOf, type Widget, type WidgetSize } from "@/lib/chat/widgets";
import type { BoardSummary, BoardTask, DashData, NeedsCategory } from "./Analytics";
import { NEEDS_ACTION, NEEDS_INK, NEEDS_TONE, STALLED_AFTER } from "./Analytics";
import {
  BigMoney, BLUE, ChecklistTrack, clock, DAY, dayLabel, Gauge, monthName, NeedsBlocks, people, plural, prevMonthName,
  shortDate, Trend, until, weekday, WEEK, type Upcoming,
} from "./AnalyticsParts";
import Avatar from "./Avatar";
import { DonutChart, PartBars, StackedBar, TrendChart, type Part, type Point, type Trend as TrendKind } from "./Charts";
import { IconCheck } from "./Icons";
import { Sheet } from "./ui";
import s from "./activity.module.css";
import g from "./widgets.module.css";

/**
 * What each widget shows, for each of its sizes and views. A small widget is
 * one number and a line; medium adds the chart or the first few rows; large
 * gets the whole picture. Tapping a row opens it; tapping the rest of the
 * widget opens its full list.
 */

type Open = (chat: Chat, message: Message) => void;
interface BodyProps { w: Widget; d: DashData; now: number; me: string; open: Open; sheet: (kind: string) => void }

/** A row's tap is its own, not the widget's. */
const tap = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
const rows = (size: WidgetSize, medium: number, large: number) => (size === "small" ? 1 : size === "medium" ? medium : large);
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export function WidgetBody(p: BodyProps) {
  switch (p.w.kind) {
    case "spend": return <Spend {...p} />;
    case "balances": return <Balances {...p} />;
    case "needs": return <Needs {...p} />;
    case "tasks": return <Tasks {...p} />;
    case "boards": return <Boards {...p} />;
    case "checklists": return <Checklists {...p} />;
    case "polls": return <Polls {...p} />;
    case "plans": return <Plans {...p} />;
    case "next": return <Next {...p} />;
    case "week": return <Week {...p} />;
    case "messages": return <Messages {...p} />;
  }
}

/* ---------------------------------------------------------------------------
   Pieces every widget uses
--------------------------------------------------------------------------- */

function Big({ children, label, tone, size }: { children: ReactNode; label?: ReactNode; tone?: string; size?: WidgetSize }) {
  return (
    <div className={g.bigRow}>
      <b className={`${g.big} ${size === "large" ? g.bigLarge : ""}`} style={tone ? { color: tone } : undefined}>{children}</b>
      {label && <span className={g.bigLabel}>{label}</span>}
    </div>
  );
}

function Line({ dot, title, sub, right, onClick }: { dot?: string | ReactNode; title: string; sub?: string; right?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={g.line} onClick={onClick ? tap(onClick) : undefined}>
      {typeof dot === "string" ? <i className={g.lineDot} style={{ background: dot }} /> : dot}
      <span className={g.lineText}><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {right !== undefined && <span className={g.lineRight}>{right}</span>}
    </Tag>
  );
}

function Empty({ children, done }: { children: ReactNode; done?: boolean }) {
  return (
    <p className={g.empty}>
      {done && <span className={g.emptyCheck}><IconCheck size={12} /></span>}
      {children}
    </p>
  );
}

/** One bar split into parts, widths by value. */
function Split({ parts, thick }: { parts: { value: number; color: string }[]; thick?: boolean }) {
  const total = parts.reduce((n, x) => n + x.value, 0);
  return (
    <span className={`${g.split} ${thick ? g.splitThick : ""}`} aria-hidden="true">
      {total === 0 ? <i style={{ flex: 1, background: "var(--fill-2)" }} /> : parts.filter((x) => x.value > 0).map((x, i) => <i key={i} style={{ flex: x.value, background: x.color }} />)}
    </span>
  );
}

/** A labelled share of a whole, with its figure. */
function Meter({ label, value, of, right, color, onClick }: { label: string; value: number; of: number; right: ReactNode; color?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={g.meter} onClick={onClick ? tap(onClick) : undefined}>
      <span className={g.meterTop}><b>{label}</b><em>{right}</em></span>
      <span className={g.meterTrack}><i style={{ width: `${Math.min(100, pct(value, of))}%`, background: color }} /></span>
    </Tag>
  );
}

/** A legend for parts: colour, figure, name. */
function PartLegend({ parts }: { parts: Part[] }) {
  return (
    <ul className={g.legend}>
      {parts.map((x) => <li key={x.key}><i style={{ background: x.color }} /><b>{x.value}</b><span>{x.label}</span></li>)}
    </ul>
  );
}

const count = (n: number) => String(n);
/** Whole euros for an axis: "€1.2k", "€340". */
export const euroShort = (cents: number) => {
  const e = cents / 100;
  return e >= 1000 ? `€${(e / 1000).toFixed(e >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : `€${Math.round(e)}`;
};

/**
 * This month's spending, day by day: running totals against last month's (to
 * the same day), or (bars) what went out each day.
 */
export function spendSeries(d: DashData, kind: TrendKind): Point[] {
  const cur = d.spendCurCum;
  const prev = d.spendPrevCum;
  const at = new Date(d.heroNow);
  const mon = at.toLocaleDateString(undefined, { month: "short" });
  return Array.from({ length: Math.max(cur.length, prev.length) }, (_, i) => {
    const day = i + 1;
    const label = `${mon} ${day}`;
    if (kind === "bars") return { x: String(day), label, value: cur[i] === undefined ? undefined : cur[i] - (cur[i - 1] ?? 0) };
    return { x: String(day), label, value: cur[i], compare: prev[i] };
  });
}
export const spendTicks = (d: DashData) => {
  const n = Math.max(d.spendCurCum.length, d.spendPrevCum.length);
  return ["1", "8", "15", "22", String(n)].filter((x, i, a) => Number(x) <= n && a.indexOf(x) === i);
};

const dueText = (due: number, now: number) => (due < now ? "Overdue" : due - now > WEEK ? shortDate(due) : dayLabel(due, now));

/* ---------------------------------------------------------------------------
   Money
--------------------------------------------------------------------------- */

function Spend({ w, d, open }: BodyProps) {
  const delta = d.spentLastMonth ? d.spent - d.spentLastMonth : null;
  const deltaLine = delta !== null && (
    <p className={g.delta}>
      <b className={delta <= 0 ? s.deltaGood : s.deltaBad}>{delta <= 0 ? "↓" : "↑"} {money(Math.abs(delta))}</b>
      {w.size === "small" ? ` vs ${prevMonthName(d.heroNow).slice(0, 3)}` : ` ${delta <= 0 ? "less" : "more"} than ${prevMonthName(d.heroNow)}`}
    </p>
  );
  const label = <span className={g.cap}>Spent in {monthName(d.heroNow)}</span>;

  if (w.view === "top") {
    const list = [...d.spentRows.map((r) => ({ key: r.key, title: r.title, amount: r.amount, go: () => open(r.chat, r.message) })), { key: "other", title: "Everyday spending", amount: d.spentOther, go: undefined }]
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const max = list[0]?.amount ?? 1;
    return (
      <div className={g.col}>
        {w.size === "medium" ? <span className={g.cap}>{money(d.spent)} spent in {monthName(d.heroNow)}</span> : <>{label}<Big size={w.size}><BigMoney cents={d.spent} /></Big></>}
        <div className={g.stack}>
          {list.slice(0, rows(w.size, 2, 5)).map((r) => (
            <Meter key={r.key} label={r.title} value={r.amount} of={max} right={money(r.amount)} onClick={r.go} />
          ))}
        </div>
      </div>
    );
  }

  const kind = chartOf(w) as TrendKind;
  const data = spendSeries(d, kind);
  const names: Record<string, string> = kind === "bars" ? { value: "spent that day" } : { value: monthName(d.heroNow), compare: prevMonthName(d.heroNow) };
  const mon = new Date(d.heroNow).toLocaleDateString(undefined, { month: "short" });
  if (w.size === "small") {
    return (
      <div className={g.col}>
        {label}
        <Big><BigMoney cents={d.spent} /></Big>
        {deltaLine}
        <div className={g.spark}><TrendChart mini data={data} kind={kind} format={money} names={names} /></div>
      </div>
    );
  }
  if (w.size === "medium") {
    return (
      <div className={g.sideBySide}>
        <div className={`${g.col} ${g.figures}`}>
          {label}
          <Big><BigMoney cents={d.spent} /></Big>
          {deltaLine}
        </div>
        <div className={g.chartFill}><TrendChart data={data} kind={kind} format={money} names={names} /></div>
      </div>
    );
  }
  return (
    <div className={g.col}>
      {label}
      <Big size="large"><BigMoney cents={d.spent} /></Big>
      {deltaLine}
      <div className={g.chartGrow}>
        <TrendChart data={data} kind={kind} format={money} axisFormat={euroShort} names={names} xTicks={spendTicks(d)} xFormat={(x) => (x === "1" && kind !== "bars" ? `1 ${mon}` : x)} yAxis />
      </div>
    </div>
  );
}

function Balances({ w, d, me, sheet, open }: BodyProps) {
  // A one-sided widget is titled "You owe" / "Owed to you" already; both sides label themselves.
  const labelled = w.view === "both";
  const owe = (compact?: boolean) => (
    <button className={g.balance} onClick={tap(() => sheet("owe"))}>
      {labelled && <span className={s.balLabel}><i style={{ background: "var(--warn)" }} />You owe</span>}
      <b className={compact ? g.balSmall : g.balNum}><BigMoney cents={d.youOwe} /></b>
      {!compact && (d.oweRows.length ? <span className={g.pill}>Settle up</span> : <span className={g.cap}>All settled</span>)}
    </button>
  );
  const owed = (compact?: boolean) => (
    <button className={g.balance} onClick={tap(() => sheet("owed"))}>
      {labelled && <span className={s.balLabel}><i style={{ background: "var(--ok)" }} />Owed to you</span>}
      <b className={compact ? g.balSmall : g.balNum}><BigMoney cents={d.owedToYou} /></b>
      {!compact && (d.owedByIds.size > 0 ? (
        <span className={`${s.faces} ${g.balFoot}`}>
          {[...d.owedByIds].slice(0, 3).map((id) => {
            const u = userById(id);
            return <Avatar key={id} glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={24} shape="circle" />;
          })}
          <em>{people(d.owedByIds.size)}</em>
        </span>
      ) : <span className={g.pill}>Request money</span>)}
    </button>
  );

  if (w.view === "both") {
    return w.size === "small"
      ? <div className={g.stack}>{owe(true)}{owed(true)}</div>
      : <div className={g.halves}>{owe()}{owed()}</div>;
  }
  const mine = w.view === "owe";
  if (w.size === "small") return mine ? owe() : owed();
  const list = mine ? d.oweRows : d.owedRows;
  return (
    <div className={g.sideBySide}>
      {mine ? owe() : owed()}
      <div className={g.stack}>
        {list.length === 0 ? <Empty done>{mine ? "You don’t owe anyone." : "Nobody owes you."}</Empty> : list.slice(0, 2).map((r) => (
          <Line key={r.key} title={r.title} sub={`${r.detail} · ${chatIdentity(r.chat, me, userById).label}`} right={money(r.amount)} onClick={() => open(r.chat, r.message)} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Together
--------------------------------------------------------------------------- */

const NEEDS: NeedsCategory[] = ["Votes", "RSVP", "Payment", "Request"];

function Needs({ w, d, me, open }: BodyProps) {
  const n = d.needsEntries.length;
  if (n === 0) return <div className={g.col}><Big tone="var(--ok)">0</Big><Empty done>Nothing is waiting on you.</Empty></div>;
  const parts = NEEDS.map((c) => ({ value: d.needsCounts[c], color: NEEDS_TONE[c] }));
  const kinds = NEEDS.filter((c) => d.needsCounts[c]).map((c) => `${d.needsCounts[c]} ${c === "Votes" ? "to vote" : c === "RSVP" ? "to answer" : c === "Payment" ? "to pay" : "to review"}`);
  const list = (count: number) => (
    <div className={g.stack}>
      {d.needsEntries.slice(0, count).map((it) => (
        <Line key={it.key} dot={NEEDS_TONE[it.category]} title={it.title} sub={`${it.detail} · ${chatIdentity(it.chat, me, userById).label}`} right={<span className={g.pill}>{NEEDS_ACTION[it.category]}</span>} onClick={() => open(it.chat, it.message)} />
      ))}
    </div>
  );

  const chart = chartOf(w);
  const pieces: Part[] = NEEDS.map((c) => ({ key: c, label: c, value: d.needsCounts[c], color: NEEDS_TONE[c] }));
  if (w.size === "small") {
    if (w.view !== "list" && chart === "donut") {
      return (
        <div className={g.colCenter}>
          <div className={g.donutSmall}><DonutChart mini parts={pieces} format={count} center={<span className={g.donutCenter}><b>{n}</b>waiting</span>} /></div>
          <span className={g.cap}>{kinds.slice(0, 2).join(" · ")}</span>
        </div>
      );
    }
    return (
      <div className={g.col}>
        <Big label="waiting on you">{n}</Big>
        {w.view === "list" ? <p className={g.clamp}>{d.needsEntries[0].title}</p>
          : chart === "bars" ? <div className={g.spark}><PartBars mini parts={pieces} format={count} /></div>
          : <><Split parts={parts} thick /><span className={g.cap}>{kinds.slice(0, 2).join(" · ")}</span></>}
      </div>
    );
  }
  if (w.view === "list") {
    return (
      <div className={g.col}>
        {w.size === "medium" ? <span className={g.cap}>{n} waiting on you</span> : <Big label="waiting on you" size="large">{n}</Big>}
        {list(rows(w.size, 2, 5))}
      </div>
    );
  }
  if (chart === "donut") {
    return (
      <div className={g.col}>
        <div className={g.donutRow}>
          <DonutChart parts={pieces} format={count} center={<span className={g.donutCenter}><b>{n}</b>waiting</span>} />
          <PartLegend parts={pieces} />
        </div>
        {w.size === "large" && list(3)}
      </div>
    );
  }
  if (chart === "bars") {
    return (
      <div className={g.col}>
        <Big label="waiting on you">{n}</Big>
        <div className={g.chartGrow}><PartBars parts={pieces} format={count} /></div>
        {w.size === "large" && list(2)}
      </div>
    );
  }
  return (
    <div className={g.col}>
      <Big label="waiting on you" size={w.size}>{n}</Big>
      <div className={g.blocksTight}>
        <NeedsBlocks blocks={NEEDS.map((c) => ({ label: c, value: d.needsCounts[c], color: NEEDS_TONE[c], ink: NEEDS_INK[c] }))} />
      </div>
      {w.size === "large" && list(4)}
    </div>
  );
}

function Polls({ w, d, now, me, open }: BodyProps) {
  const waiting = d.polls.filter((p) => p.open && !p.voted);
  if (w.view === "waiting") {
    if (waiting.length === 0) {
      return <div className={g.col}><Big tone="var(--ok)">0</Big><Empty done>You’ve voted on every open poll.</Empty></div>;
    }
    if (w.size === "small") {
      return (
        <div className={g.col}>
          <Big label="to vote on">{waiting.length}</Big>
          <button className={g.clampBtn} onClick={tap(() => open(waiting[0].chat, waiting[0].message))}>{waiting[0].question}</button>
          <span className={g.cap}>Closes {until(waiting[0].closesAt - now)}</span>
        </div>
      );
    }
    return (
      <div className={g.col}>
        {w.size === "medium" ? <span className={g.cap}>{waiting.length} to vote on</span> : <Big label="to vote on" size="large">{waiting.length}</Big>}
        <div className={g.stack}>
          {waiting.slice(0, rows(w.size, 2, 5)).map((p) => (
            <Line key={p.key} title={p.question} sub={`Closes ${until(p.closesAt - now)} · ${chatIdentity(p.chat, me, userById).label}`} right={<span className={g.pill}>Vote</span>} onClick={() => open(p.chat, p.message)} />
          ))}
        </div>
      </div>
    );
  }
  // Results: what's winning, newest polls first.
  const shown = d.polls.filter((p) => p.voters > 0).slice(0, w.size === "large" ? 2 : 1);
  if (shown.length === 0) return <Empty>No votes yet in your polls.</Empty>;
  return (
    <div className={g.stack}>
      {shown.map((p) => (
        <button key={p.key} className={g.poll} onClick={tap(() => open(p.chat, p.message))}>
          <b className={w.size === "small" ? g.clamp : g.oneLine}>{p.question}</b>
          {p.options.slice(0, w.size === "small" ? 1 : w.size === "medium" ? 2 : 3).map((o, i) => (
            <span key={o.label} className={g.pollOpt}>
              <span className={g.meterTop}><b>{o.label}{o.mine ? " ✓" : ""}</b><em>{pct(o.votes, p.voters)}%</em></span>
              <span className={g.meterTrack}><i style={{ width: `${pct(o.votes, p.voters)}%`, background: i === 0 ? "var(--accent)" : "var(--ink-3)" }} /></span>
            </span>
          ))}
          {w.size !== "small" && <small className={g.cap}>{plural(p.voters, "vote")} · {p.open ? `closes ${until(p.closesAt - now)}` : "closed"}</small>}
        </button>
      ))}
    </div>
  );
}

function Plans({ w, d, now, open }: BodyProps) {
  if (d.plans.length === 0) return <Empty>Plans from your chats show up here.</Empty>;
  if (w.view === "next") {
    const stops = d.plans.flatMap((p) => p.next.map((x) => ({ ...x, plan: p }))).sort((a, b) => a.at - b.at);
    if (stops.length === 0) return <Empty done>Every stop is done.</Empty>;
    const when = (x: (typeof stops)[number]) => `${dayLabel(x.at, now)}${x.timed ? ` · ${clock(x.at)}` : ""}`;
    if (w.size === "small") {
      const x = stops[0];
      return (
        <button className={g.colBtn} onClick={tap(() => open(x.plan.chat, x.plan.message))}>
          <span className={g.cap}>{when(x)}</span>
          <b className={g.clampBig}>{x.title}</b>
          <span className={g.cap}>{x.plan.title}{x.place ? ` · ${x.place}` : ""}</span>
        </button>
      );
    }
    return (
      <div className={g.stack}>
        {stops.slice(0, rows(w.size, 2, 6)).map((x) => (
          <Line key={x.key} title={x.title} sub={`${x.plan.title}${x.place ? ` · ${x.place}` : ""}`} right={when(x)} onClick={() => open(x.plan.chat, x.plan.message)} />
        ))}
      </div>
    );
  }
  if (w.size === "small") {
    const p = d.plans[0];
    return (
      <button className={g.colBtn} onClick={tap(() => open(p.chat, p.message))}>
        <span className={g.cap}>{p.title}</span>
        <Big label="done">{pct(p.done, p.total)}%</Big>
        <Split parts={[{ value: p.done, color: "var(--accent)" }, { value: p.total - p.done, color: "var(--fill-2)" }]} thick />
        <span className={g.cap}>{p.done} of {plural(p.total, "stop")}</span>
      </button>
    );
  }
  return (
    <div className={g.stack}>
      {d.plans.slice(0, rows(w.size, 2, 6)).map((p) => (
        <Meter key={p.key} label={p.title} value={p.done} of={p.total} right={`${p.done}/${p.total}`} color="var(--accent)" onClick={() => open(p.chat, p.message)} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Work: your tasks, every board, checklists
--------------------------------------------------------------------------- */

function Tasks({ w, d, now, me, open }: BodyProps) {
  const { todo, inProgress, done } = d.byStage;
  const total = todo + inProgress + done;
  const mine = d.boardTasks.filter((t) => t.task.assignee === me && t.stage !== "done");
  if (total === 0) return <Empty>Tasks assigned to you, on any board, show up here.</Empty>;

  if (w.view === "due") {
    const dated = mine.filter((t) => t.task.due !== null).sort((a, b) => a.task.due! - b.task.due!);
    const soon = dated.filter((t) => t.task.due! < now + WEEK);
    if (w.size === "small") {
      const first = dated[0];
      return (
        <div className={g.col}>
          <Big label="due this week" tone={d.overdueTasks ? "var(--bad)" : undefined}>{soon.length}</Big>
          {first && <button className={g.clampBtn} onClick={tap(() => open(first.chat, first.message))}>{first.task.title}</button>}
          {first && <span className={first.task.due! < now ? g.capBad : g.cap}>{dueText(first.task.due!, now)}</span>}
        </div>
      );
    }
    return (
      <div className={g.stack}>
        {dated.length === 0 ? <Empty>None of your tasks has a due date.</Empty> : dated.slice(0, rows(w.size, 2, 6)).map((t) => (
          <Line key={t.task.id} dot={priorityTone(t)} title={t.task.title} sub={t.board} right={<span className={t.task.due! < now ? g.late : undefined}>{dueText(t.task.due!, now)}</span>} onClick={() => open(t.chat, t.message)} />
        ))}
      </div>
    );
  }

  const gauge = (size: number) => (
    <span className={s.gaugeWrap} style={{ width: size }}>
      <Gauge segments={[{ value: todo, color: BLUE.a4 }, { value: inProgress, color: BLUE.a2 }, { value: done, color: BLUE.base }]} />
      <span className={s.gc}><b>{total}</b><span>Your tasks</span></span>
    </span>
  );
  const chart = chartOf(w);
  const stages: Part[] = [
    { key: "todo", label: "To do", value: todo, color: BLUE.a4 },
    { key: "doing", label: "In progress", value: inProgress, color: BLUE.a2 },
    { key: "done", label: "Done", value: done, color: BLUE.base },
  ];
  const foot = <span className={d.overdueTasks ? g.capBad : g.cap}>{d.overdueTasks ? `${d.overdueTasks} overdue` : `${todo + inProgress} open`}</span>;
  if (w.size === "small") {
    if (chart === "donut") {
      return (
        <div className={g.colCenter}>
          <div className={g.donutSmall}><DonutChart mini parts={stages} format={count} center={<span className={g.donutCenter}><b>{total}</b>tasks</span>} /></div>
          {foot}
        </div>
      );
    }
    if (chart === "bars") return <div className={g.col}><Big label="your tasks">{total}</Big><div className={g.chartGrow}><PartBars mini parts={stages} format={count} /></div>{foot}</div>;
    return (
      <div className={g.colCenter}>
        {gauge(130)}
        {foot}
      </div>
    );
  }
  return (
    <div className={g.col}>
      {chart === "donut" ? (
        <div className={g.donutRow}>
          <DonutChart parts={stages} format={count} center={<span className={g.donutCenter}><b>{total}</b>your tasks</span>} />
          <PartLegend parts={stages} />
        </div>
      ) : chart === "bars" ? (
        <div className={w.size === "large" ? g.chartFixed : g.chartGrow}><PartBars parts={stages} format={count} /></div>
      ) : (
        <div className={s.tasksRow}>
          {gauge(140)}
          <ul className={s.tl}>
            <li><i style={{ background: BLUE.a4 }} /><b>{todo}</b><span>To do</span></li>
            <li><i style={{ background: BLUE.a2 }} /><b>{inProgress}</b><span>In progress</span></li>
            <li><i style={{ background: BLUE.base }} /><b>{done}</b><span>Done</span></li>
          </ul>
        </div>
      )}
      {w.size === "large" && (
        <div className={g.stack}>
          <span className={g.capHead}>Due next{d.overdueTasks ? <em className={g.late}> · {d.overdueTasks} overdue</em> : null}</span>
          {mine.filter((t) => t.task.due !== null).sort((a, b) => a.task.due! - b.task.due!).slice(0, 4).map((t) => (
            <Line key={t.task.id} dot={priorityTone(t)} title={t.task.title} sub={t.board} right={<span className={t.task.due! < now ? g.late : undefined}>{dueText(t.task.due!, now)}</span>} onClick={() => open(t.chat, t.message)} />
          ))}
        </div>
      )}
    </div>
  );
}

const PRIORITY_TONE = { high: "var(--bad)", medium: "var(--warn)", low: BLUE.a2, none: "var(--line-2)" } as const;
const priorityTone = (t: BoardTask) => PRIORITY_TONE[t.task.priority ?? "none"];

export interface BoardGroup { id: string; label: string; tone: string; tasks: BoardTask[] }

/** Open tasks, grouped the way the view asks. Shared by the widget and its sheet. */
export function groupBoardTasks(all: BoardTask[], view: string, now: number): BoardGroup[] {
  const open = all.filter((t) => t.stage !== "done");
  const byDue = (a: BoardTask, b: BoardTask) => (a.task.due ?? Infinity) - (b.task.due ?? Infinity) || a.task.order - b.task.order;
  if (view === "priority") {
    return [...PRIORITIES.map((p) => ({ id: p.id, label: p.label, tone: PRIORITY_TONE[p.id] })), { id: "none", label: "No priority", tone: PRIORITY_TONE.none }]
      .map((x) => ({ ...x, tasks: open.filter((t) => (t.task.priority ?? "none") === x.id).sort(byDue) }));
  }
  if (view === "deadlines") {
    const today = dayKey(now);
    const bucket = (t: BoardTask) => {
      const due = t.task.due;
      if (due === null) return "none";
      if (due < now) return "late";
      if (dayKey(due) === today) return "today";
      return due < now + WEEK ? "week" : "later";
    };
    return [
      { id: "late", label: "Overdue", tone: "var(--bad)" },
      { id: "today", label: "Today", tone: "var(--warn)" },
      { id: "week", label: "This week", tone: BLUE.a2 },
      { id: "later", label: "Later", tone: BLUE.a3 },
      { id: "none", label: "No date", tone: "var(--line-2)" },
    ].map((x) => ({ ...x, tasks: open.filter((t) => bucket(t) === x.id).sort(byDue) }));
  }
  if (view === "missing") {
    return [
      { id: "who", label: "No one on it", tone: "var(--warn)", tasks: open.filter((t) => !t.task.assignee).sort(byDue) },
      { id: "due", label: "No due date", tone: BLUE.a2, tasks: open.filter((t) => t.task.due === null).sort((a, b) => priorityRank(a.task.priority) - priorityRank(b.task.priority)) },
    ];
  }
  if (view === "stalled") {
    return [{ id: "stalled", label: "Untouched for 3+ days", tone: "var(--ink-3)", tasks: open.filter((t) => now - t.touched >= STALLED_AFTER).sort((a, b) => a.touched - b.touched) }];
  }
  // By board.
  const keys = [...new Set(open.map((t) => t.boardKey))];
  return keys.map((k) => {
    const tasks = open.filter((t) => t.boardKey === k).sort(byDue);
    return { id: k, label: tasks[0].board, tone: "var(--accent)", tasks };
  });
}

function Boards({ w, d, now, open }: BodyProps) {
  const all = w.board ? d.boardTasks.filter((t) => t.boardKey === w.board) : d.boardTasks;
  const boards = w.board ? d.boards.filter((b) => b.key === w.board) : d.boards;
  if (all.length === 0) return <Empty>Tasks on your boards show up here.</Empty>;
  const openCount = all.filter((t) => t.stage !== "done").length;
  const groups = groupBoardTasks(all, w.view, now);
  const taskLine = (t: BoardTask, right?: ReactNode) => (
    <Line key={`${t.task.id}:${right ? "r" : ""}`} dot={priorityTone(t)} title={t.task.title} sub={`${t.board}${t.task.assignee ? ` · ${userById(t.task.assignee).name}` : ""}`} right={right ?? (t.task.due !== null ? <span className={t.task.due < now ? g.late : undefined}>{dueText(t.task.due, now)}</span> : undefined)} onClick={() => open(t.chat, t.message)} />
  );
  const legend = (list: BoardGroup[]) => (
    <ul className={g.legend}>
      {list.map((x) => <li key={x.id}><i style={{ background: x.tone }} /><b>{x.tasks.length}</b><span>{x.label}</span></li>)}
    </ul>
  );

  if (w.view === "project") {
    const done = boards.reduce((n, b) => n + b.done, 0);
    const total = boards.reduce((n, b) => n + b.todo + b.doing + b.done, 0);
    const stages = (b: BoardSummary) => [{ value: b.done, color: BLUE.base }, { value: b.doing, color: BLUE.a2 }, { value: b.todo, color: BLUE.a4 }];
    if (w.size === "small") {
      return (
        <div className={g.col}>
          <Big label="done">{pct(done, total)}%</Big>
          <Split parts={[{ value: done, color: BLUE.base }, { value: total - done, color: BLUE.a4 }]} thick />
          <span className={g.cap}>{plural(boards.length, "board")} · {openCount} open</span>
        </div>
      );
    }
    return (
      <div className={g.stack}>
        {w.size === "large" && (
          <ul className={g.legend}>
            <li><i style={{ background: BLUE.base }} /><span>Done</span></li>
            <li><i style={{ background: BLUE.a2 }} /><span>Doing</span></li>
            <li><i style={{ background: BLUE.a4 }} /><span>To do</span></li>
          </ul>
        )}
        {boards.slice(0, rows(w.size, 2, 6)).map((b) => (
          <button key={b.key} className={g.meter} onClick={tap(() => open(b.chat, b.message))}>
            <span className={g.meterTop}><b>{b.name}</b><em>{b.done}/{b.todo + b.doing + b.done}</em></span>
            <Split parts={stages(b)} />
          </button>
        ))}
      </div>
    );
  }

  if (w.view === "deadlines") {
    const late = groups[0].tasks.length;
    const days = Array.from({ length: 7 }, (_, i) => now + i * DAY);
    const perDay = days.map((t) => all.filter((x) => x.stage !== "done" && x.task.due !== null && x.task.due >= now && dayKey(x.task.due) === dayKey(t)).length);
    const heaviest = Math.max(...perDay);
    if (w.size === "small") {
      return (
        <div className={g.col}>
          <Big label="overdue" tone={late ? "var(--bad)" : "var(--ok)"}>{late}</Big>
          <span className={g.cap}>{perDay.reduce((n, x) => n + x, 0)} due this week</span>
          {heaviest > 0 && <span className={g.cap}>Busiest: {weekday(days[perDay.indexOf(heaviest)])}</span>}
        </div>
      );
    }
    const soft = "color-mix(in srgb, var(--accent) 32%, var(--surface))";
    const series: Point[] = [
      { x: "late", label: "Overdue", value: late, color: late ? "var(--bad)" : soft },
      // Only a real pile-up is marked: the heaviest day, when it has two or more.
      ...days.map((t, i) => ({
        x: dayKey(t),
        label: i === 0 ? "Today" : new Date(t).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }),
        value: perDay[i],
        color: heaviest > 1 && perDay[i] === heaviest ? "var(--accent)" : soft,
      })),
    ];
    const short = (x: string) => (x === "late" ? "Late" : x === dayKey(now) ? "Today" : weekday(new Date(`${x}T12:00`).getTime()).slice(0, 2));
    const chart = (
      <div className={w.size === "large" ? g.chartFixed : g.chartGrow}>
        <TrendChart data={series} kind={chartOf(w) === "line" ? "line" : "bars"} format={(n) => `${n} due`} names={{}} xTicks={series.map((p) => p.x)} xFormat={short} endDot={false} />
      </div>
    );
    if (w.size === "medium") return chart;
    return (
      <div className={g.col}>
        {chart}
        <div className={g.stack}>{[...groups[0].tasks, ...groups[1].tasks, ...groups[2].tasks].slice(0, 3).map((t) => taskLine(t))}</div>
      </div>
    );
  }

  if (w.view === "missing") {
    const [who, due] = groups;
    const missing = new Set([...who.tasks, ...due.tasks].map((t) => t.task.id)).size;
    if (w.size === "small") {
      return (
        <div className={g.col}>
          <Big label="need something" tone={missing ? "var(--warn)" : "var(--ok)"}>{missing}</Big>
          <span className={g.cap}>{who.tasks.length} with no one</span>
          <span className={g.cap}>{due.tasks.length} with no date</span>
        </div>
      );
    }
    const tag = (t: BoardTask) => [!t.task.assignee && "No one", t.task.due === null && "No date"].filter(Boolean).join(" · ");
    const list = [...new Map([...who.tasks, ...due.tasks].map((t) => [t.task.id, t])).values()];
    return (
      <div className={g.col}>
        <div className={g.tiles}>
          <div><b style={{ color: who.tasks.length ? "var(--warn)" : undefined }}>{who.tasks.length}</b><span>No one on it</span></div>
          <div><b style={{ color: due.tasks.length ? BLUE.a2 : undefined }}>{due.tasks.length}</b><span>No due date</span></div>
        </div>
        <div className={g.stack}>{list.slice(0, rows(w.size, 1, 5)).map((t) => taskLine(t, <span className={g.tag}>{tag(t)}</span>))}</div>
      </div>
    );
  }

  if (w.view === "stalled") {
    const list = groups[0].tasks;
    const age = (t: BoardTask) => `${Math.floor((now - t.touched) / DAY)}d`;
    if (list.length === 0) return <div className={g.col}><Big tone="var(--ok)">0</Big><Empty done>Everything open moved in the last 3 days.</Empty></div>;
    if (w.size === "small") {
      return (
        <div className={g.col}>
          <Big label="stalled">{list.length}</Big>
          <button className={g.clampBtn} onClick={tap(() => open(list[0].chat, list[0].message))}>{list[0].task.title}</button>
          <span className={g.cap}>Untouched {Math.floor((now - list[0].touched) / DAY)} days</span>
        </div>
      );
    }
    return (
      <div className={g.col}>
        {w.size === "medium" ? <span className={g.cap}>{list.length} open and untouched for 3+ days</span> : <Big label="open, untouched 3+ days" size="large">{list.length}</Big>}
        <div className={g.stack}>{list.slice(0, rows(w.size, 2, 5)).map((t) => taskLine(t, <span className={g.tag}>{age(t)}</span>))}</div>
      </div>
    );
  }

  // By priority.
  const high = groups[0].tasks.length;
  const chart = chartOf(w);
  const pieces: Part[] = groups.map((x) => ({ key: x.id, label: x.label, value: x.tasks.length, color: x.tone }));
  const highLine = <span className={high ? g.capBad : g.cap}>{high} high priority</span>;
  if (w.size === "small") {
    if (chart === "donut") {
      return (
        <div className={g.colCenter}>
          <div className={g.donutSmall}><DonutChart mini parts={pieces} format={count} center={<span className={g.donutCenter}><b>{openCount}</b>open</span>} /></div>
          {highLine}
        </div>
      );
    }
    return (
      <div className={g.col}>
        <Big label="open">{openCount}</Big>
        {chart === "bars" ? <div className={g.spark}><PartBars mini parts={pieces} format={count} /></div> : <StackedBar parts={pieces} format={(n) => `${n} open`} />}
        {highLine}
      </div>
    );
  }
  return (
    <div className={g.col}>
      {chart === "donut" ? (
        <div className={g.donutRow}>
          <DonutChart parts={pieces} format={(n) => `${n} open`} center={<span className={g.donutCenter}><b>{openCount}</b>open</span>} />
          <PartLegend parts={pieces} />
        </div>
      ) : chart === "bars" ? (
        <div className={w.size === "large" ? g.chartFixed : g.chartGrow}><PartBars parts={pieces} format={count} /></div>
      ) : (
        <div className={g.sideBySide}>
          <div className={g.col}>
            <Big label="open tasks" size={w.size}>{openCount}</Big>
            <StackedBar parts={pieces} format={(n) => `${n} open`} />
          </div>
          {legend(groups)}
        </div>
      )}
      {w.size === "large" && (
        <div className={g.stack}>
          <span className={g.capHead}>Top of the list</span>
          {groups.flatMap((x) => x.tasks).slice(0, 4).map((t) => taskLine(t))}
        </div>
      )}
    </div>
  );
}

/** Every task behind a board widget, grouped by its view. */
export function BoardsSheet({ tasks, view, title, now, onOpen, onClose }: {
  tasks: BoardTask[]; view: string; title: string; now: number;
  onOpen: (t: BoardTask) => void; onClose: () => void;
}) {
  const groups = groupBoardTasks(tasks, view, now).filter((x) => x.tasks.length);
  return (
    <Sheet title={title} onClose={onClose}>
      {(close) => groups.length === 0 ? (
        <p className={s.hint}>Nothing here: every task is done, or there’s none yet.</p>
      ) : groups.map((x) => (
        <div key={x.id} className={g.sheetGroup}>
          <p className={g.sheetHead}><i style={{ background: x.tone }} />{x.label}<em>{x.tasks.length}</em></p>
          <div className={s.list}>
            {x.tasks.map((t) => (
              <button key={t.task.id} className={s.row} onClick={() => close(() => onOpen(t))}>
                <i className={g.lineDot} style={{ background: priorityTone(t) }} />
                <span className={s.rowText}>
                  <b>{t.task.title}</b>
                  <small>{t.board}{t.task.assignee ? ` · ${userById(t.task.assignee).name}` : " · No one on it"}{view === "stalled" ? ` · untouched ${Math.floor((now - t.touched) / DAY)} days` : ""}</small>
                </span>
                {t.task.due !== null && <span className={`${s.time} ${t.task.due < now ? s.late : ""}`}>{dueText(t.task.due, now)}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

function Checklists({ w, d, open }: BodyProps) {
  const list = w.view === "all" ? d.checklistList : d.openChecklists;
  if (d.checklistList.length === 0) return <Empty>Checklists from your chats show up here.</Empty>;
  const overall = pct(d.listDone, d.listTotal);
  const row = (it: (typeof list)[number]) => {
    const done = it.message.card.items.filter((i) => i.doneBy).length;
    const total = it.message.card.items.length;
    return (
      <button key={it.message.id} className={g.check} onClick={tap(() => open(it.chat, it.message))}>
        <span className={g.checkName}>{it.title}</span>
        <ChecklistTrack done={done} total={total} />
        <span className={s.cc}>{done}<em>/{total}</em></span>
      </button>
    );
  };
  if (w.size === "small") {
    const first = list[0];
    return (
      <div className={g.col}>
        <Big label="ticked">{overall}%</Big>
        <span className={g.cap}>{d.listDone} of {d.listTotal} items</span>
        {first ? <span className={g.oneLine}>{first.title}</span> : <Empty done>All done</Empty>}
        {first && <ChecklistTrack done={first.message.card.items.filter((i) => i.doneBy).length} total={first.message.card.items.length} />}
      </div>
    );
  }
  return (
    <div className={g.col}>
      <Big label={`${d.listDone} of ${d.listTotal} ticked`}>{overall}%</Big>
      <div className={g.stack}>{list.length === 0 ? <Empty done>Every list is done.</Empty> : list.slice(0, rows(w.size, 2, 6)).map(row)}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Time
--------------------------------------------------------------------------- */

/** What's coming, for Up next: everything, or only events and plan stops. */
export function nextUp(d: DashData, view: string, now: number): Upcoming[] {
  return d.upcoming.filter((u) => u.at > now && (view !== "events" || u.key.startsWith("ev:") || u.key.startsWith("stop:")));
}

function Next({ w, d, now, open }: BodyProps) {
  const list = nextUp(d, w.view, now);
  if (list.length === 0) return <Empty>Nothing coming up this week.</Empty>;
  const first = list[0];
  const hero = (
    <button className={g.colBtn} onClick={tap(() => open(first.chat, first.message))}>
      <b className={g.countdown}>{until(first.at - now)}</b>
      <b className={g.clampBig}>{first.title}</b>
      <span className={g.cap}>{dayLabel(first.at, now)}{first.timed ? ` · ${clock(first.at)}` : ""}</span>
    </button>
  );
  if (w.size === "small") return hero;
  return (
    <div className={g.sideBySide}>
      {hero}
      <div className={g.stack}>
        {list.slice(1, 3).map((u) => (
          <Line key={u.key} title={u.title} sub={whenText(u, now)} onClick={() => open(u.chat, u.message)} />
        ))}
        {list.length === 1 && <Empty>Nothing else this week.</Empty>}
      </div>
    </div>
  );
}

/** When, in a row's corner: "Overdue" for a task past its date, else the day and time. */
export const whenText = (u: Upcoming, now: number) => (u.at < now ? "Overdue" : `${dayLabel(u.at, now)}${u.timed ? ` ${clock(u.at)}` : ""}`);

function Week({ w, d, now, open }: BodyProps) {
  const days = Array.from({ length: 7 }, (_, i) => now + i * DAY);
  const count = (t: number) => d.upcoming.filter((u) => dayKey(Math.max(u.at, now)) === dayKey(t)).length;
  return (
    <div className={g.col}>
      <div className={`${g.weekStrip} ${s.week}`}>
        {days.map((t, i) => (
          <div key={dayKey(t)} className={`${s.d} ${i === 0 ? s.dToday : ""}`}>
            {i === 0 ? "Today" : weekday(t)}
            <b>{new Date(t).getDate()}</b>
            <span className={s.dot}>{Array.from({ length: Math.min(3, count(t)) }, (_, j) => <i key={j} />)}</span>
          </div>
        ))}
      </div>
      {d.upcoming.length === 0 ? (
        <Empty>No events, plan stops, reminders or due tasks this week.</Empty>
      ) : w.size === "medium" ? (
        <span className={g.cap}>{plural(d.upcoming.length, "thing")} this week{nextUp(d, "all", now)[0] ? ` · next: ${nextUp(d, "all", now)[0].title}` : ""}</span>
      ) : (
        <div className={g.stack}>
          {d.upcoming.slice(0, 5).map((u) => (
            <Line key={u.key} dot={<span className={g.lineIcon}>{u.icon}</span>} title={u.title} sub={u.sub} right={<span className={u.at < now ? g.late : undefined}>{whenText(u, now)}</span>} onClick={() => open(u.chat, u.message)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Messages({ w, d, me }: BodyProps) {
  if (w.view === "chats") {
    if (d.chatsWeek.length === 0) return <Empty>No messages in the last seven days.</Empty>;
    const max = d.chatsWeek[0].n;
    if (w.size === "small") {
      const top = d.chatsWeek[0];
      const id = chatIdentity(top.chat, me, userById);
      return (
        <div className={g.col}>
          <Avatar glyph={id.glyph} tone={id.tone} photo={id.photo} size={36} shape={top.chat.kind === "dm" ? "circle" : "square"} />
          <b className={g.oneLine}>{id.label}</b>
          <span className={g.cap}>Busiest · {plural(top.n, "message")}</span>
        </div>
      );
    }
    return (
      <div className={g.stack}>
        {d.chatsWeek.slice(0, rows(w.size, 3, 6)).map(({ chat, n }) => (
          <Meter key={chat.id} label={chatIdentity(chat, me, userById).label} value={n} of={max} right={n} />
        ))}
      </div>
    );
  }
  const total = d.week.reduce((n, x) => n + x.n, 0);
  const kind = chartOf(w) as TrendKind;
  const today = d.week[d.week.length - 1]?.k;
  const soft = "color-mix(in srgb, var(--accent) 32%, var(--surface))";
  const series: Point[] = d.week.map((x) => {
    const t = new Date(`${x.k}T12:00`).getTime();
    return { x: x.k, label: x.k === today ? "Today" : new Date(t).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }), value: x.n, color: x.k === today ? "var(--accent)" : soft };
  });
  const short = (x: string) => (x === today ? "Today" : weekday(new Date(`${x}T12:00`).getTime()).slice(0, 2));
  const say = (n: number) => `${n} ${n === 1 ? "message" : "messages"}`;
  const head = (
    <div className={g.bigRow}>
      <b className={g.big}>{total}</b>
      <Trend current={total} previous={d.lastWeekMessages} />
      {w.size !== "small" && <span className={g.bigLabel}>avg {(total / 7).toFixed(1)}/day</span>}
    </div>
  );
  if (w.size === "small") return <div className={g.col}>{head}<span className={g.cap}>messages this week</span><div className={g.spark}><TrendChart mini data={series} kind={kind} format={say} names={{}} /></div></div>;
  return (
    <div className={g.col}>
      {head}
      <div className={g.chartGrow}>
        <TrendChart data={series} kind={kind} format={say} axisFormat={count} names={{}} xTicks={series.map((p) => p.x)} xFormat={short} yAxis={w.size === "large"} average={w.size === "large" ? total / 7 : undefined} />
      </div>
      {w.size === "large" && d.busiest && (
        <p className={s.busy}><span>Busiest chat</span><span><b>{chatIdentity(d.busiest.chat, me, userById).label}</b> · {d.busiest.n}</span></p>
      )}
    </div>
  );
}
