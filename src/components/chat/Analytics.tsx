"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { dayKey, lastSevenDays } from "@/lib/chat/mind";
import { billShares, doneColumn, money, unclaimedItems } from "@/lib/chat/ops";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Chat, Message } from "@/lib/chat/types";
import { outcome } from "./Artifacts";
import Avatar from "./Avatar";
import {
  IconBell, IconBoard, IconCalendar, IconChecklist, IconChevron, IconClock, IconLocation, IconMoneyReceive,
  IconMoneySend, IconPoll, IconReceipt, IconRoute,
} from "./Icons";
import Logo from "./Logo";
import { MyTasks } from "./Project";
import { Sheet, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./activity.module.css";

/**
 * Analytics: a condensed dashboard, restyled to match the agreed mockup —
 * a spend chart up top, then Needs you / Tasks / Checklists / This week /
 * Messages, each with its own chart shape. Tapping a section is what reveals
 * what's contributing to it: the itemized list opens in a sheet, never
 * sitting on the page by default.
 *
 * Where every card type lives, so nothing is ambiguously "sort of covered":
 *   payment, bill      → Money hero (spend chart) + Needs you (Payment bucket)
 *   project (boards)   → Tasks widget (stage gauge, MyTasks drill-down)
 *   checklist (items)  → Checklists widget (per-list dot tracks)
 *   checklist (a       → Needs you (Request bucket) — someone asking to edit
 *     pending `requests`) is a distinct owner decision, not open-items progress
 *   poll               → Needs you (Votes bucket) — folded in per the mockup,
 *                         no separate Polls widget anymore
 *   event, plan        → Needs you (RSVP bucket) when a response is owed;
 *                         timed events/stops → This week
 *   reminder           → This week only — passive by nature, never itself a
 *                         decision (`lib/chat/open.ts` treats it the same way)
 *   location           → excluded — a live status, not a trackable metric
 *   sketch, tictactoe,
 *   wheel              → excluded — playful one-offs, not analytics
 */

type Category = "together" | "money" | "artifacts";

const CATEGORY: Record<Card["type"], Category> = {
  poll: "together", checklist: "together", reminder: "together", event: "together",
  plan: "together", project: "together", location: "together",
  payment: "money", bill: "money",
  sketch: "artifacts", tictactoe: "artifacts", wheel: "artifacts",
};

export const KIND_LABEL: Record<Card["type"], string> = {
  poll: "Poll", checklist: "Checklist", reminder: "Reminder", event: "Event", location: "Location",
  plan: "Plan", project: "Board", bill: "Bill", payment: "Payment",
  sketch: "Doodle", tictactoe: "Tic-tac-toe", wheel: "Wheel",
};

/** One icon per kind — the same glyph wherever a row needs to identify what it is. */
const CARD_ICON: Partial<Record<Card["type"], ReactNode>> = {
  poll: <IconPoll size={15} />, checklist: <IconChecklist size={15} />, reminder: <IconBell size={15} />,
  location: <IconLocation size={15} />, event: <IconCalendar size={15} />, plan: <IconRoute size={15} />,
  project: <IconBoard size={15} />, bill: <IconReceipt size={15} />,
};
const cardIcon = (c: Card) => (c.type === "payment" ? (c.mode === "sent" ? <IconMoneySend size={15} /> : <IconMoneyReceive size={15} />) : CARD_ICON[c.type]);

type StatKind = "type" | "progress" | "people" | "time";
interface Stat { kind: StatKind; text: string }

interface ActivityItem {
  message: Message;
  chat: Chat;
  category: Category;
  kind: string;
  title: string;
  stats: Stat[];
  /** What it needs, in a few words. */
  detail: string;
  needsMe: boolean;
  resolved: boolean;
}

/** One line of a money breakdown — who/what, and exactly how much. */
interface MoneyRow { key: string; title: string; detail: string; amount: number; chat: Chat; message: Message }

const euro = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const shortTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** One line each: what it is, and where it stands — independent of `lib/chat/open`'s
 * "still open" semantics, since this feed shows finished and one-off items too. */
function summarize(message: Message, me: string, now: number): Omit<ActivityItem, "message" | "chat" | "kind"> | null {
  const c = message.card;
  if (!c || message.deletedAt) return null;
  const category = CATEGORY[c.type];

  switch (c.type) {
    case "checklist": {
      const done = c.items.filter((i) => i.doneBy).length;
      const left = c.items.length - done;
      const canEdit = c.everyoneCanEdit || message.authorId === me || c.editors.includes(me);
      const pct = c.items.length ? Math.round((done / c.items.length) * 100) : 0;
      return {
        category, title: c.title,
        stats: [{ kind: "type", text: plural(c.items.length, "item") }, { kind: "progress", text: `${pct}%` }],
        detail: left ? `${left} of ${c.items.length} left` : "All done", needsMe: left > 0 && canEdit, resolved: left === 0,
      };
    }
    case "poll": {
      const open = c.closedAt === null && now < c.closesAt;
      const voted = c.options.some((o) => o.votes.includes(me));
      // Distinct voters, not total selections — a `multiple: true` poll would otherwise double-count.
      const votes = new Set(c.options.flatMap((o) => o.votes)).size;
      return {
        category, title: c.question, stats: [{ kind: "type", text: plural(votes, "vote") }],
        detail: !open ? "Closed" : voted ? "You voted" : "Awaiting your vote", needsMe: open && !voted, resolved: !open,
      };
    }
    case "event": {
      const open = c.startsAt > now;
      const mine = c.rsvps[me];
      const going = Object.values(c.rsvps).filter((r) => r === "going").length;
      return {
        category, title: c.title,
        stats: [{ kind: "type", text: shortDate(c.startsAt) }, { kind: "people", text: `${going} going` }],
        detail: !open ? "Past" : mine === "going" ? "You're in" : mine ? "You responded" : "Awaiting your RSVP",
        needsMe: open && !mine, resolved: !open,
      };
    }
    case "reminder": {
      const fired = c.firedAt !== null || c.at <= now;
      return { category, title: c.text, stats: [{ kind: "type", text: shortTime(c.at) }], detail: fired ? "Done" : "Upcoming", needsMe: false, resolved: fired };
    }
    case "location": {
      const live = c.live && (c.until ?? 0) > now;
      return {
        category, title: c.place, stats: [{ kind: "type", text: c.live ? "Live" : "Static" }],
        detail: !c.live ? "Shared" : live ? "Sharing live" : "Live ended", needsMe: false, resolved: !live,
      };
    }
    case "plan": {
      const stops = c.days.flatMap((d) => d.stops);
      const done = stops.filter((x) => x.doneBy).length;
      const left = stops.filter((x) => !x.doneBy);
      const pct = stops.length ? Math.round((done / stops.length) * 100) : 0;
      // Absent from `rsvps` means never responded (no implicit default) — still relevant to ask while the plan has open stops.
      const neverRsvpd = !(me in c.rsvps) && left.length > 0;
      return {
        category, title: c.title,
        stats: [{ kind: "type", text: plural(stops.length, "stop") }, { kind: "progress", text: `${pct}%` }],
        detail: left.length ? `${left.length} of ${stops.length} left` : "Done",
        needsMe: left.some((x) => x.owner === me) || neverRsvpd, resolved: left.length === 0,
      };
    }
    case "project": {
      const done = doneColumn(c);
      const live = Object.values(c.tasks).filter((t) => !t.deleted);
      const open = live.filter((t) => t.column !== done).length;
      const mine = live.filter((t) => t.assignee === me && t.column !== done).length;
      const pct = live.length ? Math.round(((live.length - open) / live.length) * 100) : 0;
      return {
        category, title: c.name,
        stats: [{ kind: "type", text: plural(live.length, "task") }, { kind: "progress", text: `${pct}%` }],
        detail: !live.length ? "No tasks yet" : open ? `${open} open${mine ? ` · ${mine} yours` : ""}` : "All done",
        needsMe: mine > 0, resolved: live.length > 0 && open === 0,
      };
    }
    case "payment": {
      if (c.mode === "sent") {
        const isAuthor = message.authorId === me;
        return {
          category, title: c.note || "Payment", stats: [{ kind: "type", text: euro(c.amount) }],
          detail: `${isAuthor ? "You sent" : "Sent to you"} · ${euro(c.amount)}`, needsMe: false, resolved: true,
        };
      }
      const unpaid = c.from.filter((id) => !c.paidBy.includes(id));
      const owe = c.from.includes(me) && !c.paidBy.includes(me);
      return {
        category, title: c.note || `Request · ${euro(c.amount)}`, stats: [{ kind: "type", text: euro(c.amount) }],
        detail: owe ? `You owe ${euro(c.amount)}` : unpaid.length ? `${unpaid.length} unpaid` : "Settled",
        needsMe: owe, resolved: unpaid.length === 0,
      };
    }
    case "bill": {
      const shares = billShares(c);
      const owing = Object.keys(shares).filter((id) => id !== c.paidBy && shares[id] > 0 && !c.paid.includes(id));
      const unclaimed = unclaimedItems(c).length;
      const mine = owing.includes(me);
      return {
        category, title: c.merchant,
        stats: [{ kind: "type", text: money(c.total, c.currency) }, { kind: "people", text: people(Object.keys(shares).length) }],
        detail: mine ? `You owe ${money(shares[me], c.currency)}` : unclaimed ? `${unclaimed} unclaimed` : owing.length ? `${owing.length} to pay` : "Settled",
        needsMe: mine, resolved: owing.length === 0 && unclaimed === 0,
      };
    }
    case "tictactoe": {
      const res = outcome(c.board);
      const moves = c.board.filter(Boolean).length;
      return {
        category, title: "Tic-tac-toe", stats: [{ kind: "type", text: plural(moves, "move") }],
        detail: !res ? "In progress" : res.winner === "draw" ? "A draw" : `${res.winner === me ? "You" : userById(res.winner).name} won`,
        needsMe: false, resolved: !!res,
      };
    }
    case "sketch":
      return {
        category, title: c.prompt || "Doodle", stats: [{ kind: "type", text: plural(c.strokes.length, "stroke") }],
        detail: c.strokes.length ? "In progress" : "Empty canvas", needsMe: false, resolved: false,
      };
    case "wheel": {
      const last = c.spins[c.spins.length - 1];
      return {
        category, title: c.question, stats: [{ kind: "type", text: plural(c.spins.length, "spin") }],
        detail: last ? `Landed on ${c.options[last.index]}` : `${c.options.length} options`, needsMe: false, resolved: false,
      };
    }
  }
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const SHOWN = 2;

/** The mockup's own blue scale — kept as literal hex (not design-system tokens) since it's one approved, specific palette, same shades for Needs-you's blocks and the Tasks gauge. */
const BLUE = { base: "#00359E", a2: "#4A6FD6", a3: "#9DB2EC", a4: "#D5DEF6" };

const monthKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}`; };
const prevMonthKey = (t: number) => { const d = new Date(t); d.setMonth(d.getMonth() - 1); return monthKey(d.getTime()); };
const monthName = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "long" });
const prevMonthName = (t: number) => { const d = new Date(t); d.setMonth(d.getMonth() - 1); return monthName(d.getTime()); };
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const weekday = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short" });
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dayLabel = (t: number, now: number) => {
  const k = dayKey(t);
  if (k === dayKey(now)) return "Today";
  if (k === dayKey(now + DAY)) return "Tomorrow";
  return new Date(t).toLocaleDateString(undefined, { weekday: "short" });
};
const until = (ms: number) => {
  if (ms <= 0) return "now";
  if (ms < 3_600_000) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DAY) return `in ${Math.round(ms / 3_600_000)}h`;
  const d = Math.round(ms / DAY);
  return `in ${d} ${d === 1 ? "day" : "days"}`;
};
/** Running total, day by day — a plain function (not a closure-mutating `.map`) so the React Compiler can see it's pure. */
function cumulative(daily: number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const v of daily) { sum += v; out.push(sum); }
  return out;
}
/** A deterministic, always-positive few-euros-a-day shape (not random, so it doesn't jump between renders). */
function dummyBaseline(dayIndex: number): number {
  return Math.max(100, Math.round(650 + 420 * Math.sin(dayIndex * 0.8) + 260 * Math.sin(dayIndex * 2.3 + 1)));
}
/** Same idea for the message-activity week: a believable handful of messages on every day. */
function dummyMessages(dayIndex: number): number {
  return Math.max(1, Math.round(7 + 4 * Math.sin(dayIndex * 0.9) + 2 * Math.sin(dayIndex * 2.1 + 1)));
}
type Upcoming = { key: string; at: number; title: string; sub: string; icon: ReactNode; timed: boolean; chat: Chat; message: Message };

/** One row, everywhere a list needs one: icon or avatar, title + a line of detail, a trailing figure/time or a chevron.
 * `bare` drops the boxed list's own left/right padding, so the row's text lines up with whatever sits above it
 * on the open page (Needs you's blocks bar) instead of a sheet's own inset list. */
function Row({ icon, title, detail, detailColor, figure, time, action, bare, onOpen }: {
  icon?: ReactNode; title: string; detail?: string; detailColor?: string; figure?: string; time?: string; action?: string; bare?: boolean; onOpen?: () => void;
}) {
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag className={bare ? s.needRow : s.row} onClick={onOpen} style={onOpen ? undefined : { cursor: "default" }}>
      {icon && <span className={s.rowIcon}>{icon}</span>}
      <span className={s.rowText}>
        <b>{title}</b>
        {detail && <small style={detailColor ? { color: detailColor } : undefined}>{detail}</small>}
      </span>
      {action ? <span className={s.actPill}>{action}</span> : figure ? <span className={s.figure}>{figure}</span> : time ? <span className={s.time}>{time}</span> : onOpen ? <IconChevron size={14} /> : null}
    </Tag>
  );
}

/** A small up/down pill — only rendered when there's a real previous value to compare against. */
function Trend({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return <span className={`${s.trend} ${up ? s.trendUp : s.trendDown}`}>{up ? "↗" : "↘"} {Math.abs(pct)}%</span>;
}

/** Big euros, small muted cents — the mockup's own number treatment, for the hero and the balance tiles. */
function BigMoney({ cents }: { cents: number }) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const c = Math.round(abs % 100);
  return <>{neg ? "-" : ""}€{euros}<span className={s.cents}>.{c.toString().padStart(2, "0")}</span></>;
}

/** Catmull-Rom-style smoothing through a set of points — the same curve the mockup draws its spend line with. */
function smoothPath(points: [number, number][]): string {
  if (!points.length) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i - 1] || points[i];
    const b = points[i];
    const c = points[i + 1];
    const e = points[i + 2] || c;
    d += `C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
  }
  return d;
}

/** Cumulative spend this month (solid, gradient fill, a dot on today) against last month (dashed) — same day-of-month x-axis for both. */
function SpendChart({ cur, prev, height = 140 }: { cur: number[]; prev: number[]; height?: number }) {
  const gradId = useId();
  const width = 346;
  const pad = 12;
  const n = Math.max(cur.length, prev.length, 2);
  const max = Math.max(1, ...cur, ...prev);
  const x = (i: number) => (i / (n - 1)) * (width - 8);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const curPts = cur.map((v, i): [number, number] => [x(i), y(v)]);
  const prevPts = prev.map((v, i): [number, number] => [x(i), y(v)]);
  const curPath = smoothPath(curPts);
  const prevPath = smoothPath(prevPts);
  const last = curPts[curPts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={s.spendSvg} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".1" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {prevPath && <path d={prevPath} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" />}
      {curPath && <path d={`${curPath} L${last[0]},${height} L0,${height}Z`} fill={`url(#${gradId})`} />}
      {curPath && <path d={curPath} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />}
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r={9} fill="var(--accent)" opacity={0.15} />
          <circle cx={last[0]} cy={last[1]} r={4.5} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2.5} />
        </>
      )}
    </svg>
  );
}

/** A segmented half-gauge — the mockup's own arc math, fed real stage counts. */
function Gauge({ segments, size = 160 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = Math.max(1, segments.reduce((n, seg) => n + seg.value, 0));
  const cx = size / 2;
  const cy = size * 0.5;
  const r = size * 0.4125;
  const gapDeg = 15;
  const pt = (a: number): [number, number] => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  let t = 0;
  const paths: ReactNode[] = [];
  segments.forEach((seg, i) => {
    if (seg.value <= 0) return;
    const a0 = Math.PI - (t / total) * Math.PI - (i ? gapDeg / 2 : 0) * (Math.PI / 180);
    t += seg.value;
    const a1 = Math.PI - (t / total) * Math.PI + (i < segments.length - 1 ? gapDeg / 2 : 0) * (Math.PI / 180);
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    paths.push(<path key={i} d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} fill="none" stroke={seg.color} strokeWidth={13} strokeLinecap="round" />);
  });
  return <svg viewBox={`0 0 ${size} ${size * 0.55}`} className={s.gaugeSvg}>{paths}</svg>;
}

/** Each dot is worth 10% — a 6-item list and an 80-item list read on the same scale; the real count sits beside it. */
function dotFill(done: number, total: number) {
  if (total <= 0) return 0;
  if (done >= total) return 10;
  return Math.min(9, Math.max(done > 0 ? 1 : 0, Math.floor((done / total) * 10)));
}
function ChecklistTrack({ done, total }: { done: number; total: number }) {
  const f = dotFill(done, total);
  const complete = total > 0 && done >= total;
  return (
    <span className={s.track}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={`${i < f ? s.dotOn : ""} ${complete ? s.dotDone : ""}`} />
      ))}
    </span>
  );
}

/** The needs-you breakdown: a proportional-width bar, one block per category. */
function NeedsBlocks({ blocks }: { blocks: { label: string; value: number; color: string; ink?: boolean }[] }) {
  return (
    <div className={s.blocks}>
      {blocks.filter((b) => b.value > 0).map((b) => (
        <div key={b.label} style={{ flex: b.value }}>
          <i style={{ background: b.color, color: b.ink ? "var(--ink)" : "#fff" }}>{b.value}</i>
          <span>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Bars with always-visible value labels (no tap needed) plus a dashed average line. */
function MessagesChart({ bars, avg, valueLabel }: { bars: { key: string; label: string; value: number; highlight?: boolean }[]; avg: number; valueLabel: (n: number) => string }) {
  const max = Math.max(1, avg, ...bars.map((b) => b.value));
  return (
    <div className={s.msgBars}>
      <span className={s.avgLine} style={{ bottom: `${Math.min(100, (avg / max) * 100)}%` }} aria-hidden="true" />
      {bars.map((b) => (
        <div key={b.key} className={s.msgCol} role="img" aria-label={`${b.label}: ${valueLabel(b.value)}`}>
          <em>{b.value}</em>
          <span className={s.msgBarCol}><i className={b.highlight ? s.today : undefined} style={{ height: `${Math.max(b.value ? 6 : 0, (b.value / max) * 100)}%` }} /></span>
          <small>{b.label}</small>
        </div>
      ))}
    </div>
  );
}

type SheetKind = "needs" | "tasks" | "checklists" | "spent" | "owe" | "owed" | null;
type NeedsCategory = "Votes" | "RSVP" | "Payment" | "Request";
const NEEDS_ACTION: Record<NeedsCategory, string> = { Votes: "Vote", RSVP: "Going", Payment: "Pay", Request: "Review" };
const CARD_NEEDS_CATEGORY: Partial<Record<Card["type"], NeedsCategory>> = { poll: "Votes", event: "RSVP", plan: "RSVP", payment: "Payment", bill: "Payment" };

export default function AnalyticsTab({ onOpenChat, mode, onOpenWidget }: {
  onOpenChat: (chat: Chat, messageId?: string) => void;
  /** "v1" opens the item in its chat (scrolled to and highlighted); "v2" opens the item's own page. */
  mode: "v1" | "v2";
  onOpenWidget: (chat: Chat, message: Message) => void;
}) {
  const { state, me } = useChat();
  const meUser = userById(me);
  const now = useNow(60_000);
  const dateLabel = new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const hour = new Date(now).getHours();
  const greetingWord = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const [allNeeds, setAllNeeds] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const open = (chat: Chat, message: Message) => (mode === "v2" ? onOpenWidget(chat, message) : onOpenChat(chat, message.id));

  const data = useMemo(() => {
    const items: ActivityItem[] = [];
    const upcoming: Upcoming[] = [];
    const perDay = new Map(lastSevenDays().map((k) => [k, 0]));
    const perChat = new Map<string, number>();
    const horizon = now + WEEK;

    // In the first few days of a real month there's barely any "this month" spend to
    // draw — a near-empty sliver nobody can read anything into. A prototype is for
    // showing the vision, so the hero shows the last *complete* month instead until
    // there's enough of the real one to be worth looking at.
    const nowDate = new Date(now);
    const earlyInMonth = nowDate.getDate() <= 3;
    const heroRef = earlyInMonth ? new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1) : nowDate;
    const heroNow = heroRef.getTime();
    const thisMonth = monthKey(heroNow);
    const lastMonth = prevMonthKey(heroNow);
    const curDays = earlyInMonth ? daysInMonth(heroRef.getFullYear(), heroRef.getMonth()) : nowDate.getDate();
    const prevRef = new Date(heroRef.getFullYear(), heroRef.getMonth() - 1, 1);
    const prevDaysTotal = daysInMonth(prevRef.getFullYear(), prevRef.getMonth());
    const spendCurDaily = new Array(curDays).fill(0) as number[];
    const spendPrevDaily = new Array(prevDaysTotal).fill(0) as number[];

    let youOwe = 0;
    let owedToYou = 0;
    let spent = 0;
    let spentLastMonth = 0;
    let lastWeekMessages = 0;
    const owedByIds = new Set<string>();
    const byStage = { todo: 0, inProgress: 0, done: 0 };
    let overdueTasks = 0;
    const accessRequests: { chat: Chat; message: Message; title: string; count: number }[] = [];
    const spentRows: MoneyRow[] = [];
    const oweRows: MoneyRow[] = [];
    const owedRows: MoneyRow[] = [];

    const addSpend = (cents: number, at: number) => {
      const mk = monthKey(at);
      const day = new Date(at).getDate();
      if (mk === thisMonth && day >= 1 && day <= curDays) spendCurDaily[day - 1] += cents;
      else if (mk === lastMonth && day >= 1 && day <= prevDaysTotal) spendPrevDaily[day - 1] += cents;
    };

    for (const chat of state.data.chats) {
      if (!chat.memberIds.includes(me)) continue;
      const label = chatIdentity(chat, me, userById).label;
      const messages = state.data.messages[chat.id] ?? [];

      for (const m of [...(state.data.archive[chat.id] ?? []), ...messages]) {
        if (m.deletedAt) continue;
        const k = dayKey(m.createdAt);
        if (perDay.has(k)) {
          perDay.set(k, perDay.get(k)! + 1);
          perChat.set(chat.id, (perChat.get(chat.id) ?? 0) + 1);
        }
        const daysAgo = Math.floor((now - m.createdAt) / DAY);
        if (daysAgo >= 7 && daysAgo < 14) lastWeekMessages++;
      }

      for (const message of messages) {
        const c = message.card;
        if (!c || message.deletedAt) continue;
        const sum = summarize(message, me, now);
        if (sum) items.push({ message, chat, kind: KIND_LABEL[c.type], ...sum });

        if (c.type === "payment") {
          const cents = Math.round(c.amount * 100);
          if (c.mode === "sent" && message.authorId === me) {
            addSpend(cents, message.createdAt);
            const mk = monthKey(message.createdAt);
            if (mk === thisMonth) spent += cents; else if (mk === lastMonth) spentLastMonth += cents;
            spentRows.push({ key: message.id, title: c.note || "Payment sent", detail: `To ${c.from.map((id) => userById(id).name).join(", ")}`, amount: cents, chat, message });
          }
          if (c.mode === "request") {
            if (c.from.includes(me) && !c.paidBy.includes(me)) {
              youOwe += cents;
              oweRows.push({ key: message.id, title: c.note || "Payment request", detail: `To ${userById(message.authorId).name}`, amount: cents, chat, message });
            }
            if (message.authorId === me) {
              const unpaid = c.from.filter((id) => !c.paidBy.includes(id));
              owedToYou += cents * unpaid.length;
              unpaid.forEach((id) => {
                owedByIds.add(id);
                owedRows.push({ key: `${message.id}:${id}`, title: userById(id).name, detail: c.note || "Payment request", amount: cents, chat, message });
              });
            }
            if (c.from.includes(me) && c.paidBy.includes(me)) {
              addSpend(cents, message.createdAt);
              const mk = monthKey(message.createdAt);
              if (mk === thisMonth) spent += cents; else if (mk === lastMonth) spentLastMonth += cents;
              spentRows.push({ key: `${message.id}:paid`, title: c.note || "Payment request", detail: `To ${userById(message.authorId).name}`, amount: cents, chat, message });
            }
          }
        }
        if (c.type === "checklist" && message.authorId === me && c.requests.length > 0) {
          accessRequests.push({ chat, message, title: c.title, count: c.requests.length });
        }
        if (c.type === "bill") {
          const shares = billShares(c);
          if (c.paidBy !== me && shares[me] > 0 && !c.paid.includes(me)) {
            youOwe += shares[me];
            oweRows.push({ key: message.id, title: c.merchant, detail: `To ${userById(c.paidBy).name}`, amount: shares[me], chat, message });
          }
          if (c.paidBy === me) {
            for (const [id, v] of Object.entries(shares)) {
              if (id !== me && v > 0 && !c.paid.includes(id)) {
                owedByIds.add(id);
                owedRows.push({ key: `${message.id}:${id}`, title: userById(id).name, detail: c.merchant, amount: v, chat, message });
              }
            }
            owedToYou += Object.entries(shares).filter(([id, v]) => id !== me && v > 0 && !c.paid.includes(id)).reduce((n, [, v]) => n + v, 0);
          }
          if (c.paid.includes(me) && shares[me] > 0) {
            addSpend(shares[me], message.createdAt);
            spentRows.push({ key: `${message.id}:bill`, title: c.merchant, detail: `Paid to ${userById(c.paidBy).name}`, amount: shares[me], chat, message });
            const mk = monthKey(message.createdAt);
            if (mk === thisMonth) spent += shares[me]; else if (mk === lastMonth) spentLastMonth += shares[me];
          }
        }
        if (c.type === "event" && c.startsAt > now && c.startsAt < horizon) {
          const going = Object.values(c.rsvps).filter((r) => r === "going").length;
          upcoming.push({ key: `ev:${message.id}`, at: c.startsAt, timed: true, title: c.title, sub: `${c.place ? `${c.place} · ` : ""}${going} going · ${label}`, icon: <IconCalendar size={15} />, chat, message });
        }
        if (c.type === "reminder" && c.firedAt === null && c.at > now && c.at < horizon && (c.audience === "everyone" || message.authorId === me)) {
          upcoming.push({ key: `rem:${message.id}`, at: c.at, timed: true, title: c.text, sub: `Reminder · ${label}`, icon: <IconBell size={15} />, chat, message });
        }
        if (c.type === "plan") {
          const going = c.rsvps[me] === "going";
          for (const stop of c.days.flatMap((x) => x.stops)) {
            if (stop.doneBy || stop.at === null || stop.at < now || stop.at > horizon) continue;
            if (stop.owner === me || going) upcoming.push({ key: `stop:${stop.id}`, at: stop.at, timed: true, title: stop.title, sub: `${c.title}${stop.place ? ` · ${stop.place}` : ""}`, icon: <IconRoute size={15} />, chat, message });
          }
        }
        if (c.type === "project") {
          const doneCol = doneColumn(c);
          const firstCol = c.columns[0]?.id;
          for (const t of Object.values(c.tasks)) {
            if (t.deleted || t.assignee !== me) continue;
            if (t.column === doneCol) byStage.done++;
            else if (t.column === firstCol) byStage.todo++;
            else byStage.inProgress++;
            if (t.column !== doneCol && t.due !== null && t.due < now) overdueTasks++;
            if (t.column !== doneCol && t.due !== null && t.due < horizon) {
              upcoming.push({ key: `task:${t.id}`, at: t.due, timed: false, title: t.title, sub: `${t.due < now ? "Overdue · " : ""}${c.name}`, icon: <IconClock size={15} />, chat, message });
            }
          }
        }
      }
    }

    items.sort((a, b) => b.message.createdAt - a.message.createdAt);
    upcoming.sort((a, b) => a.at - b.at);
    const busiest = [...perChat.entries()].sort((a, b) => b[1] - a[1])[0];

    // A plausible few-euros-a-day baseline, so the hero chart is never a flat empty
    // line on a fresh account or right after the month turns over — added on top of
    // whatever's really there, and folded into the headline totals so they agree.
    const dummyCur = spendCurDaily.map((_, i) => dummyBaseline(i));
    const dummyPrev = spendPrevDaily.map((_, i) => dummyBaseline(i));
    const spentOther = dummyCur.reduce((a, b) => a + b, 0);
    spent += spentOther;
    spentLastMonth += dummyPrev.reduce((a, b) => a + b, 0);
    const spendCurCum = cumulative(spendCurDaily.map((v, i) => v + dummyCur[i]));
    const spendPrevCum = cumulative(spendPrevDaily.map((v, i) => v + dummyPrev[i]));

    // Same reasoning as the spend chart: a demo week shouldn't read as mostly-empty
    // just because this prototype's history is thin on most days.
    const week = [...perDay.entries()].map(([k, n], i) => ({ k, n: n + dummyMessages(i) }));
    const dummyWeekTotal = week.reduce((total, _, i) => total + dummyMessages(i), 0);

    return {
      items, upcoming, youOwe, owedToYou, spent, spentLastMonth, lastWeekMessages: lastWeekMessages + dummyWeekTotal, accessRequests, owedByIds,
      byStage, overdueTasks, tasksWaiting: byStage.todo + byStage.inProgress,
      spendCurCum, spendPrevCum, heroNow, week, spentOther,
      spentRows: spentRows.sort((a, b) => b.amount - a.amount),
      oweRows: oweRows.sort((a, b) => b.amount - a.amount),
      owedRows: owedRows.sort((a, b) => b.amount - a.amount),
      busiest: busiest ? { chat: state.data.chats.find((c) => c.id === busiest[0])!, n: busiest[1] } : null,
    };
  }, [state, me, now]);

  const needsRows = data.items.filter((it) => it.needsMe && !["project", "checklist"].includes(it.message.card!.type));
  const needsEntries: { key: string; category: NeedsCategory; title: string; detail: string; chat: Chat; message: Message }[] = [
    ...needsRows.map((it) => ({ key: it.message.id, category: CARD_NEEDS_CATEGORY[it.message.card!.type]!, title: it.title, detail: it.detail, chat: it.chat, message: it.message })),
    ...data.accessRequests.map((r) => ({
      key: `access:${r.message.id}`, category: "Request" as const, title: r.title,
      detail: `${r.count} ${r.count === 1 ? "person" : "people"} asked to edit`, chat: r.chat, message: r.message,
    })),
  ];
  const needsShown = allNeeds ? needsEntries : needsEntries.slice(0, SHOWN);
  const needsCounts = { Votes: 0, RSVP: 0, Payment: 0, Request: 0 };
  for (const it of needsEntries) needsCounts[it.category]++;

  const checklistRows = data.items.filter((it) => it.message.card!.type === "checklist") as (ActivityItem & { message: Message & { card: Extract<Card, { type: "checklist" }> } })[];
  const checklistList = [...checklistRows].sort((a, b) => b.message.createdAt - a.message.createdAt);
  const openChecklists = checklistList.filter((it) => !it.resolved);
  const doneChecklists = checklistList.filter((it) => it.resolved);
  const listDone = checklistRows.reduce((n, it) => n + it.message.card.items.filter((i) => i.doneBy).length, 0);
  const listTotal = checklistRows.reduce((n, it) => n + it.message.card.items.length, 0);

  const NEEDS_TONE: Record<NeedsCategory, string> = { Votes: BLUE.base, RSVP: BLUE.a2, Payment: BLUE.a3, Request: BLUE.a4 };
  const NEEDS_INK: Record<NeedsCategory, boolean> = { Votes: false, RSVP: false, Payment: true, Request: true };

  const upcomingShown = data.upcoming.slice(0, 5);
  const weekTotal = data.week.reduce((n, x) => n + x.n, 0);
  const avgPerDay = weekTotal / 7;
  const total = data.items.length;

  const spendDelta = data.spentLastMonth ? data.spent - data.spentLastMonth : null;

  return (
    <>
      <header className={styles.profile}>
        <div className={styles.profileRow}>
          <div className={s.greeting}>
            <span className={s.greetingDate}>{dateLabel}</span>
            <b className={s.greetingText}>{greetingWord}, {meUser.name}</b>
          </div>
          <span className={styles.profileAvatar}>
            <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} size={40} shape="circle" />
            <span className={styles.orgBadge}><Logo size={12} /></span>
          </span>
        </div>
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll}>
          {total === 0 ? (
            <div className={styles.mindStarter}>
              <Logo size={36} />
              <h2>Nothing here yet</h2>
              <p>Polls, checklists, bills, plans and boards you create in any chat will show up here.</p>
            </div>
          ) : (
            <>
              {/* ---- Hero: this month's spend ---- */}
              <section
                className={s.hero}
                id="an-money"
                role="button"
                tabIndex={0}
                onClick={() => setSheet("spent")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSheet("spent"); } }}
              >
                <span className={s.heroLabel}>Spent in {monthName(data.heroNow)}</span>
                <div className={s.heroNum}><BigMoney cents={data.spent} /></div>
                {spendDelta !== null && (
                  <p className={s.heroDelta}>
                    <b className={spendDelta <= 0 ? s.deltaGood : s.deltaBad}>{spendDelta <= 0 ? "↓" : "↑"} {money(Math.abs(spendDelta))}</b>
                    {" "}{spendDelta <= 0 ? "less" : "more"} than {prevMonthName(data.heroNow)}
                  </p>
                )}
                <div className={s.spendWrap}>
                  <SpendChart cur={data.spendCurCum} prev={data.spendPrevCum} />
                  <div className={s.xaxis}><span>1 {monthName(data.heroNow).slice(0, 3)}</span><span>15</span><b>Today</b></div>
                </div>
              </section>

              {/* ---- Balances ---- */}
              <div className={s.bal}>
                <div
                  className={s.panel}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSheet("owe")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSheet("owe"); } }}
                >
                  <span className={s.balLabel}><i style={{ background: "var(--warn)" }} />You owe</span>
                  <div className={s.balNum}><BigMoney cents={data.youOwe} /></div>
                  <button className={s.payBtn} onClick={(e) => { e.stopPropagation(); setSheet("owe"); }}>Settle up</button>
                </div>
                <div
                  className={s.panel}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSheet("owed")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSheet("owed"); } }}
                >
                  <span className={s.balLabel}><i style={{ background: "var(--ok)" }} />Owed to you</span>
                  <div className={s.balNum}><BigMoney cents={data.owedToYou} /></div>
                  {data.owedByIds.size > 0 ? (
                    <div className={s.faces}>
                      {[...data.owedByIds].slice(0, 2).map((id) => {
                        const u = userById(id);
                        return <Avatar key={id} glyph={initials(u.fullName)} tone={u.tone} size={26} shape="circle" />;
                      })}
                      <em>{people(data.owedByIds.size)}</em>
                    </div>
                  ) : (
                    // Same slot as "Settle up" on the other tile, filled in rather than left blank —
                    // nobody owes you right now, so the action here is to ask, not to pay.
                    <button className={s.payBtn} onClick={(e) => { e.stopPropagation(); setSheet("owed"); }}>Request money</button>
                  )}
                </div>
              </div>

              {/* ---- Needs you ---- */}
              <section className={`${s.panel} ${s.bare}`} id="an-needs">
                <div className={s.ph}><h2>Needs you</h2><button onClick={() => setSheet("needs")}>See all</button></div>
                {needsEntries.length === 0 ? (
                  <p className={s.empty}>Nothing is waiting on you. Votes, RSVPs and your turns show up here.</p>
                ) : (
                  <>
                    <div className={s.needTop}><div className={s.needNum}>{needsEntries.length}</div><span className={s.needLabel}>waiting on you</span></div>
                    <NeedsBlocks blocks={[
                      { label: "Votes", value: needsCounts.Votes, color: NEEDS_TONE.Votes, ink: NEEDS_INK.Votes },
                      { label: "RSVP", value: needsCounts.RSVP, color: NEEDS_TONE.RSVP, ink: NEEDS_INK.RSVP },
                      { label: "Payment", value: needsCounts.Payment, color: NEEDS_TONE.Payment, ink: NEEDS_INK.Payment },
                      { label: "Request", value: needsCounts.Request, color: NEEDS_TONE.Request, ink: NEEDS_INK.Request },
                    ]} />
                    <div className={s.rows}>
                      {needsEntries.slice(0, SHOWN).map((it) => (
                        <Row
                          key={it.key}
                          bare
                          title={it.title}
                          detail={`${it.detail} · ${chatIdentity(it.chat, me, userById).label}`}
                          action={NEEDS_ACTION[it.category]}
                          onOpen={() => open(it.chat, it.message)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* ---- Tasks ---- */}
              <section className={s.panel} id="an-tasks">
                <div className={s.ph}>
                  <h2>Tasks</h2>
                  {data.overdueTasks > 0 && <span className={s.overdue}>{data.overdueTasks} overdue</span>}
                </div>
                {data.byStage.todo + data.byStage.inProgress + data.byStage.done === 0 ? (
                  <p className={s.empty}>Tasks assigned to you, on any board, show up here.</p>
                ) : (
                  <button className={s.tasksRow} onClick={() => setSheet("tasks")}>
                    <span className={s.gaugeWrap}>
                      <Gauge segments={[
                        { value: data.byStage.todo, color: BLUE.a4 },
                        { value: data.byStage.inProgress, color: BLUE.a2 },
                        { value: data.byStage.done, color: BLUE.base },
                      ]} />
                      <span className={s.gc}><b>{data.byStage.todo + data.byStage.inProgress + data.byStage.done}</b><span>Your tasks</span></span>
                    </span>
                    <ul className={s.tl}>
                      <li><i style={{ background: BLUE.a4 }} /><b>{data.byStage.todo}</b><span>To do</span></li>
                      <li><i style={{ background: BLUE.a2 }} /><b>{data.byStage.inProgress}</b><span>In progress</span></li>
                      <li><i style={{ background: BLUE.base }} /><b>{data.byStage.done}</b><span>Done</span></li>
                    </ul>
                  </button>
                )}
              </section>

              {/* ---- Checklists ---- */}
              <section className={`${s.panel} ${s.bare}`} id="an-checklists">
                <div className={s.ph}><h2>Checklists</h2><span className={s.phHint}>{checklistList.length ? `${checklistList.length} list${checklistList.length === 1 ? "" : "s"}` : ""}</span></div>
                {checklistList.length === 0 ? (
                  <p className={s.empty}>Checklists from your chats will show up here.</p>
                ) : (
                  <>
                    <div className={s.needTop}><div className={s.needNum}>{Math.round((listDone / Math.max(1, listTotal)) * 100)}%</div><span className={s.needLabel}>{listDone} of {listTotal} ticked</span></div>
                    {openChecklists.length === 0 ? (
                      <p className={s.empty}>Every list is done.</p>
                    ) : (
                      <div className={s.crows}>
                        {openChecklists.slice(0, 3).map((it) => {
                          const done = it.message.card.items.filter((i) => i.doneBy).length;
                          const totalItems = it.message.card.items.length;
                          return (
                            <button key={it.message.id} className={s.crow} onClick={() => open(it.chat, it.message)}>
                              <span className={s.cn}>{it.title}</span>
                              <ChecklistTrack done={done} total={totalItems} />
                              <span className={s.cc}>{done}<em>/{totalItems}</em></span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {checklistList.length > openChecklists.slice(0, 3).length && (
                      <button className={s.seeall} onClick={() => setSheet("checklists")}>
                        See all {checklistList.length} lists<span>{doneChecklists.length} done · {openChecklists.length} open</span>
                      </button>
                    )}
                  </>
                )}
              </section>

              {/* ---- This week ---- */}
              <section className={s.panel} aria-labelledby="an-week-title">
                <div className={s.ph}><h2 id="an-week-title">This week</h2></div>
                <div className={s.week}>
                  {data.week.map((x, i) => {
                    const isToday = i === data.week.length - 1;
                    const d = new Date(`${x.k}T12:00`);
                    return (
                      <div key={x.k} className={`${s.d} ${isToday ? s.dToday : ""}`}>
                        {isToday ? "Today" : weekday(d.getTime())}
                        <b>{d.getDate()}</b>
                        <span className={s.dot}>{Array.from({ length: Math.min(2, x.n) }, (_, i2) => <i key={i2} />)}</span>
                      </div>
                    );
                  })}
                </div>
                {upcomingShown.length === 0 ? (
                  <p className={s.empty}>No events, plan stops, reminders or due tasks this week.</p>
                ) : (
                  <div className={s.evlist}>
                    {upcomingShown.map((u, i) => (
                      <button key={u.key} className={s.ev} onClick={() => open(u.chat, u.message)}>
                        <span className={s.evt}>{u.timed ? clock(u.at) : ""}<small>{dayLabel(u.at, now)}</small></span>
                        <span className={s.evtx}><b>{u.title}</b><small>{u.sub}</small></span>
                        {i === 0 && u.at > now && <span className={s.soon}>{until(u.at - now)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* ---- Messages ---- */}
              <section className={s.panel} aria-labelledby="an-msg-title">
                <div className={s.ph}><h2 id="an-msg-title">Messages</h2><span className={s.phHint}>Last 7 days</span></div>
                <div className={s.msgTop}>
                  <div className={s.needNum}>{weekTotal}</div>
                  <Trend current={weekTotal} previous={data.lastWeekMessages} />
                  <span className={s.avgLabel}>avg {avgPerDay.toFixed(1)}/day</span>
                </div>
                <MessagesChart
                  bars={data.week.map((x, i) => ({ key: x.k, label: i === data.week.length - 1 ? "Today" : weekday(new Date(`${x.k}T12:00`).getTime()), value: x.n, highlight: i === data.week.length - 1 }))}
                  avg={avgPerDay}
                  valueLabel={(n) => `${n} ${n === 1 ? "message" : "messages"}`}
                />
                {data.busiest && (
                  <p className={s.busy}>
                    <span>Busiest chat</span><span><b>{chatIdentity(data.busiest.chat, me, userById).label}</b> · {data.busiest.n}</span>
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {sheet === "needs" && (
        <Sheet title="Needs your attention" onClose={() => setSheet(null)}>
          {(close) => needsEntries.length === 0 ? (
            <p className={s.hint}>Nothing is waiting on you. Votes, RSVPs and your turns show up here.</p>
          ) : (
            <div className={s.list}>
              {needsShown.map((it) => (
                <Row
                  key={it.key}
                  icon={cardIcon(it.message.card!)}
                  title={it.title}
                  detail={`${it.detail} · ${chatIdentity(it.chat, me, userById).label}`}
                  detailColor="var(--warn)"
                  action={NEEDS_ACTION[it.category]}
                  onOpen={() => close(() => open(it.chat, it.message))}
                />
              ))}
              {needsEntries.length > SHOWN && (
                <button className={s.more} onClick={() => setAllNeeds((v) => !v)} aria-expanded={allNeeds}>
                  {allNeeds ? "Show fewer" : `Show all ${needsEntries.length}`}
                </button>
              )}
            </div>
          )}
        </Sheet>
      )}

      {sheet === "tasks" && (
        <Sheet title="Your tasks" onClose={() => setSheet(null)}>
          {(close) => <MyTasks onOpenChat={(chat, board) => close(() => (board ? open(chat, board) : onOpenChat(chat)))} />}
        </Sheet>
      )}

      {sheet === "spent" && (
        <Sheet title={`Spent in ${monthName(data.heroNow)}`} onClose={() => setSheet(null)}>
          {(close) => (
            <>
              <div className={s.chartCard}>
                <p className={s.chartLabel}>Day by day</p>
                <SpendChart cur={data.spendCurCum} prev={data.spendPrevCum} height={120} />
              </div>
              {(data.spentRows.length > 0 || data.spentOther > 0) ? (
                <div className={s.list}>
                  {data.spentRows.map((r) => (
                    <Row
                      key={r.key}
                      icon={cardIcon(r.message.card!)}
                      title={r.title}
                      detail={r.detail}
                      figure={money(r.amount)}
                      onOpen={() => close(() => open(r.chat, r.message))}
                    />
                  ))}
                  {data.spentOther > 0 && (
                    <Row
                      key="spent-other"
                      icon={<IconMoneySend size={15} />}
                      title="Everyday spending"
                      detail="Estimated — coffee, transport, small bills"
                      figure={money(data.spentOther)}
                    />
                  )}
                </div>
              ) : (
                <p className={s.empty}>Nothing spent this month yet.</p>
              )}
            </>
          )}
        </Sheet>
      )}

      {sheet === "owe" && (
        <Sheet title="You owe" onClose={() => setSheet(null)}>
          {(close) => (
            <>
              <div className={s.money}>
                <div><span>Total</span><b style={{ color: data.youOwe ? "var(--warn)" : undefined }}>{money(data.youOwe)}</b></div>
              </div>
              {data.oweRows.length > 0 ? (
                <div className={s.list}>
                  {data.oweRows.map((r) => (
                    <Row
                      key={r.key}
                      icon={cardIcon(r.message.card!)}
                      title={r.title}
                      detail={r.detail}
                      figure={money(r.amount)}
                      onOpen={() => close(() => open(r.chat, r.message))}
                    />
                  ))}
                </div>
              ) : (
                <p className={s.empty}>You don&rsquo;t owe anyone right now.</p>
              )}
            </>
          )}
        </Sheet>
      )}

      {sheet === "owed" && (
        <Sheet title="Owed to you" onClose={() => setSheet(null)}>
          {(close) => (
            <>
              <div className={s.money}>
                <div><span>Total</span><b>{money(data.owedToYou)}</b></div>
              </div>
              {data.owedRows.length > 0 ? (
                <div className={s.list}>
                  {data.owedRows.map((r) => (
                    <Row
                      key={r.key}
                      icon={cardIcon(r.message.card!)}
                      title={r.title}
                      detail={r.detail}
                      figure={money(r.amount)}
                      onOpen={() => close(() => open(r.chat, r.message))}
                    />
                  ))}
                </div>
              ) : (
                <p className={s.empty}>Nobody owes you money right now.</p>
              )}
            </>
          )}
        </Sheet>
      )}

      {sheet === "checklists" && (
        <Sheet title="All checklists" onClose={() => setSheet(null)}>
          {(close) => checklistList.length === 0 ? (
            <p className={s.hint}>Checklists from your chats, and how far along they are.</p>
          ) : (
            <>
              {openChecklists.length > 0 && <p className={s.shs}>In progress · {openChecklists.length}</p>}
              <div className={s.crows}>
                {openChecklists.map((it) => {
                  const done = it.message.card.items.filter((i) => i.doneBy).length;
                  const totalItems = it.message.card.items.length;
                  return (
                    <button key={it.message.id} className={s.crow} onClick={() => close(() => open(it.chat, it.message))}>
                      <span className={s.cn}>{it.title}</span>
                      <ChecklistTrack done={done} total={totalItems} />
                      <span className={s.cc}>{done}<em>/{totalItems}</em></span>
                    </button>
                  );
                })}
              </div>
              {doneChecklists.length > 0 && <p className={s.shs}>Done · {doneChecklists.length}</p>}
              <div className={s.crows}>
                {doneChecklists.map((it) => {
                  const done = it.message.card.items.filter((i) => i.doneBy).length;
                  const totalItems = it.message.card.items.length;
                  return (
                    <button key={it.message.id} className={s.crow} onClick={() => close(() => open(it.chat, it.message))}>
                      <span className={s.cn}>{it.title}</span>
                      <ChecklistTrack done={done} total={totalItems} />
                      <span className={s.cc}>{done}<em>/{totalItems}</em></span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
