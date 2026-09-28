import type { PlanCard, PlanDay, PlanStop } from "./types";

/* ---------------------------------------------------------------------------
   Plans: pure helpers for reading lines, dates and "what's next".
--------------------------------------------------------------------------- */

const HOUR = 3_600_000;

/** Local midnight of the day containing `ms`. */
export function midnight(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Midnight `n` calendar days later; by date, so a DST change never shifts the day. */
export function addDays(ms: number, n: number) {
  const d = new Date(midnight(ms));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** A time of day on a given day: `minutes` after its midnight, by the wall clock. */
export function atMinutes(day: number, minutes: number) {
  const d = new Date(midnight(day));
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

/** Minutes after midnight, the other way round. */
export const minutesOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

/** "2026-10-03" in local time, for date inputs. */
export function isoDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fromIsoDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : null;
}

/** "13:30" ↔ minutes, for time inputs. */
export const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function fromHhmm(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "Sat 12 Oct": weekday, day, month, in the reader's language. */
export function dayLabel(ms: number) {
  const d = new Date(ms);
  const wd = d.toLocaleDateString(undefined, { weekday: "short" });
  const mo = d.toLocaleDateString(undefined, { month: "short" });
  return `${wd} ${d.getDate()} ${mo}`;
}

/** "Sat 12 Oct", or "Sat 12 – Sun 13 Oct" for a plan over several days. */
export function rangeLabel(days: PlanDay[]) {
  if (!days.length) return "";
  const first = days[0].date;
  const last = days[days.length - 1].date;
  if (first === last) return dayLabel(first);
  const a = new Date(first);
  const b = new Date(last);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const head = sameMonth ? `${a.toLocaleDateString(undefined, { weekday: "short" })} ${a.getDate()}` : dayLabel(first);
  return `${head} – ${dayLabel(last)}`;
}

const timeFormat = () => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** A stop's time split into the numerals and the am/pm part (empty on 24-hour clocks). */
export function timeParts(ms: number) {
  const parts = timeFormat().formatToParts(ms);
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const main = parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim();
  return { main, period };
}
export const timeLabel = (ms: number) => { const t = timeParts(ms); return t.period ? `${t.main} ${t.period}` : t.main; };

/** Whole euros stay whole: "€16", "€4.50". */
export function euros(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
  });
}

/* ---------------------------------------------------------------------------
   One stop per line: "13:00 Lunch @ Figlmüller €16"
--------------------------------------------------------------------------- */

export interface ParsedStop {
  /** Minutes after midnight, or null for "sometime that day". */
  minutes: number | null;
  title: string;
  place?: string;
  cost?: number;
}

// 13:00 · 9.30 · 9h30 · 9:30pm, then 9am · 9 pm. A bare "9" is not a time ("2 coffees").
const CLOCK = /^(\d{1,2})[:.h](\d{2})(?:\s*([ap])\.?m\.?)?(?=[\s\-–—·,]|$)/i;
const MERIDIEM = /^(\d{1,2})\s*([ap])\.?m\.?(?=[\s\-–—·,]|$)/i;
const COST = /€\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)/i;
const DAY_BREAK = /^(?:day\s*\d+\b.*|-{3,}.*)$/i;

function readTime(line: string): { minutes: number; rest: string } | null {
  const clock = CLOCK.exec(line);
  const m = clock ?? MERIDIEM.exec(line);
  if (!m) return null;
  let h = Number(m[1]);
  const min = clock ? Number(clock[2]) : 0;
  const period = (clock ? clock[3] : m[2])?.toLowerCase();
  if (min > 59) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    if (period === "p" && h < 12) h += 12;
    if (period === "a" && h === 12) h = 0;
  } else if (h > 23) return null;
  return { minutes: h * 60 + min, rest: line.slice(m[0].length) };
}

/** One line into a stop; null when there's nothing to call it. */
export function parseStopLine(raw: string): ParsedStop | null {
  let line = raw.trim().replace(/^[-*•]\s+/, "");
  if (!line) return null;
  const time = readTime(line);
  if (time) line = time.rest.replace(/^[\s\-–—·:,]+/, "");

  let cost: number | undefined;
  const c = COST.exec(line);
  if (c) {
    cost = Number((c[1] ?? c[2]).replace(",", "."));
    line = (line.slice(0, c.index) + line.slice(c.index + c[0].length)).replace(/\s{2,}/g, " ").trim();
  }

  let title = line;
  let place: string | undefined;
  const at = line.indexOf("@");
  if (at >= 0) {
    title = line.slice(0, at).trim();
    place = line.slice(at + 1).trim() || undefined;
  }
  title = title.replace(/[\s\-–—·,]+$/, "").trim();
  if (!title && place) { title = place; place = undefined; }
  if (!title) return null;
  return { minutes: time?.minutes ?? null, title, place, cost: cost || undefined };
}

/**
 * The builder's textarea: stops, one per line; "Day 2" or "---" starts the
 * next day. A break before any stop is ignored, so "Day 1" at the top is fine.
 */
export function parsePlanText(text: string): ParsedStop[][] {
  const days: ParsedStop[][] = [[]];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (DAY_BREAK.test(t)) {
      if (days[days.length - 1].length) days.push([]);
      continue;
    }
    const stop = parseStopLine(t);
    if (stop) days[days.length - 1].push(stop);
  }
  if (days.length > 1 && !days[days.length - 1].length) days.pop();
  return days;
}

/** A parsed line as a stop on a given day. */
export function toStop(p: ParsedStop, day: number, id: string): PlanStop {
  const stop: PlanStop = { id, at: p.minutes === null ? null : atMinutes(day, p.minutes), title: p.title, doneBy: null };
  if (p.place) stop.place = p.place;
  if (p.cost) stop.cost = p.cost;
  return stop;
}

/* ---------------------------------------------------------------------------
   Reading a plan
--------------------------------------------------------------------------- */

export const allStops = (card: PlanCard) => card.days.flatMap((d) => d.stops);

/** What one person spends if they come to everything. */
export const costPerPerson = (card: PlanCard) => allStops(card).reduce((n, s) => n + (s.cost ?? 0), 0);

export function canEditPlan(card: PlanCard, authorId: string, me: string) {
  return card.everyoneCanEdit || authorId === me || card.editors.includes(me);
}

/**
 * Where the plan is right now. "Now" is the latest stop that has started and
 * isn't ticked, while the one after it hasn't started yet (and at most a few
 * hours on, so last night's dinner isn't still "now"). "Next" is the first
 * unticked stop still to come.
 */
export function planStatus(card: PlanCard, now: number) {
  const timed = allStops(card).filter((s) => s.at !== null).sort((a, b) => a.at! - b.at!);
  const started = timed.filter((s) => s.at! <= now);
  const cur = started[started.length - 1];
  const nowStop = cur && !cur.doneBy && midnight(cur.at!) === midnight(now) && now - cur.at! < 3 * HOUR ? cur : null;
  const next = timed.find((s) => s.at! > now && !s.doneBy) ?? null;
  return { nowId: nowStop?.id ?? null, next };
}

/** The day to lead with: today's, else the first still to come, else the first. */
export function focusDayIndex(card: PlanCard, now: number) {
  const today = midnight(now);
  const i = card.days.findIndex((d) => d.date >= today);
  return i < 0 ? 0 : i;
}
