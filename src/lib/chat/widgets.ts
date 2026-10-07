"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The dashboard is yours: a column of widgets, like a phone's home screen.
 * Each widget is one kind (spending, boards, polls…), one size (small sits
 * beside another small one; medium and large take the full width) and one
 * view: what it shows (a board widget by priority, by board, by deadline…).
 *
 * Kept per person (nod.widgets.<me>). Everyone starts from an empty page and
 * builds their own, with a short intro the first time (or the starter set).
 */

export type WidgetKind =
  | "spend" | "balances" | "needs" | "tasks" | "boards" | "checklists"
  | "polls" | "plans" | "next" | "week" | "messages";
export type WidgetSize = "small" | "medium" | "large";

export interface Widget {
  id: string;
  kind: WidgetKind;
  size: WidgetSize;
  /** What it shows; one of its kind's views. */
  view: string;
  /** Boards only: one board (its message id) instead of all of them. */
  board?: string;
}

export interface WidgetView { id: string; label: string; sub: string }
export interface WidgetSpec {
  label: string;
  /** One line for the add sheet. */
  blurb: string;
  sizes: WidgetSize[];
  views: WidgetView[];
}

export const SIZE_LABEL: Record<WidgetSize, string> = { small: "Small", medium: "Medium", large: "Large" };

export const WIDGETS: Record<WidgetKind, WidgetSpec> = {
  spend: {
    label: "Spending",
    blurb: "What you spent this month, against last month",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "month", label: "This month", sub: "Day by day, against last month" },
      { id: "top", label: "Biggest spends", sub: "Where most of it went" },
    ],
  },
  balances: {
    label: "Balances",
    blurb: "What you owe and what you’re owed",
    sizes: ["small", "medium"],
    views: [
      { id: "both", label: "Both", sub: "You owe and owed to you" },
      { id: "owe", label: "You owe", sub: "Requests and bills to pay" },
      { id: "owed", label: "Owed to you", sub: "Who still has to pay you" },
    ],
  },
  needs: {
    label: "Needs you",
    blurb: "Votes, RSVPs, payments and requests waiting on you",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "summary", label: "Summary", sub: "How many, by kind" },
      { id: "list", label: "List", sub: "Each one, with its action" },
    ],
  },
  tasks: {
    label: "Your tasks",
    blurb: "Tasks assigned to you on every board",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "stage", label: "By stage", sub: "To do, in progress, done" },
      { id: "due", label: "Due soon", sub: "What’s due next" },
    ],
  },
  boards: {
    label: "Boards",
    blurb: "Every task on your boards, sorted the way you need",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "priority", label: "By priority", sub: "High, medium, low, none" },
      { id: "project", label: "By board", sub: "How far along each board is" },
      { id: "deadlines", label: "Deadlines", sub: "Overdue, this week, later" },
      { id: "missing", label: "Missing", sub: "No one on it, or no due date" },
      { id: "stalled", label: "Stalled", sub: "Open, and untouched for days" },
    ],
  },
  checklists: {
    label: "Checklists",
    blurb: "How far along every list is",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "open", label: "Open lists", sub: "Lists with something left" },
      { id: "all", label: "All lists", sub: "Done ones too" },
    ],
  },
  polls: {
    label: "Polls",
    blurb: "Polls waiting for your vote, and how they’re going",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "waiting", label: "Your vote", sub: "Open polls you haven’t voted on" },
      { id: "results", label: "Results", sub: "What’s winning in each poll" },
    ],
  },
  plans: {
    label: "Plans",
    blurb: "Trips and plans, stop by stop",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "progress", label: "Progress", sub: "Stops done in each plan" },
      { id: "next", label: "Next stops", sub: "Where you’re headed next" },
    ],
  },
  next: {
    label: "Up next",
    blurb: "The next thing on your calendar, counting down",
    sizes: ["small", "medium"],
    views: [
      { id: "all", label: "Anything", sub: "Events, stops, reminders, due tasks" },
      { id: "events", label: "Events", sub: "Only events and plan stops" },
    ],
  },
  week: {
    label: "This week",
    blurb: "Your next seven days at a glance",
    sizes: ["medium", "large"],
    views: [{ id: "agenda", label: "Agenda", sub: "Days, then what’s on" }],
  },
  messages: {
    label: "Messages",
    blurb: "How busy your chats were this week",
    sizes: ["small", "medium", "large"],
    views: [
      { id: "week", label: "This week", sub: "Messages a day" },
      { id: "chats", label: "Busiest chats", sub: "Where the talking happened" },
    ],
  },
};

/** The add sheet's groups, like the chat's own + sheet. */
export const WIDGET_GROUPS: { title: string; kinds: WidgetKind[] }[] = [
  { title: "Money", kinds: ["spend", "balances"] },
  { title: "Work", kinds: ["boards", "tasks", "checklists"] },
  { title: "Together", kinds: ["needs", "polls", "plans"] },
  { title: "Time", kinds: ["next", "week", "messages"] },
];

const rid = () => Math.random().toString(36).slice(2, 9);
export const newWidget = (kind: WidgetKind, size?: WidgetSize, view?: string): Widget => ({
  id: `w-${rid()}`,
  kind,
  size: size ?? WIDGETS[kind].sizes[Math.min(1, WIDGETS[kind].sizes.length - 1)],
  view: view ?? WIDGETS[kind].views[0].id,
});

/** The suggested set: the old dashboard, as widgets, plus the board one. */
export const STARTER_WIDGETS: Widget[] = [
  { id: "w-spend", kind: "spend", size: "large", view: "month" },
  { id: "w-owe", kind: "balances", size: "small", view: "owe" },
  { id: "w-owed", kind: "balances", size: "small", view: "owed" },
  { id: "w-needs", kind: "needs", size: "medium", view: "summary" },
  { id: "w-boards", kind: "boards", size: "large", view: "priority" },
  { id: "w-next", kind: "next", size: "small", view: "all" },
  { id: "w-polls", kind: "polls", size: "small", view: "waiting" },
  { id: "w-tasks", kind: "tasks", size: "medium", view: "stage" },
  { id: "w-lists", kind: "checklists", size: "medium", view: "open" },
  { id: "w-week", kind: "week", size: "large", view: "agenda" },
  { id: "w-msgs", kind: "messages", size: "medium", view: "week" },
];

/** A stored widget that still makes sense (a kind, size and view that exist). */
function valid(w: unknown): w is Widget {
  if (!w || typeof w !== "object") return false;
  const x = w as Widget;
  const spec = WIDGETS[x.kind];
  return !!spec && typeof x.id === "string" && spec.sizes.includes(x.size) && spec.views.some((v) => v.id === x.view);
}

const key = (me: string) => `nod.widgets.${me}`;
const EVENT = "nod:widgets";

export function readWidgets(me: string): Widget[] {
  try {
    const raw = localStorage.getItem(key(me));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(valid);
    }
  } catch { /* storage blocked */ }
  return [];
}

function writeWidgets(me: string, list: Widget[]) {
  try { localStorage.setItem(key(me), JSON.stringify(list)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}

/* ---------------------------------------------------------------------------
   Where each widget sits: two columns, row by row, in order. A small one
   takes a cell; medium takes a row; large takes two rows. A small one alone
   on its row leaves the other half free (nothing is pulled back to fill it),
   so the order you set is the order you see.
--------------------------------------------------------------------------- */

const SPAN: Record<WidgetSize, [number, number]> = { small: [1, 1], medium: [2, 1], large: [2, 2] };
/** In cells: column (0 or 1), row, width and height. */
export interface Box { x: number; y: number; w: number; h: number }

export function layoutOf(list: Widget[]) {
  const boxes = new Map<string, Box>();
  let row = 0;
  let col = 0;
  for (const w of list) {
    const [cw, ch] = SPAN[w.size];
    if (cw === 2 && col === 1) { row++; col = 0; }
    boxes.set(w.id, { x: col, y: row, w: cw, h: ch });
    if (cw === 2) row += ch;
    else if (++col === 2) { row++; col = 0; }
  }
  return { boxes, rows: col ? row + 1 : row };
}

/** The list with one widget moved to position `at`. */
export function placeAt(list: Widget[], id: string, at: number): Widget[] {
  const w = list.find((x) => x.id === id);
  if (!w) return list;
  const rest = list.filter((x) => x.id !== id);
  rest.splice(Math.max(0, Math.min(at, rest.length)), 0, w);
  return rest;
}

/** Moves one widget to where another one is (before it when coming from below, after it when from above). */
export function moveTo(list: Widget[], id: string, overId: string): Widget[] {
  const from = list.findIndex((w) => w.id === id);
  const to = list.findIndex((w) => w.id === overId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [w] = next.splice(from, 1);
  next.splice(to, 0, w);
  return next;
}

const NONE: Widget[] = [];

/** Your widgets, saved as they change and kept in step across tabs. */
export function useWidgets(me: string) {
  // Unknown until read: nothing (not the empty page) is drawn before that.
  const [list, setList] = useState<Widget[] | null>(null);
  useEffect(() => {
    const read = () => setList(readWidgets(me));
    read();
    window.addEventListener(EVENT, read);
    const onStorage = (e: StorageEvent) => { if (e.key === key(me)) read(); };
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener("storage", onStorage); };
  }, [me]);

  const save = useCallback((fn: (l: Widget[]) => Widget[]) => writeWidgets(me, fn(readWidgets(me))), [me]);
  return {
    list: list ?? NONE,
    ready: list !== null,
    add: useCallback((w: Widget, at?: number) => save((l) => { const n = [...l]; n.splice(at ?? 0, 0, w); return n; }), [save]),
    update: useCallback((id: string, patch: Partial<Widget>) => save((l) => l.map((w) => (w.id === id ? { ...w, ...patch } : w))), [save]),
    remove: useCallback((id: string) => save((l) => l.filter((w) => w.id !== id)), [save]),
    move: useCallback((id: string, overId: string) => save((l) => moveTo(l, id, overId)), [save]),
    place: useCallback((id: string, at: number) => save((l) => placeAt(l, id, at)), [save]),
    step: useCallback((id: string, by: -1 | 1) => save((l) => {
      const i = l.findIndex((w) => w.id === id);
      const j = i + by;
      return i < 0 || j < 0 || j >= l.length ? l : moveTo(l, id, l[j].id);
    }), [save]),
    starter: useCallback(() => save(() => STARTER_WIDGETS), [save]),
  };
}
