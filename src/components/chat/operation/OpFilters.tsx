"use client";

import { useState, type ReactNode } from "react";
import {
  openRequestsIn, staffing, zoneStatus,
  type FeedEvent, type OpLive,
} from "@/lib/chat/operation";
import type { OperationZone } from "@/lib/chat/types";
import { IconCheck, IconClose, IconFilter } from "../Icons";
import { AnchorMenu } from "../MindFilter";
import styles from "../chat.module.css";
import p from "./pages.module.css";

/**
 * Finding your way on a busy Operation page, the way Mind does it: a filter
 * button that pulls down a menu (it stays open while you pick), and the
 * picks as chips under it, each one a tap to take off. Zones sort and narrow;
 * the log narrows by when and by what happened.
 */

/* ---- zones ---- */

export type ZoneSort = "setup" | "urgency" | "most" | "least";
export type ZoneOnly = "issue" | "short" | "waiting";
export interface ZoneFilter { sort: ZoneSort; only: ZoneOnly[] }
export const ALL_ZONES: ZoneFilter = { sort: "setup", only: [] };
export const isNarrowingZones = (f: ZoneFilter) => f.sort !== "setup" || f.only.length > 0;

const ZONE_SORT: { id: ZoneSort; label: string }[] = [
  { id: "setup", label: "As set up" },
  { id: "urgency", label: "Most urgent" },
  { id: "least", label: "Least populated" },
  { id: "most", label: "Most populated" },
];
const ZONE_ONLY: { id: ZoneOnly; label: string }[] = [
  { id: "issue", label: "Issues" },
  { id: "short", label: "Short of people" },
  { id: "waiting", label: "Requests waiting" },
];

/**
 * How much a zone needs someone now: an issue first, then urgent requests,
 * then any request waiting, then how short of people it is. "Under pressure"
 * alone is a lead's heads-up, not a need, so it doesn't count; a zone with
 * nothing pressing scores 0 and keeps its place in the setup order.
 */
function urgency(live: OpLive, z: OperationZone) {
  const waiting = openRequestsIn(live, z.id).filter((r) => r.status === "pending");
  const st = staffing(live, z);
  return (zoneStatus(live, z.id) === "issue" ? 1000 : 0)
    + waiting.filter((r) => r.urgency === "urgent").length * 100
    + waiting.length * 30
    + Math.max(0, st.target - st.n) / st.target * 50;
}

/** The zones to show, in the order picked: any of the picked kinds, then sorted (ties keep the setup order). */
export function zonesFor(live: OpLive, zones: OperationZone[], f: ZoneFilter) {
  const is = (z: OperationZone, k: ZoneOnly) => {
    if (k === "issue") return zoneStatus(live, z.id) === "issue";
    if (k === "short") { const st = staffing(live, z); return st.n < st.target; }
    return openRequestsIn(live, z.id).some((r) => r.status === "pending");
  };
  const list = f.only.length ? zones.filter((z) => f.only.some((k) => is(z, k))) : [...zones];
  const n = (z: OperationZone) => staffing(live, z).n;
  if (f.sort === "urgency") list.sort((a, b) => urgency(live, b) - urgency(live, a));
  if (f.sort === "most") list.sort((a, b) => n(b) - n(a));
  if (f.sort === "least") list.sort((a, b) => n(a) - n(b));
  return list;
}

/* ---- the log ---- */

export type LogWhen = "any" | "15m" | "hour" | "today" | "yesterday";
export type LogKind = "people" | "requests" | "broadcasts" | "tasks" | "zones" | "day";
export interface LogFilter { when: LogWhen; kinds: LogKind[] }
export const WHOLE_LOG: LogFilter = { when: "any", kinds: [] };
export const isNarrowingLog = (f: LogFilter) => f.when !== "any" || f.kinds.length > 0;

const MINUTE = 60_000;
const LOG_WHEN: { id: LogWhen; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "15m", label: "Past 15 minutes" },
  { id: "hour", label: "Past hour" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
];
const LOG_KINDS: { id: LogKind; label: string }[] = [
  { id: "people", label: "Check-ins and moves" },
  { id: "requests", label: "Requests" },
  { id: "broadcasts", label: "Broadcasts" },
  { id: "tasks", label: "Tasks" },
  { id: "zones", label: "Zone status" },
  { id: "day", label: "The day" },
];
const kindOf = (e: FeedEvent): LogKind =>
  e.kind === "checkin" || e.kind === "checkout" || e.kind === "move" ? "people"
    : e.kind === "request" || e.kind === "decision" ? "requests"
      : e.kind === "broadcast" || e.kind === "remind" ? "broadcasts"
        : e.kind === "task" ? "tasks" : e.kind === "day" ? "day" : "zones";

function midnight(now: number, daysBack = 0) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime();
}

export function passesLog(f: LogFilter, e: FeedEvent, now: number) {
  if (f.kinds.length && !f.kinds.includes(kindOf(e))) return false;
  switch (f.when) {
    case "15m": return e.at >= now - 15 * MINUTE;
    case "hour": return e.at >= now - 60 * MINUTE;
    case "today": return e.at >= midnight(now);
    case "yesterday": return e.at >= midnight(now, 1) && e.at < midnight(now);
    default: return true;
  }
}

/** Newest-first events cut into stretches of time, so the log reads in chapters instead of one long scroll. */
export function logSections(events: FeedEvent[], now: number) {
  const today = midnight(now);
  const yesterday = midnight(now, 1);
  const sections: { key: string; label: string; items: FeedEvent[] }[] = [
    { key: "15m", label: "Past 15 minutes", items: [] },
    { key: "hour", label: "Past hour", items: [] },
    { key: "today", label: "Earlier today", items: [] },
    { key: "yesterday", label: "Yesterday", items: [] },
    { key: "older", label: "Earlier", items: [] },
  ];
  for (const e of events) {
    const i = e.at >= now - 15 * MINUTE ? 0 : e.at >= now - 60 * MINUTE ? 1 : e.at >= today ? 2 : e.at >= yesterday ? 3 : 4;
    sections[i].items.push(e);
  }
  return sections.filter((s) => s.items.length);
}

/* ---- the button, the menus, the chips ---- */

export function FilterButton({ on, label, onOpen }: { on: boolean; label: string; onOpen: (anchor: HTMLElement) => void }) {
  return (
    <button className={`${p.filterBtn} ${on ? p.filterOn : ""}`} onClick={(e) => onOpen(e.currentTarget)} aria-label={on ? `${label}, on` : label} aria-haspopup="menu">
      <IconFilter size={18} />
      {on && <i className={p.filterDot} aria-hidden="true" />}
    </button>
  );
}

function Option({ label, on, radio, run }: { label: ReactNode; on: boolean; radio?: boolean; run: () => void }) {
  return (
    <button role={radio ? "menuitemradio" : "menuitemcheckbox"} aria-checked={on} className={`${styles.menuItem} ${styles.mindMenuOpt}`} onClick={run}>
      <span>{label}</span>
      {on ? <IconCheck size={16} /> : null}
    </button>
  );
}

const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function ZoneFilterMenu({ anchor, filter, onChange, onClose }: { anchor: HTMLElement; filter: ZoneFilter; onChange: (f: ZoneFilter) => void; onClose: () => void }) {
  // Opened as a sheet with the filter as it was; it keeps its own copy in step from here (as Mind’s does).
  const [f, setF] = useState(filter);
  const set = (next: ZoneFilter) => { setF(next); onChange(next); };
  return (
    <AnchorMenu anchor={anchor} label="Sort and filter zones" onClose={onClose}>
      {() => (
        <>
          <p className={styles.mindMenuHead}>Sort by</p>
          {ZONE_SORT.map((s) => <Option key={s.id} radio label={s.label} on={f.sort === s.id} run={() => set({ ...f, sort: s.id })} />)}
          <div className={styles.menuSep} />
          <p className={styles.mindMenuHead}>Only show</p>
          {ZONE_ONLY.map((k) => <Option key={k.id} label={k.label} on={f.only.includes(k.id)} run={() => set({ ...f, only: flip(f.only, k.id) })} />)}
          {isNarrowingZones(f) && (
            <>
              <div className={styles.menuSep} />
              <button className={`${styles.menuItem} ${styles.mindMenuClear}`} onClick={() => set(ALL_ZONES)}>Clear</button>
            </>
          )}
        </>
      )}
    </AnchorMenu>
  );
}

export function LogFilterMenu({ anchor, filter, onChange, onClose }: { anchor: HTMLElement; filter: LogFilter; onChange: (f: LogFilter) => void; onClose: () => void }) {
  // Opened as a sheet with the filter as it was; it keeps its own copy in step from here (as Mind’s does).
  const [f, setF] = useState(filter);
  const set = (next: LogFilter) => { setF(next); onChange(next); };
  return (
    <AnchorMenu anchor={anchor} label="Filter the log" onClose={onClose}>
      {() => (
        <>
          <p className={styles.mindMenuHead}>When</p>
          {LOG_WHEN.map((w) => <Option key={w.id} radio label={w.label} on={f.when === w.id} run={() => set({ ...f, when: w.id })} />)}
          <div className={styles.menuSep} />
          <p className={styles.mindMenuHead}>What</p>
          {LOG_KINDS.map((k) => <Option key={k.id} label={k.label} on={f.kinds.includes(k.id)} run={() => set({ ...f, kinds: flip(f.kinds, k.id) })} />)}
          {isNarrowingLog(f) && (
            <>
              <div className={styles.menuSep} />
              <button className={`${styles.menuItem} ${styles.mindMenuClear}`} onClick={() => set(WHOLE_LOG)}>Clear filters</button>
            </>
          )}
        </>
      )}
    </AnchorMenu>
  );
}

function Chips({ chips, onClear }: { chips: { key: string; label: string; off: () => void }[]; onClear: () => void }) {
  if (!chips.length) return null;
  return (
    <div className={styles.mindFilterBar}>
      {chips.map((c) => (
        <button key={c.key} className={styles.mindFilterChip} onClick={c.off} aria-label={`Stop: ${c.label}`}>
          {c.label}<IconClose size={12} />
        </button>
      ))}
      <button className={styles.mindFilterClear} onClick={onClear}>Clear</button>
    </div>
  );
}

export function ZoneChips({ filter, onChange }: { filter: ZoneFilter; onChange: (f: ZoneFilter) => void }) {
  return (
    <Chips
      onClear={() => onChange(ALL_ZONES)}
      chips={[
        ...(filter.sort !== "setup" ? [{ key: "sort", label: ZONE_SORT.find((s) => s.id === filter.sort)!.label, off: () => onChange({ ...filter, sort: "setup" as const }) }] : []),
        ...filter.only.map((k) => ({ key: k, label: ZONE_ONLY.find((x) => x.id === k)!.label, off: () => onChange({ ...filter, only: filter.only.filter((x) => x !== k) }) })),
      ]}
    />
  );
}

export function LogChips({ filter, onChange }: { filter: LogFilter; onChange: (f: LogFilter) => void }) {
  return (
    <Chips
      onClear={() => onChange(WHOLE_LOG)}
      chips={[
        ...(filter.when !== "any" ? [{ key: "when", label: LOG_WHEN.find((w) => w.id === filter.when)!.label, off: () => onChange({ ...filter, when: "any" as const }) }] : []),
        ...filter.kinds.map((k) => ({ key: k, label: LOG_KINDS.find((x) => x.id === k)!.label, off: () => onChange({ ...filter, kinds: filter.kinds.filter((x) => x !== k) }) })),
      ]}
    />
  );
}
