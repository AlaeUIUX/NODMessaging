"use client";

import { useId, type ReactNode } from "react";
import { dayKey } from "@/lib/chat/mind";
import type { Chat, Message } from "@/lib/chat/types";
import { IconChevron } from "./Icons";
import s from "./activity.module.css";

/**
 * The dashboard's shared pieces: number formats, and the charts every widget
 * draws with (the spend line, the stage gauge, checklist dot tracks, the
 * needs-you blocks, message bars).
 */

export const euro = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
export const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const shortTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;
export const SHOWN = 2;

/** The mockup's own blue scale — kept as literal hex (not design-system tokens) since it's one approved, specific palette, same shades for Needs-you's blocks and the Tasks gauge. */
export const BLUE = { base: "#00359E", a2: "#4A6FD6", a3: "#9DB2EC", a4: "#D5DEF6" };

export const monthKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}`; };
export const prevMonthKey = (t: number) => { const d = new Date(t); d.setMonth(d.getMonth() - 1); return monthKey(d.getTime()); };
export const monthName = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "long" });
export const prevMonthName = (t: number) => { const d = new Date(t); d.setMonth(d.getMonth() - 1); return monthName(d.getTime()); };
export const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
export const weekday = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short" });
export const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const dayLabel = (t: number, now: number) => {
  const k = dayKey(t);
  if (k === dayKey(now)) return "Today";
  if (k === dayKey(now + DAY)) return "Tomorrow";
  return new Date(t).toLocaleDateString(undefined, { weekday: "short" });
};
export const until = (ms: number) => {
  if (ms <= 0) return "now";
  if (ms < 3_600_000) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DAY) return `in ${Math.round(ms / 3_600_000)}h`;
  const d = Math.round(ms / DAY);
  return `in ${d} ${d === 1 ? "day" : "days"}`;
};
/** Running total, day by day — a plain function (not a closure-mutating `.map`) so the React Compiler can see it's pure. */
export function cumulative(daily: number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const v of daily) { sum += v; out.push(sum); }
  return out;
}
/** A deterministic, always-positive few-euros-a-day shape (not random, so it doesn't jump between renders). */
export function dummyBaseline(dayIndex: number): number {
  return Math.max(100, Math.round(650 + 420 * Math.sin(dayIndex * 0.8) + 260 * Math.sin(dayIndex * 2.3 + 1)));
}
/** Same idea for the message-activity week: a believable handful of messages on every day. */
export function dummyMessages(dayIndex: number): number {
  return Math.max(1, Math.round(7 + 4 * Math.sin(dayIndex * 0.9) + 2 * Math.sin(dayIndex * 2.1 + 1)));
}
export type Upcoming = { key: string; at: number; title: string; sub: string; icon: ReactNode; timed: boolean; chat: Chat; message: Message };

/** One row, everywhere a list needs one: icon or avatar, title + a line of detail, a trailing figure/time or a chevron.
 * `bare` drops the boxed list's own left/right padding, so the row's text lines up with whatever sits above it
 * on the open page (Needs you's blocks bar) instead of a sheet's own inset list. */
export function Row({ icon, title, detail, detailColor, figure, time, action, bare, onOpen }: {
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
export function Trend({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return <span className={`${s.trend} ${up ? s.trendUp : s.trendDown}`}>{up ? "↗" : "↘"} {Math.abs(pct)}%</span>;
}

/** Big euros, small muted cents — the mockup's own number treatment, for the hero and the balance tiles. */
export function BigMoney({ cents }: { cents: number }) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const c = Math.round(abs % 100);
  return <>{neg ? "-" : ""}€{euros}<span className={s.cents}>.{c.toString().padStart(2, "0")}</span></>;
}

/** Catmull-Rom-style smoothing through a set of points — the same curve the mockup draws its spend line with. */
export function smoothPath(points: [number, number][]): string {
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
export function SpendChart({ cur, prev, height = 140 }: { cur: number[]; prev: number[]; height?: number }) {
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
export function Gauge({ segments, size = 160 }: { segments: { value: number; color: string }[]; size?: number }) {
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
export function dotFill(done: number, total: number) {
  if (total <= 0) return 0;
  if (done >= total) return 10;
  return Math.min(9, Math.max(done > 0 ? 1 : 0, Math.floor((done / total) * 10)));
}
export function ChecklistTrack({ done, total }: { done: number; total: number }) {
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
export function NeedsBlocks({ blocks }: { blocks: { label: string; value: number; color: string; ink?: boolean }[] }) {
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
export function MessagesChart({ bars, avg, valueLabel }: { bars: { key: string; label: string; value: number; highlight?: boolean }[]; avg: number; valueLabel: (n: number) => string }) {
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
