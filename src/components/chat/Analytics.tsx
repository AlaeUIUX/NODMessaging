"use client";

import { useMemo, useState, type ReactNode } from "react";
import { chatIdentity, initials, TONES } from "@/lib/chat/avatar";
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
import { Sheet, smooth, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./activity.module.css";

/**
 * Analytics: a condensed dashboard. The main page is numbers and charts
 * only — what's spent, what's waiting, how boards/checklists/activity are
 * composed — each tool with its own chart shape. Tapping a widget is what
 * reveals what's contributing to it: the itemized list opens in a sheet,
 * never sitting on the page by default.
 *
 * Where every card type lives, so nothing is ambiguously "sort of covered":
 *   payment, bill      → Money widget (spend trend, owe/owed, settle-up list)
 *   project (boards)   → Tasks widget (priority donut, MyTasks drill-down)
 *   checklist (items)  → Checklists widget (done/left ring)
 *   checklist (a       → Needs your attention — someone asking to edit is a
 *     pending `requests`) distinct owner decision, not open-items progress
 *   poll               → Polls widget (a vote-share donut, its own drill-down)
 *   event (no RSVP)    → Needs your attention; event (timed) → Coming up
 *   plan (open stop     → Needs your attention; plan stops (timed) → Coming up
 *     you own, or no RSVP)
 *   reminder           → Coming up only — passive by nature, never itself a
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
const SHOWN = 4;

const monthKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}`; };
const prevMonthKey = (t: number) => { const d = new Date(t); d.setMonth(d.getMonth() - 1); return monthKey(d.getTime()); };
const weekday = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short" });
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dayLabel = (t: number, now: number) => {
  const k = dayKey(t);
  if (k === dayKey(now)) return "Today";
  if (k === dayKey(now + DAY)) return "Tomorrow";
  return new Date(t).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
};
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: smooth(), block: "start" });
/** needsMe = still waiting on you (warn); resolved = settled (ok); else quiet. */
const statusColor = (it: { needsMe: boolean; resolved: boolean }) => (it.needsMe ? "var(--warn)" : it.resolved ? "var(--ok)" : undefined);

type Upcoming = { key: string; at: number; title: string; sub: string; icon: ReactNode; timed: boolean; chat: Chat; message: Message };

/** One row, everywhere a list needs one: icon or avatar, title + a line of detail, a trailing figure/time or a chevron. */
function Row({ icon, title, detail, detailColor, figure, time, onOpen }: {
  icon?: ReactNode; title: string; detail?: string; detailColor?: string; figure?: string; time?: string; onOpen: () => void;
}) {
  return (
    <button className={s.row} onClick={onOpen}>
      {icon && <span className={s.rowIcon}>{icon}</span>}
      <span className={s.rowText}>
        <b>{title}</b>
        {detail && <small style={detailColor ? { color: detailColor } : undefined}>{detail}</small>}
      </span>
      {figure && <span className={s.figure}>{figure}</span>}
      {time && <span className={s.time}>{time}</span>}
      {!figure && !time && <IconChevron size={14} />}
    </button>
  );
}

/** A small up/down pill — only rendered when there's a real previous value to compare against. */
function Trend({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return <span className={`${s.trend} ${up ? s.trendUp : s.trendDown}`}>{up ? "↗" : "↘"} {Math.abs(pct)}%</span>;
}

/** A bar chart with a tap-to-toggle tooltip per bar (reliable on touch, unlike hover). */
function BarChart({ bars, valueLabel }: { bars: { key: string; label: string; value: number; highlight?: boolean }[]; valueLabel: (n: number) => string }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className={s.chart} role="list">
      {bars.map((b) => (
        <div
          key={b.key}
          className={s.col}
          role="listitem"
          tabIndex={0}
          aria-label={`${b.label}: ${valueLabel(b.value)}`}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => (v === b.key ? null : b.key)); }}
        >
          {open === b.key && <span className={s.tip}>{valueLabel(b.value)}</span>}
          <span className={s.barCol}><i className={b.highlight ? s.today : undefined} style={{ height: `${Math.max(b.value ? 6 : 0, (b.value / max) * 100)}%` }} /></span>
          <small>{b.label}</small>
        </div>
      ))}
    </div>
  );
}

/** A ring built from `conic-gradient` — no charting library for one shape. */
function Donut({ segments, label, value }: { segments: { value: number; color: string }[]; label: string; value: ReactNode }) {
  const total = segments.reduce((n, seg) => n + seg.value, 0);
  let acc = 0;
  const stops = total > 0
    ? segments.filter((seg) => seg.value > 0).map((seg) => {
        const from = (acc / total) * 360;
        acc += seg.value;
        return `${seg.color} ${from}deg ${(acc / total) * 360}deg`;
      }).join(", ")
    : "var(--fill) 0deg 360deg";
  return (
    <div className={s.donut} style={{ background: `conic-gradient(${stops})` }}>
      <div className={s.donutHole}>
        <small>{label}</small>
        <b>{value}</b>
      </div>
    </div>
  );
}

function Legend({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <ul className={s.legend}>
      {items.map((it) => (
        <li key={it.label}><i style={{ background: it.color }} />{it.label}<b>{it.value}</b></li>
      ))}
    </ul>
  );
}

/** The tap-through to a widget's itemized detail — its own pill, below the chart, not a small header arrow. */
function SeeDetails({ onOpen }: { onOpen: () => void }) {
  return (
    <button className={s.seeMore} onClick={onOpen}>
      <span className={styles.maskIcon} style={{ width: 16, height: 16, ["--src" as string]: "url(/nod/analytics.svg)" }} aria-hidden="true" />
      <span>See details</span>
      <IconChevron size={14} />
    </button>
  );
}

/** A section's own header: a chart above, a tap-through to the itemized detail below. Used where there's no chart to tap directly (Money). */
function WidgetHead({ id, title, onOpen }: { id?: string; title: string; onOpen: () => void }) {
  return (
    <button className={s.widgetHead} id={id} onClick={onOpen}>
      <span>{title}</span>
      <IconChevron size={14} />
    </button>
  );
}

type SheetKind = "needs" | "tasks" | "checklists" | "money" | "polls" | null;

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
    const thisMonth = monthKey(now);
    const lastMonth = prevMonthKey(now);
    const horizon = now + WEEK;
    const spendWeeks = new Array(6).fill(0) as number[];
    let youOwe = 0;
    let owedToYou = 0;
    let spent = 0;
    let spentLastMonth = 0;
    let lastWeekMessages = 0;
    let tasksWaiting = 0;
    const byPriority = { urgent: 0, moderate: 0, low: 0 };
    const accessRequests: { chat: Chat; message: Message; title: string; count: number }[] = [];

    const addSpend = (cents: number, at: number) => {
      const weeksAgo = Math.floor((now - at) / WEEK);
      if (weeksAgo >= 0 && weeksAgo < 6) spendWeeks[5 - weeksAgo] += cents;
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
          }
          if (c.mode === "request") {
            if (c.from.includes(me) && !c.paidBy.includes(me)) youOwe += cents;
            if (message.authorId === me) owedToYou += cents * c.from.filter((id) => !c.paidBy.includes(id)).length;
            if (c.from.includes(me) && c.paidBy.includes(me)) {
              addSpend(cents, message.createdAt);
              const mk = monthKey(message.createdAt);
              if (mk === thisMonth) spent += cents; else if (mk === lastMonth) spentLastMonth += cents;
            }
          }
        }
        if (c.type === "checklist" && message.authorId === me && c.requests.length > 0) {
          accessRequests.push({ chat, message, title: c.title, count: c.requests.length });
        }
        if (c.type === "bill") {
          const shares = billShares(c);
          if (c.paidBy !== me && shares[me] > 0 && !c.paid.includes(me)) youOwe += shares[me];
          if (c.paidBy === me) owedToYou += Object.entries(shares).filter(([id, v]) => id !== me && v > 0 && !c.paid.includes(id)).reduce((n, [, v]) => n + v, 0);
          if (c.paid.includes(me) && shares[me] > 0) {
            addSpend(shares[me], message.createdAt);
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
          const done = doneColumn(c);
          for (const t of Object.values(c.tasks)) {
            if (t.deleted || t.assignee !== me || t.column === done) continue;
            tasksWaiting++;
            byPriority[t.priority]++;
            if (t.due !== null && t.due < horizon) {
              upcoming.push({ key: `task:${t.id}`, at: t.due, timed: false, title: t.title, sub: `${t.due < now ? "Overdue · " : ""}${c.name}`, icon: <IconClock size={15} />, chat, message });
            }
          }
        }
      }
    }

    items.sort((a, b) => b.message.createdAt - a.message.createdAt);
    upcoming.sort((a, b) => a.at - b.at);
    const busiest = [...perChat.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      items, upcoming, youOwe, owedToYou, spent, spentLastMonth, spendWeeks, tasksWaiting, byPriority, lastWeekMessages, accessRequests,
      week: [...perDay.entries()].map(([k, n]) => ({ k, n })),
      busiest: busiest ? { chat: state.data.chats.find((c) => c.id === busiest[0])!, n: busiest[1] } : null,
    };
  }, [state, me, now]);

  const EXCLUDED_FROM_NEEDS = new Set(["project", "poll", "checklist"]);
  const needsRows = data.items.filter((it) => it.needsMe && it.category !== "money" && !EXCLUDED_FROM_NEEDS.has(it.message.card!.type));
  const needsEntries: { key: string; kind: string; title: string; detail: string; chat: Chat; message: Message }[] = [
    ...needsRows.map((it) => ({ key: it.message.id, kind: it.kind, title: it.title, detail: it.detail, chat: it.chat, message: it.message })),
    ...data.accessRequests.map((r) => ({
      key: `access:${r.message.id}`, kind: "Access request", title: r.title,
      detail: `${r.count} ${r.count === 1 ? "person" : "people"} asked to edit`, chat: r.chat, message: r.message,
    })),
  ];
  const needsShown = allNeeds ? needsEntries : needsEntries.slice(0, SHOWN);
  const needsKindCounts = new Map<string, number>();
  for (const it of needsEntries) needsKindCounts.set(it.kind, (needsKindCounts.get(it.kind) ?? 0) + 1);
  const needsByKind = [...needsKindCounts.entries()];

  const moneyRows = data.items.filter((it) => it.category === "money").sort((a, b) => Number(b.needsMe) - Number(a.needsMe) || Number(a.resolved) - Number(b.resolved));
  const openMoney = moneyRows.filter((it) => !it.resolved);
  const paymentsWaiting = moneyRows.filter((it) => it.needsMe).length;

  const checklistRows = data.items.filter((it) => it.message.card!.type === "checklist") as (ActivityItem & { message: Message & { card: Extract<Card, { type: "checklist" }> } })[];
  const openChecklists = checklistRows.filter((it) => !it.resolved);
  const listDone = checklistRows.reduce((n, it) => n + it.message.card.items.filter((i) => i.doneBy).length, 0);
  const listTotal = checklistRows.reduce((n, it) => n + it.message.card.items.length, 0);
  const listLeft = listTotal - listDone;

  const pollRows = data.items.filter((it) => it.message.card!.type === "poll") as (ActivityItem & { message: Message & { card: Extract<Card, { type: "poll" }> } })[];
  const pollAwaiting = pollRows.filter((it) => it.needsMe);
  const pollVotedOpen = pollRows.filter((it) => !it.needsMe && !it.resolved);
  const pollClosed = pollRows.filter((it) => it.resolved);
  const pollGroups = [
    { label: "Awaiting your vote", rows: [...pollAwaiting].sort((a, b) => a.message.card.closesAt - b.message.card.closesAt) },
    { label: "You voted", rows: pollVotedOpen },
    { label: "Closed", rows: pollClosed },
  ].filter((g) => g.rows.length > 0);

  const upcomingByDay = data.upcoming.slice(0, 10).reduce<{ day: string; items: Upcoming[] }[]>((groups, u) => {
    const day = u.at < now && !u.timed ? "Overdue" : dayLabel(u.at, now);
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(u); else groups.push({ day, items: [u] });
    return groups;
  }, []);

  const weekTotal = data.week.reduce((n, x) => n + x.n, 0);
  const total = data.items.length;

  const NEEDS_TONE: Record<string, string> = { Event: TONES.ochre, Plan: TONES.clay, "Access request": TONES.denim };
  const PRIORITY_TONE = { urgent: TONES.clay, moderate: TONES.ochre, low: TONES.sage };
  const POLL_TONE = { awaiting: TONES.ochre, voted: TONES.sage, closed: "var(--fill-2)" };

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
              <div className={s.tiles}>
                <button className={`${s.tile} ${s.tileAccent}`} onClick={() => jump("an-money")}>
                  <div className={s.tileTop}><b>{money(data.spent)}</b><Trend current={data.spent} previous={data.spentLastMonth} /></div>
                  <span>Spent this month</span>
                </button>
                <button className={s.tile} onClick={() => jump("an-money")}>
                  <b>{paymentsWaiting}</b>
                  <span>{paymentsWaiting === 1 ? "Payment waiting" : "Payments waiting"}</span>
                </button>
                <button className={s.tile} onClick={() => jump("an-tasks")}>
                  <b>{data.tasksWaiting}</b>
                  <span>{data.tasksWaiting === 1 ? "Task waiting" : "Tasks waiting"}</span>
                </button>
                <button className={s.tile} onClick={() => jump("an-needs")}>
                  <b>{needsEntries.length}</b>
                  <span>{needsEntries.length === 1 ? "Needs you" : "Need you"}</span>
                </button>
              </div>

              <section className={s.widget} id="an-needs">
                <p className={s.widgetLabel}>Needs your attention</p>
                {needsEntries.length === 0 ? (
                  <p className={s.hint}>Nothing is waiting on you. Votes, RSVPs and your turns show up here.</p>
                ) : (
                  <>
                    <button className={s.donutBig} onClick={() => setSheet("needs")}>
                      <Donut segments={needsByKind.map(([k, v]) => ({ value: v, color: NEEDS_TONE[k] ?? "var(--ink-3)" }))} label="need you" value={needsEntries.length} />
                    </button>
                    <Legend items={needsByKind.map(([k, v]) => ({ label: k, value: v, color: NEEDS_TONE[k] ?? "var(--ink-3)" }))} />
                    <SeeDetails onOpen={() => setSheet("needs")} />
                  </>
                )}
              </section>

              <section className={s.widget} id="an-tasks">
                <p className={s.widgetLabel}>Tasks</p>
                {data.tasksWaiting === 0 ? (
                  <p className={s.hint}>Tasks assigned to you, on any board, show up here.</p>
                ) : (
                  <>
                    <button className={s.donutBig} onClick={() => setSheet("tasks")}>
                      <Donut
                        segments={[
                          { value: data.byPriority.urgent, color: PRIORITY_TONE.urgent },
                          { value: data.byPriority.moderate, color: PRIORITY_TONE.moderate },
                          { value: data.byPriority.low, color: PRIORITY_TONE.low },
                        ]}
                        label="waiting"
                        value={data.tasksWaiting}
                      />
                    </button>
                    <Legend items={[
                      { label: "Urgent", value: data.byPriority.urgent, color: PRIORITY_TONE.urgent },
                      { label: "Moderate", value: data.byPriority.moderate, color: PRIORITY_TONE.moderate },
                      { label: "Low", value: data.byPriority.low, color: PRIORITY_TONE.low },
                    ]} />
                    <SeeDetails onOpen={() => setSheet("tasks")} />
                  </>
                )}
              </section>

              <section className={s.widget} id="an-soon" aria-labelledby="an-soon-title">
                <p className={s.sectionHead}><span id="an-soon-title">Coming up</span><em>next 7 days</em></p>
                {upcomingByDay.length === 0 ? (
                  <p className={s.hint}>No events, plan stops, reminders or due tasks this week.</p>
                ) : (
                  <div className={s.list}>
                    {upcomingByDay.map((g) => (
                      <div key={g.day} className={s.dayGroup}>
                        <p className={`${s.day} ${g.day === "Overdue" ? s.late : ""}`}>{g.day}</p>
                        {g.items.map((u) => (
                          <Row key={u.key} icon={u.icon} title={u.title} detail={u.sub} time={u.timed ? clock(u.at) : undefined} onOpen={() => open(u.chat, u.message)} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={s.widget} id="an-money">
                <WidgetHead title="Money" onOpen={() => setSheet("money")} />
                <div
                  className={s.tapCard}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSheet("money")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSheet("money"); } }}
                >
                  <div className={s.money}>
                    <div>
                      <span>You owe</span>
                      <b style={{ color: data.youOwe ? "var(--warn)" : undefined }}>{money(data.youOwe)}</b>
                    </div>
                    <div>
                      <span>Owed to you</span>
                      <b>{money(data.owedToYou)}</b>
                    </div>
                  </div>
                  <div className={s.chartCard}>
                    <p className={s.chartLabel}>Spent, last 6 weeks</p>
                    <BarChart
                      bars={data.spendWeeks.map((v, i) => ({ key: String(i), label: i === 5 ? "This wk" : `${5 - i}w ago`, value: v, highlight: i === 5 }))}
                      valueLabel={(n) => money(n)}
                    />
                  </div>
                </div>
              </section>

              <section className={s.widget}>
                <p className={s.widgetLabel}>Checklists</p>
                {listTotal === 0 ? (
                  <p className={s.hint}>Checklists from your chats, and how far along they are.</p>
                ) : (
                  <>
                    <button className={s.donutBig} onClick={() => setSheet("checklists")}>
                      <Donut segments={[{ value: listDone, color: TONES.sage }, { value: listLeft, color: "var(--fill-2)" }]} label="ticked" value={`${Math.round((listDone / listTotal) * 100)}%`} />
                    </button>
                    <Legend items={[{ label: "Done", value: listDone, color: TONES.sage }, { label: "Left", value: listLeft, color: "var(--fill-2)" }]} />
                    <SeeDetails onOpen={() => setSheet("checklists")} />
                  </>
                )}
              </section>

              <section className={s.widget}>
                <p className={s.widgetLabel}>Polls</p>
                {pollRows.length === 0 ? (
                  <p className={s.hint}>Polls from your chats, and how the vote is going.</p>
                ) : (
                  <>
                    <button className={s.donutBig} onClick={() => setSheet("polls")}>
                      <Donut
                        segments={[
                          { value: pollAwaiting.length, color: POLL_TONE.awaiting },
                          { value: pollVotedOpen.length, color: POLL_TONE.voted },
                          { value: pollClosed.length, color: POLL_TONE.closed },
                        ]}
                        label="awaiting"
                        value={pollAwaiting.length}
                      />
                    </button>
                    <Legend items={[
                      { label: "Awaiting your vote", value: pollAwaiting.length, color: POLL_TONE.awaiting },
                      { label: "You voted", value: pollVotedOpen.length, color: POLL_TONE.voted },
                      { label: "Closed", value: pollClosed.length, color: POLL_TONE.closed },
                    ]} />
                    <SeeDetails onOpen={() => setSheet("polls")} />
                  </>
                )}
              </section>

              <section className={s.widget} aria-labelledby="an-week-title">
                <p className={s.sectionHead}>
                  <span id="an-week-title">This week</span>
                  <em>{weekTotal} messages</em>
                  <Trend current={weekTotal} previous={data.lastWeekMessages} />
                </p>
                <div className={s.chartCard}>
                  <BarChart
                    bars={data.week.map((x, i) => ({ key: x.k, label: i === data.week.length - 1 ? "Today" : weekday(new Date(`${x.k}T12:00`).getTime()), value: x.n, highlight: i === data.week.length - 1 }))}
                    valueLabel={(n) => `${n} ${n === 1 ? "message" : "messages"}`}
                  />
                  {data.busiest && (
                    <p className={s.note}>
                      Busiest: <b>{chatIdentity(data.busiest.chat, me, userById).label}</b> with {data.busiest.n} {data.busiest.n === 1 ? "message" : "messages"}
                    </p>
                  )}
                </div>
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

      {sheet === "money" && (
        <Sheet title="Money" onClose={() => setSheet(null)}>
          {(close) => (
            <>
              <div className={s.money}>
                <div><span>You owe</span><b style={{ color: data.youOwe ? "var(--warn)" : undefined }}>{money(data.youOwe)}</b></div>
                <div><span>Owed to you</span><b>{money(data.owedToYou)}</b></div>
              </div>
              {moneyRows.length > 0 && (
                <div className={s.list}>
                  {moneyRows.map((it) => (
                    <Row
                      key={it.message.id}
                      icon={cardIcon(it.message.card!)}
                      title={it.title}
                      detail={it.detail}
                      detailColor={statusColor(it)}
                      figure={it.stats[0]?.text}
                      onOpen={() => close(() => open(it.chat, it.message))}
                    />
                  ))}
                </div>
              )}
              {openMoney.length > 0 && <p className={s.note}>{openMoney.length} open {openMoney.length === 1 ? "item" : "items"}</p>}
            </>
          )}
        </Sheet>
      )}

      {sheet === "checklists" && (
        <Sheet title="Checklists" onClose={() => setSheet(null)}>
          {(close) => checklistRows.length === 0 ? (
            <p className={s.hint}>Checklists from your chats, and how far along they are.</p>
          ) : (
            <div className={s.list}>
              {(openChecklists.length ? openChecklists : checklistRows).map((it) => {
                const done = it.message.card.items.filter((i) => i.doneBy).length;
                const totalItems = it.message.card.items.length;
                const pct = totalItems ? Math.round((done / totalItems) * 100) : 0;
                return (
                  <button key={it.message.id} className={s.row} onClick={() => close(() => open(it.chat, it.message))}>
                    <span className={s.rowText}>
                      <b>{it.title}</b>
                      <small>{done === totalItems ? "All done" : `${totalItems - done} left`} · {chatIdentity(it.chat, me, userById).label}</small>
                      <span className={s.bar} role="img" aria-label={`${done} of ${totalItems} done`}><i style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span className={s.figure}>{pct}%</span>
                  </button>
                );
              })}
            </div>
          )}
        </Sheet>
      )}

      {sheet === "polls" && (
        <Sheet title="Polls" onClose={() => setSheet(null)}>
          {(close) => pollRows.length === 0 ? (
            <p className={s.hint}>Polls from your chats, and how the vote is going.</p>
          ) : (
            <div className={s.list}>
              {pollGroups.map((g) => (
                <div key={g.label} className={s.dayGroup}>
                  <p className={s.day}>{g.label}</p>
                  {g.rows.map((it) => (
                    <Row
                      key={it.message.id}
                      icon={<IconPoll size={15} />}
                      title={it.title}
                      detail={`${it.detail} · ${chatIdentity(it.chat, me, userById).label}`}
                      detailColor={statusColor(it)}
                      figure={it.stats[0]?.text}
                      onOpen={() => close(() => open(it.chat, it.message))}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
