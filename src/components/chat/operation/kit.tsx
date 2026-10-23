"use client";

import { useRef } from "react";
import Avatar from "@/components/chat/Avatar";
import { IconBolt } from "@/components/chat/Icons";
import { initials } from "@/lib/chat/avatar";
import type { Staffing, ZoneStatus } from "@/lib/chat/operation";
import { userById } from "@/lib/chat/store";
import type { AvatarTone, OperationZone } from "@/lib/chat/types";
import k from "./kit.module.css";

/**
 * Small pieces every Operation screen shares. Calm by default: ink and
 * greys, with status colour only where it means something (short, issue,
 * critical). Numbers first, zone codes everywhere.
 */

export function Av({ id, size = 28, ring }: { id: string; size?: number; ring?: boolean }) {
  const u = userById(id);
  return (
    <span className={ring ? k.avRing : k.av} title={u.fullName}>
      <Avatar glyph={initials(u.fullName)} tone={u.tone} size={size} shape="circle" photo={u.photo} />
    </span>
  );
}

export function Stack({ ids, size = 22, max = 4 }: { ids: string[]; size?: number; max?: number }) {
  return (
    <span className={k.stack}>
      {ids.slice(0, max).map((u) => <Av key={u} id={u} size={size} ring />)}
      {ids.length > max && <span className={k.stackMore} style={{ height: size, minWidth: size }}>+{ids.length - max}</span>}
    </span>
  );
}

const LEVEL_MARK: Record<Staffing, string> = { ok: "var(--ok-mark)", over: "var(--chart-3)", short: "var(--warn-mark)", critical: "var(--bad-mark)" };
const LEVEL_INK: Record<Staffing, string> = { ok: "var(--ok)", over: "var(--ink-2)", short: "var(--warn)", critical: "var(--bad)" };

/** Staffing as a ring: on site over target. */
export function Ring({ n, target, level, size = 44 }: { n: number; target: number; level: Staffing; size?: number }) {
  const r = (size - 6) / 2;
  const len = 2 * Math.PI * r;
  const share = Math.min(1, n / Math.max(1, target));
  return (
    <span className={k.ring} style={{ width: size, height: size }} aria-label={`${n} of ${target} on site`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LEVEL_MARK[level]} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${len * share} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className={k.ringArc}
        />
      </svg>
      <b style={{ color: LEVEL_INK[level], fontSize: size < 40 ? 11 : 13 }}>{n}/{target}</b>
    </span>
  );
}

export const STATUS_LABEL: Record<ZoneStatus, string> = { ok: "OK", busy: "Under pressure", issue: "Issue", closed: "Closed" };
export function StatusChip({ status }: { status: ZoneStatus }) {
  return <span className={`${k.chip} ${k[`st_${status}`]}`}>{STATUS_LABEL[status]}</span>;
}

export function Urgent() {
  return <span className={`${k.chip} ${k.urgent}`}><IconBolt size={11} />Urgent</span>;
}

/** "A1": how zones are said on the radio. */
export function Code({ z, size = "sm" }: { z: Pick<OperationZone, "code">; size?: "sm" | "lg" }) {
  return <span className={size === "lg" ? k.codeLg : k.code}>{z.code}</span>;
}

const TONE_VAR: Record<AvatarTone, string> = {
  clay: "#C4573F", sage: "#5B8A6B", ochre: "#C99432", denim: "#3E67A6", plum: "#86507A", graphite: "#57534E",
};
/** A role's (crew's) colour dot. */
export function CrewDot({ tone }: { tone?: AvatarTone }) {
  return <i className={k.crewDot} style={{ background: tone ? TONE_VAR[tone] : "var(--ink-3)" }} aria-hidden="true" />;
}
export const toneColor = (tone?: AvatarTone) => (tone ? TONE_VAR[tone] : "var(--ink-3)");

export function PrioDot({ p }: { p?: "low" | "medium" | "high" }) {
  return <i className={k.prio} style={{ background: p ? `var(--prio-${p})` : "var(--prio-none)" }} aria-hidden="true" />;
}

/** Hold (or right-click) for a menu, tap to open. Moving the finger (a scroll) cancels the hold. */
export function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false;
      clear();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => { held.current = true; onHold(); }, 480);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); held.current = true; onHold(); },
    /** True when the press that just ended was a hold, so its click shouldn't also open. */
    wasHold: () => held.current,
  };
}
