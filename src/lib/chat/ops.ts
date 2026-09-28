import type { BillCard, Card, CardOp, PlanCard, PlanDay, PlanStop, ProjectCard, Task } from "./types";

/**
 * Applies one change to a shared card. Every tab runs this on every op, in
 * whatever order they arrive, so each op is idempotent and touches only what
 * it names: two people ticking different stops, or dragging different tasks,
 * never overwrite each other. Returns the same card when nothing changed.
 */
export function reduceCardOp(card: Card, op: CardOp): Card {
  if (card.type === "plan" && op.kind.startsWith("plan.")) return reducePlan(card, op);
  if (card.type === "bill" && op.kind.startsWith("bill.")) return reduceBill(card, op);
  if (card.type === "project" && (op.kind.startsWith("task.") || op.kind.startsWith("column."))) return reduceProject(card, op);
  return card;
}

/* ---------------------------------------------------------------------------
   Plans
--------------------------------------------------------------------------- */

/** Timed stops first, in time order; untimed ones keep their place at the end. */
export function sortStops(stops: PlanStop[]) {
  const timed = stops.filter((s) => s.at !== null).sort((a, b) => a.at! - b.at!);
  return [...timed, ...stops.filter((s) => s.at === null)];
}

function mapStops(card: PlanCard, fn: (s: PlanStop, day: PlanDay) => PlanStop | null): PlanCard {
  let changed = false;
  const days = card.days.map((day) => {
    let dayChanged = false;
    const stops: PlanStop[] = [];
    for (const s of day.stops) {
      const next = fn(s, day);
      if (next !== s) dayChanged = true;
      if (next) stops.push(next);
    }
    if (!dayChanged) return day;
    changed = true;
    return { ...day, stops: sortStops(stops) };
  });
  return changed ? { ...card, days } : card;
}

function reducePlan(card: PlanCard, op: CardOp): PlanCard {
  switch (op.kind) {
    case "plan.tick":
      return mapStops(card, (s) => (s.id === op.stopId && s.doneBy !== op.by ? { ...s, doneBy: op.by } : s));
    case "plan.addStop": {
      if (card.days.some((d) => d.stops.some((s) => s.id === op.stop.id))) return card;
      const days = card.days.map((d) => (d.id === op.dayId ? { ...d, stops: sortStops([...d.stops, op.stop]) } : d));
      return { ...card, days };
    }
    case "plan.editStop":
      return mapStops(card, (s) => (s.id === op.stopId ? { ...s, ...op.patch } : s));
    case "plan.removeStop":
      return mapStops(card, (s) => (s.id === op.stopId ? null : s));
    case "plan.addDay":
      if (card.days.some((d) => d.id === op.day.id)) return card;
      return { ...card, days: [...card.days, op.day].sort((a, b) => a.date - b.date) };
    case "plan.rsvp": {
      if ((card.rsvps[op.userId] ?? null) === op.value) return card;
      const rsvps = { ...card.rsvps };
      if (op.value) rsvps[op.userId] = op.value;
      else delete rsvps[op.userId];
      return { ...card, rsvps };
    }
    default:
      return card;
  }
}

/* ---------------------------------------------------------------------------
   Bills
--------------------------------------------------------------------------- */

function reduceBill(card: BillCard, op: CardOp): BillCard {
  switch (op.kind) {
    case "bill.claim": {
      const had = card.claims[op.itemId] ?? [];
      if (had.includes(op.userId) === op.on) return card;
      const next = op.on ? [...had, op.userId] : had.filter((id) => id !== op.userId);
      return { ...card, claims: { ...card.claims, [op.itemId]: next } };
    }
    case "bill.claimAll":
      return { ...card, claims: Object.fromEntries(card.items.map((it) => [it.id, [...op.userIds]])) };
    case "bill.pay":
      return card.paid.includes(op.userId) ? card : { ...card, paid: [...card.paid, op.userId] };
    default:
      return card;
  }
}

/**
 * What each person owes, in cents. Items split evenly between whoever had
 * them; tax and tip follow each person's share of the items. Rounding is
 * spread by largest remainder, so the shares always add up to the total.
 */
export function billShares(card: BillCard): Record<string, number> {
  const exact: Record<string, number> = {};
  let claimedItems = 0;
  for (const item of card.items) {
    const who = card.claims[item.id] ?? [];
    if (!who.length) continue;
    claimedItems += item.total;
    for (const id of who) exact[id] = (exact[id] ?? 0) + item.total / who.length;
  }
  if (!claimedItems) return {};
  // Tax and tip only for what has been claimed, so partial splits stay fair.
  const extras = (card.tax + card.tip) * (claimedItems / Math.max(1, card.items.reduce((n, i) => n + i.total, 0)));
  const target = Math.round(claimedItems + extras);
  const people = Object.keys(exact);
  const raw = people.map((id) => ({ id, v: exact[id] + (extras * exact[id]) / claimedItems }));
  const floors = raw.map((r) => ({ ...r, f: Math.floor(r.v) }));
  let left = target - floors.reduce((n, r) => n + r.f, 0);
  floors.sort((a, b) => (b.v - b.f) - (a.v - a.f));
  const out: Record<string, number> = {};
  for (const r of floors) {
    out[r.id] = r.f + (left > 0 ? 1 : 0);
    if (left > 0) left -= 1;
  }
  return out;
}

export const unclaimedItems = (card: BillCard) => card.items.filter((it) => !(card.claims[it.id]?.length));

/** Formats cents in the bill's currency. */
export function money(cents: number, currency = "EUR") {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

/* ---------------------------------------------------------------------------
   Projects
--------------------------------------------------------------------------- */

const TASK_FIELDS = ["title", "column", "order", "assignee", "due"] as const;

function reduceProject(card: ProjectCard, op: CardOp): ProjectCard {
  switch (op.kind) {
    case "task.add":
      if (card.tasks[op.task.id]) return card;
      return { ...card, tasks: { ...card.tasks, [op.task.id]: op.task } };
    case "task.update": {
      const task = card.tasks[op.id];
      if (!task || task.deleted) return card;
      let next: Task = task;
      for (const field of TASK_FIELDS) {
        if (!(field in op.patch)) continue;
        // Newest edit wins per field; an older one arriving late is ignored.
        if ((task.updatedAt[field] ?? task.createdAt) > op.at) continue;
        next = { ...next, [field]: op.patch[field], updatedAt: { ...next.updatedAt, [field]: op.at } };
      }
      return next === task ? card : { ...card, tasks: { ...card.tasks, [op.id]: next } };
    }
    case "task.remove": {
      const task = card.tasks[op.id];
      // A tombstone, so a late move from another tab can't bring it back.
      if (!task || task.deleted) return card;
      return { ...card, tasks: { ...card.tasks, [op.id]: { ...task, deleted: true } } };
    }
    case "column.rename":
      if (!card.columns.some((c) => c.id === op.id && c.name !== op.name)) return card;
      return { ...card, columns: card.columns.map((c) => (c.id === op.id ? { ...c, name: op.name } : c)) };
    case "column.add": {
      if (card.columns.some((c) => c.id === op.column.id)) return card;
      // New groups go before the last column: that one is "done", and should stay so.
      const at = card.columns.length > 1 ? card.columns.length - 1 : card.columns.length;
      return { ...card, columns: [...card.columns.slice(0, at), op.column, ...card.columns.slice(at)] };
    }
    case "column.remove": {
      // A board always keeps one column; its tasks go with it (as tombstones, like task.remove).
      if (card.columns.length <= 1 || !card.columns.some((c) => c.id === op.id)) return card;
      const tasks: Record<string, Task> = {};
      for (const [id, t] of Object.entries(card.tasks)) tasks[id] = t.column === op.id && !t.deleted ? { ...t, deleted: true } : t;
      return { ...card, columns: card.columns.filter((c) => c.id !== op.id), tasks };
    }
    default:
      return card;
  }
}

/** Live tasks in a column, in board order. */
export function tasksIn(card: ProjectCard, columnId: string) {
  return Object.values(card.tasks).filter((t) => !t.deleted && t.column === columnId).sort((a, b) => a.order - b.order);
}

/** The last column counts as done. */
export const doneColumn = (card: ProjectCard) => card.columns[card.columns.length - 1]?.id;
