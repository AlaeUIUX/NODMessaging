"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { dayKey, lastSevenDays } from "@/lib/chat/mind";
import { billShares, doneColumn, money, unclaimedItems } from "@/lib/chat/ops";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Chat, ChatState, Message, Task } from "@/lib/chat/types";
import { useWidgets, WIDGETS, type Widget } from "@/lib/chat/widgets";
import {
  BLUE, ChecklistTrack, cumulative, DAY, daysInMonth, dummyBaseline, dummyMessages, euro, monthKey,
  monthName, people, plural, prevMonthKey, prevMonthName, Row, shortDate, shortTime, SHOWN, WEEK, type Upcoming,
} from "./AnalyticsParts";
import { outcome } from "./Artifacts";
import Avatar from "./Avatar";
import {
  IconBell, IconBoard, IconCalendar, IconChecklist, IconClock, IconGrid, IconLocation, IconMinus, IconMoneyReceive,
  IconMoneySend, IconPlus, IconPoll, IconReceipt, IconRoute, IconSliders,
} from "./Icons";
import Logo from "./Logo";
import { HoldMenu } from "./MindHold";
import { MyTasks } from "./Project";
import { Sheet, useNow } from "./ui";
import { TrendChart } from "./Charts";
import { BoardsSheet, euroShort, nextUp, spendSeries, spendTicks, WidgetBody, whenText } from "./WidgetBodies";
import { AddWidgetSheet, EditWidgetSheet, WidgetBoard, widgetTitle } from "./Widgets";
import styles from "./chat.module.css";
import s from "./activity.module.css";
import g from "./widgets.module.css";

/**
 * Analytics: your dashboard, made of widgets you pick, size and arrange
 * (lib/chat/widgets.ts; drawn in WidgetBodies.tsx). Below is what each
 * kind of card feeds, from the original condensed dashboard —
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


type SheetKind = "needs" | "tasks" | "checklists" | "spent" | "owe" | "owed" | "boards" | "polls" | "plans" | "week" | "chats" | null;
export type NeedsCategory = "Votes" | "RSVP" | "Payment" | "Request";
export const NEEDS_ACTION: Record<NeedsCategory, string> = { Votes: "Vote", RSVP: "Going", Payment: "Pay", Request: "Review" };
const CARD_NEEDS_CATEGORY: Partial<Record<Card["type"], NeedsCategory>> = { poll: "Votes", event: "RSVP", plan: "RSVP", payment: "Payment", bill: "Payment" };
export const NEEDS_TONE: Record<NeedsCategory, string> = { Votes: BLUE.base, RSVP: BLUE.a2, Payment: BLUE.a3, Request: BLUE.a4 };
export const NEEDS_INK: Record<NeedsCategory, boolean> = { Votes: false, RSVP: false, Payment: true, Request: true };

/** Open and untouched this long: stalled. */
export const STALLED_AFTER = 3 * DAY;

/** A task on any board in your chats, with where it lives. */
export interface BoardTask {
  task: Task;
  board: string;
  boardKey: string;
  chat: Chat;
  message: Message;
  stage: "todo" | "doing" | "done";
  /** When anything on it last changed. */
  touched: number;
}
export interface BoardSummary { key: string; name: string; chat: Chat; message: Message; todo: number; doing: number; done: number }
export interface PollSummary {
  key: string; question: string; chat: Chat; message: Message;
  open: boolean; voted: boolean; closesAt: number; voters: number;
  /** Most votes first. */
  options: { label: string; votes: number; mine: boolean }[];
}
export interface PlanSummary {
  key: string; title: string; chat: Chat; message: Message; total: number; done: number;
  /** Stops still to do, soonest first; `at` is the stop's time, or its day. */
  next: { key: string; title: string; at: number; timed: boolean; place?: string }[];
}
export interface NeedsEntry { key: string; category: NeedsCategory; title: string; detail: string; chat: Chat; message: Message }
type ChecklistItem = ActivityItem & { message: Message & { card: Extract<Card, { type: "checklist" }> } };

/** Everything the dashboard's widgets draw from, in one pass over your chats. */
export function buildDashboard(state: ChatState, me: string, now: number) {
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
  const boardTasks: BoardTask[] = [];
  const boards: BoardSummary[] = [];
  const polls: PollSummary[] = [];
  const plans: PlanSummary[] = [];

  const addSpend = (cents: number, at: number) => {
    const mk = monthKey(at);
    const day = new Date(at).getDate();
    if (mk === thisMonth && day >= 1 && day <= curDays) spendCurDaily[day - 1] += cents;
    else if (mk === lastMonth && day >= 1 && day <= prevDaysTotal) spendPrevDaily[day - 1] += cents;
  };

  for (const chat of state.chats) {
    if (!chat.memberIds.includes(me)) continue;
    const label = chatIdentity(chat, me, userById).label;
    const messages = state.messages[chat.id] ?? [];

    for (const m of [...(state.archive[chat.id] ?? []), ...messages]) {
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
        const stops = c.days.flatMap((d) => d.stops.map((x) => ({ x, day: d.date })));
        plans.push({
          key: message.id, title: c.title, chat, message,
          total: stops.length, done: stops.filter(({ x }) => x.doneBy).length,
          next: stops
            .filter(({ x, day }) => !x.doneBy && (x.at ?? day + DAY) >= now)
            .map(({ x, day }) => ({ key: x.id, title: x.title, at: x.at ?? day, timed: x.at !== null, place: x.place }))
            .sort((a, b) => a.at - b.at),
        });
      }
      if (c.type === "poll") {
        const voters = new Set(c.options.flatMap((o) => o.votes)).size;
        polls.push({
          key: message.id, question: c.question, chat, message,
          open: c.closedAt === null && now < c.closesAt,
          voted: c.options.some((o) => o.votes.includes(me)),
          closesAt: c.closedAt ?? c.closesAt, voters,
          options: c.options.map((o) => ({ label: o.label, votes: o.votes.length, mine: o.votes.includes(me) })).sort((a, b) => b.votes - a.votes),
        });
      }
      if (c.type === "project") {
        const doneCol = doneColumn(c);
        const firstCol = c.columns[0]?.id;
        const summary: BoardSummary = { key: message.id, name: c.name, chat, message, todo: 0, doing: 0, done: 0 };
        for (const t of Object.values(c.tasks)) {
          if (t.deleted) continue;
          const stage = t.column === doneCol ? "done" : t.column === firstCol ? "todo" : "doing";
          summary[stage]++;
          boardTasks.push({ task: t, board: c.name, boardKey: message.id, chat, message, stage, touched: Math.max(t.createdAt, ...Object.values(t.updatedAt)) });
          if (t.assignee !== me) continue;
          if (stage === "done") byStage.done++;
          else if (stage === "todo") byStage.todo++;
          else byStage.inProgress++;
          if (stage !== "done" && t.due !== null && t.due < now) overdueTasks++;
          if (stage !== "done" && t.due !== null && t.due < horizon) {
            upcoming.push({ key: `task:${t.id}`, at: t.due, timed: false, title: t.title, sub: `${t.due < now ? "Overdue · " : ""}${c.name}`, icon: <IconClock size={15} />, chat, message });
          }
        }
        boards.push(summary);
      }
    }
  }

  items.sort((a, b) => b.message.createdAt - a.message.createdAt);
  upcoming.sort((a, b) => a.at - b.at);
  polls.sort((a, b) => b.message.createdAt - a.message.createdAt);
  plans.sort((a, b) => (a.next[0]?.at ?? Infinity) - (b.next[0]?.at ?? Infinity));
  const chatsWeek = [...perChat.entries()]
    .map(([id, n]) => ({ chat: state.chats.find((c) => c.id === id)!, n }))
    .filter((x) => x.chat)
    .sort((a, b) => b.n - a.n);

  // A plausible few-euros-a-day baseline, so the hero chart is never a flat empty
  // line on a fresh account or right after the month turns over — added on top of
  // whatever's really there, and folded into the headline totals so they agree.
  const dummyCur = spendCurDaily.map((_, i) => dummyBaseline(i));
  // Last month gets its own shape (a few days along, a little heavier), so the comparison means something.
  const dummyPrev = spendPrevDaily.map((_, i) => Math.round(dummyBaseline(i + 9) * 1.18));
  const spentOther = dummyCur.reduce((a, b) => a + b, 0);
  spent += spentOther;
  spentLastMonth += dummyPrev.reduce((a, b) => a + b, 0);
  const spendCurCum = cumulative(spendCurDaily.map((v, i) => v + dummyCur[i]));
  const spendPrevCum = cumulative(spendPrevDaily.map((v, i) => v + dummyPrev[i]));

  // Same reasoning as the spend chart: a demo week shouldn't read as mostly-empty
  // just because this prototype's history is thin on most days.
  const week = [...perDay.entries()].map(([k, n], i) => ({ k, n: n + dummyMessages(i) }));
  const dummyWeekTotal = week.reduce((total, _, i) => total + dummyMessages(i), 0);

  const needsEntries: NeedsEntry[] = [
    ...items
      .filter((it) => it.needsMe && !["project", "checklist"].includes(it.message.card!.type))
      .map((it) => ({ key: it.message.id, category: CARD_NEEDS_CATEGORY[it.message.card!.type]!, title: it.title, detail: it.detail, chat: it.chat, message: it.message })),
    ...accessRequests.map((r) => ({
      key: `access:${r.message.id}`, category: "Request" as const, title: r.title,
      detail: `${r.count} ${r.count === 1 ? "person" : "people"} asked to edit`, chat: r.chat, message: r.message,
    })),
  ];
  const needsCounts: Record<NeedsCategory, number> = { Votes: 0, RSVP: 0, Payment: 0, Request: 0 };
  for (const it of needsEntries) needsCounts[it.category]++;

  const checklistList = (items.filter((it) => it.message.card!.type === "checklist") as ChecklistItem[])
    .sort((a, b) => b.message.createdAt - a.message.createdAt);

  return {
    items, upcoming, youOwe, owedToYou, spent, spentLastMonth, lastWeekMessages: lastWeekMessages + dummyWeekTotal, owedByIds,
    byStage, overdueTasks, spendCurCum, spendPrevCum, heroNow, week, spentOther,
    spentRows: spentRows.sort((a, b) => b.amount - a.amount),
    oweRows: oweRows.sort((a, b) => b.amount - a.amount),
    owedRows: owedRows.sort((a, b) => b.amount - a.amount),
    chatsWeek,
    busiest: chatsWeek[0] ?? null,
    needsEntries, needsCounts,
    checklistList,
    openChecklists: checklistList.filter((it) => !it.resolved),
    doneChecklists: checklistList.filter((it) => it.resolved),
    listDone: checklistList.reduce((n, it) => n + it.message.card.items.filter((i) => i.doneBy).length, 0),
    listTotal: checklistList.reduce((n, it) => n + it.message.card.items.length, 0),
    boardTasks, boards, polls, plans,
  };
}
export type DashData = ReturnType<typeof buildDashboard>;

export default function AnalyticsTab({ onOpenChat, mode, onOpenWidget, onSettings }: {
  onOpenChat: (chat: Chat, messageId?: string) => void;
  /** Your avatar opens Settings, as on every tab. */
  onSettings: () => void;
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
  /** The widget a sheet was opened from: a board sheet follows its view and board. */
  const [from, setFrom] = useState<Widget | null>(null);
  const open = (chat: Chat, message: Message) => (mode === "v2" ? onOpenWidget(chat, message) : onOpenChat(chat, message.id));

  const widgets = useWidgets(me);
  const [editing, setEditing] = useState(false);
  /** The add sheet: on its intro (an empty dashboard), or straight to the widgets. */
  const [adding, setAdding] = useState<"intro" | "add" | null>(null);
  /** The widget just added, which pops in. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [menu, setMenu] = useState<{ w: Widget; el: HTMLElement } | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; undo?: () => void; leaving?: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => buildDashboard(state.data, me, now), [state.data, me, now]);

  const flash = (text: string, undo?: () => void) => {
    const id = Date.now();
    setToast({ text, id, undo });
    setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), 3400);
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3620);
  };
  const remove = (w: Widget) => {
    const at = widgets.list.findIndex((x) => x.id === w.id);
    widgets.remove(w.id);
    flash(`${WIDGETS[w.kind].label} removed`, () => widgets.add(w, at));
  };
  const add = (w: Widget) => {
    const first = widgets.list.length === 0;
    widgets.add(w);
    setFresh(w.id);
    setTimeout(() => setFresh((x) => (x === w.id ? null : x)), 900);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (first) flash("Your first widget. Hold it to change it or move it.");
  };
  const startAdding = () => setAdding(widgets.list.length ? "add" : "intro");

  const openSheet = (kind: SheetKind, w?: Widget) => { setFrom(w ?? null); setSheet(kind); };
  const tapWidget = (w: Widget) => {
    switch (w.kind) {
      case "spend": return openSheet("spent");
      case "balances": return openSheet(w.view === "owed" ? "owed" : "owe");
      case "needs": return openSheet("needs");
      case "tasks": return openSheet("tasks");
      case "boards": return openSheet("boards", w);
      case "checklists": return openSheet("checklists");
      case "polls": return openSheet("polls", w);
      case "plans": return openSheet("plans");
      case "week": return openSheet("week");
      case "messages": return openSheet("chats");
      case "next": {
        const first = nextUp(data, w.view, now)[0];
        if (first) open(first.chat, first.message);
      }
    }
  };
  const body = (w: Widget) => <WidgetBody w={w} d={data} now={now} me={me} open={open} sheet={(k) => openSheet(k as SheetKind, w)} />;
  const titleOf = (w: Widget) => widgetTitle(w, data.boards);
  const boardSheetTasks = from?.kind === "boards" && from.board ? data.boardTasks.filter((t) => t.boardKey === from.board) : data.boardTasks;

  return (
    <>
      <header className={styles.profile}>
        <div className={styles.profileRow}>
          <div className={s.greeting}>
            <span className={s.greetingDate}>{dateLabel}</span>
            <b className={s.greetingText}>{greetingWord}, {meUser.name}</b>
          </div>
          <div className={g.headActions}>
            <button className={g.plus} onClick={startAdding} aria-label="Add a widget"><IconPlus size={20} /></button>
            {editing ? (
              <button className={g.done} onClick={() => setEditing(false)}>Done</button>
            ) : (
              <button className={`${styles.profileAvatar} ${styles.avatarBtn}`} onClick={onSettings} aria-label="Settings">
                <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} photo={meUser.photo} size={40} shape="circle" />
                <span className={styles.orgBadge}><Logo size={12} /></span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll} ref={scrollRef}>
          {!widgets.ready ? null : widgets.list.length === 0 ? (
            // Nothing yet: a sketch of the widgets to come, and the way in.
            <div className={g.emptyDash}>
              <div className={g.sketch} aria-hidden="true">
                <span><span className={g.sketchBits}><i /><i /></span></span>
                <span><span className={g.sketchBits}><i /><i /></span></span>
                <span><span className={g.sketchPlus}><i><IconPlus size={18} /></i></span></span>
              </div>
              <h2>Make this page yours</h2>
              <p>Pick what you want to keep an eye on (money, boards, polls, plans) and it becomes a widget you can size and move.</p>
              <button className={styles.primaryWide} onClick={startAdding}>Set up your dashboard</button>
            </div>
          ) : (
            <WidgetBoard
              widgets={widgets.list}
              editing={editing}
              scroll={scrollRef}
              render={body}
              titleOf={titleOf}
              fresh={fresh}
              onTap={tapWidget}
              onMenu={(w, el) => setMenu({ w, el })}
              closeMenu={() => setMenu(null)}
              onPlace={widgets.place}
              onEdit={setEditingWidget}
              onRemove={remove}
              onEditAll={() => setEditing(true)}
              onAdd={startAdding}
            />
          )}
        </div>
      </div>

      {menu && (
        <HoldMenu
          anchor={menu.el}
          title={titleOf(menu.w)}
          onClose={() => setMenu(null)}
          actions={[
            { id: "edit", label: "Edit widget", icon: <IconSliders size={18} />, run: () => setEditingWidget(menu.w) },
            { id: "all", label: "Edit dashboard", icon: <IconGrid size={18} />, run: () => setEditing(true) },
            "sep",
            { id: "remove", label: "Remove widget", icon: <IconMinus size={18} />, danger: true, run: () => remove(menu.w) },
          ]}
        />
      )}

      {adding && (
        <AddWidgetSheet
          render={body}
          boards={data.boards}
          intro={adding === "intro"}
          onAdd={add}
          onStarter={() => { widgets.starter(); flash("Here’s a suggested set. Hold any widget to change it."); }}
          onClose={() => setAdding(null)}
        />
      )}
      {editingWidget && (
        <EditWidgetSheet
          w={editingWidget}
          render={body}
          boards={data.boards}
          index={widgets.list.findIndex((x) => x.id === editingWidget.id)}
          count={widgets.list.length}
          onSave={(patch) => widgets.update(editingWidget.id, patch)}
          onStep={(by) => widgets.step(editingWidget.id, by)}
          onRemove={() => remove(editingWidget)}
          onClose={() => setEditingWidget(null)}
        />
      )}

      {sheet === "needs" && (
        <Sheet title="Needs your attention" onClose={() => setSheet(null)}>
          {(close) => data.needsEntries.length === 0 ? (
            <p className={s.hint}>Nothing is waiting on you. Votes, RSVPs and your turns show up here.</p>
          ) : (
            <div className={s.list}>
              {(allNeeds ? data.needsEntries : data.needsEntries.slice(0, SHOWN + 3)).map((it) => (
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
              {data.needsEntries.length > SHOWN + 3 && (
                <button className={s.more} onClick={() => setAllNeeds((v) => !v)} aria-expanded={allNeeds}>
                  {allNeeds ? "Show fewer" : `Show all ${data.needsEntries.length}`}
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

      {sheet === "boards" && (
        <BoardsSheet
          tasks={boardSheetTasks}
          view={from?.kind === "boards" ? from.view : "priority"}
          title={from?.board ? data.boards.find((b) => b.key === from.board)?.name ?? "Boards" : "Boards"}
          now={now}
          onOpen={(t) => open(t.chat, t.message)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === "polls" && (
        <Sheet title="Polls" onClose={() => setSheet(null)}>
          {(close) => data.polls.length === 0 ? (
            <p className={s.hint}>Polls from your chats show up here, with how the vote is going.</p>
          ) : (
            <div className={s.list}>
              {data.polls.map((p) => (
                <Row
                  key={p.key}
                  icon={<IconPoll size={15} />}
                  title={p.question}
                  detail={`${p.open ? (p.voted ? "You voted" : "Awaiting your vote") : "Closed"} · ${p.options[0]?.votes ? `${p.options[0].label} leads` : "No votes yet"} · ${chatIdentity(p.chat, me, userById).label}`}
                  detailColor={p.open && !p.voted ? "var(--warn)" : undefined}
                  action={p.open && !p.voted ? "Vote" : undefined}
                  onOpen={() => close(() => open(p.chat, p.message))}
                />
              ))}
            </div>
          )}
        </Sheet>
      )}

      {sheet === "plans" && (
        <Sheet title="Plans" onClose={() => setSheet(null)}>
          {(close) => data.plans.length === 0 ? (
            <p className={s.hint}>Plans from your chats show up here, stop by stop.</p>
          ) : (
            <div className={s.list}>
              {data.plans.map((p) => (
                <Row
                  key={p.key}
                  icon={<IconRoute size={15} />}
                  title={p.title}
                  detail={`${p.done} of ${plural(p.total, "stop")} done${p.next[0] ? ` · next: ${p.next[0].title}` : ""}`}
                  onOpen={() => close(() => open(p.chat, p.message))}
                />
              ))}
            </div>
          )}
        </Sheet>
      )}

      {sheet === "week" && (
        <Sheet title="This week" onClose={() => setSheet(null)}>
          {(close) => data.upcoming.length === 0 ? (
            <p className={s.hint}>No events, plan stops, reminders or due tasks this week.</p>
          ) : (
            <div className={s.list}>
              {data.upcoming.map((u) => (
                <Row
                  key={u.key}
                  icon={u.icon}
                  title={u.title}
                  detail={u.sub}
                  time={whenText(u, now)}
                  onOpen={() => close(() => open(u.chat, u.message))}
                />
              ))}
            </div>
          )}
        </Sheet>
      )}

      {sheet === "chats" && (
        <Sheet title="Busiest chats" onClose={() => setSheet(null)}>
          {(close) => data.chatsWeek.length === 0 ? (
            <p className={s.hint}>No messages in the last seven days.</p>
          ) : (
            <div className={s.list}>
              {data.chatsWeek.map(({ chat, n }) => {
                const id = chatIdentity(chat, me, userById);
                return (
                  <Row
                    key={chat.id}
                    icon={<Avatar glyph={id.glyph} tone={id.tone} photo={id.photo} size={32} shape={chat.kind === "dm" ? "circle" : "square"} />}
                    title={id.label}
                    detail="Last 7 days"
                    figure={plural(n, "message")}
                    onOpen={() => close(() => onOpenChat(chat))}
                  />
                );
              })}
            </div>
          )}
        </Sheet>
      )}

      {sheet === "spent" && (
        <Sheet title={`Spent in ${monthName(data.heroNow)}`} onClose={() => setSheet(null)}>
          {(close) => (
            <>
              <div className={s.chartCard}>
                <p className={s.chartLabel}>So far this month, against {prevMonthName(data.heroNow)}</p>
                <div className={s.sheetChart}>
                  <TrendChart
                    data={spendSeries(data, "area")}
                    kind="area"
                    format={money}
                    axisFormat={euroShort}
                    names={{ value: monthName(data.heroNow), compare: prevMonthName(data.heroNow) }}
                    xTicks={spendTicks(data)}
                    yAxis
                  />
                </div>
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
          {(close) => data.checklistList.length === 0 ? (
            <p className={s.hint}>Checklists from your chats, and how far along they are.</p>
          ) : (
            <>
              {data.openChecklists.length > 0 && <p className={s.shs}>In progress · {data.openChecklists.length}</p>}
              <div className={s.crows}>
                {data.openChecklists.map((it) => {
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
              {data.doneChecklists.length > 0 && <p className={s.shs}>Done · {data.doneChecklists.length}</p>}
              <div className={s.crows}>
                {data.doneChecklists.map((it) => {
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

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${styles.mindToast} ${toast.undo ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
          <span className={styles.toastText}>{toast.text}</span>
          {toast.undo && <button className={styles.toastBtn} onClick={() => { setToast(null); toast.undo!(); }}>Undo</button>}
        </div>
      )}
    </>
  );
}
