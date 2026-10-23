"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { initials } from "@/lib/chat/avatar";
import { can, canSee } from "@/lib/chat/groups";
import { RequestSheet } from "./OpCards";
import {
  agoText, ago, audienceOf, canManageZones, clock, crewOf, currentDay, emptyLive, here, isCommand, onSite, openRequestsIn, readRate,
  staffing, suggestions, zoneById, zoneStatus,
  type FeedEvent, type OpBroadcast, type OpLive, type OpRequest, type RequestKind, type ZoneStatus,
} from "@/lib/chat/operation";
import { userById } from "@/lib/chat/store";
import type { AvatarTone, Chat, GroupInfo, OperationInfo, OperationZone, Priority, Task } from "@/lib/chat/types";
import { DonutChart, PartBars, StackedBar, TrendChart, type Part, type Point } from "../Charts";
import {
  IconAlert, IconArrowDown, IconArrowUp, IconBack, IconBell, IconCheck, IconChevron, IconClock, IconClose, IconEdit, IconFlag, IconLocation,
  IconMegaphone, IconQr, IconRoute, IconTask, IconUserGroup,
} from "../Icons";
import StatusBar from "../StatusBar";
import { reducedMotion, Segmented, Sheet, useChatUi, useDialog, useNow } from "../ui";
import styles from "../chat.module.css";
import { Av, Code, CrewDot, PrioDot, StatusChip, STATUS_LABEL, useHold } from "./kit";
import { logSections, passesLog, WHOLE_LOG, type LogFilter } from "./OpFilters";
import { ZoneSheet } from "./Setup";
import { useOperation, type OperationApi } from "./useOperation";
import p from "./pages.module.css";

/**
 * The parts the Operation page and the Zone page share: zone tiles and their
 * hold menu, check-in, who's here, tasks, the ops feed, the floor map and
 * the Day report, all on useOperation and the real group. Sheets take a
 * group id and read the Operation themselves, so they stay live while open.
 */

/* ---------------------------------------------------------------------------
   The Operation, never half there
--------------------------------------------------------------------------- */

/** A new Operation has no live state until something happens in it: it reads as empty. */
export const EMPTY_LIVE: OpLive = emptyLive();

export type Op = OperationApi & { group: Chat; info: GroupInfo; op: OperationInfo; live: OpLive };

/** useOperation for screens: null unless the group is an Operation; live state always there. */
export function useOp(groupId: string | null | undefined): Op | null {
  const o = useOperation(groupId);
  if (!o.group || !o.info || !o.op) return null;
  return { ...o, group: o.group, info: o.info, op: o.op, live: o.live ?? EMPTY_LIVE };
}

export const nameOf = (id: string, me: string) => (id === me ? "You" : userById(id).name);

/** "EWC" for "EWC 2026 · Riyadh"; initials when the first word isn't a short code. */
export function badgeText(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (/^[A-Za-z0-9]{2,4}$/.test(first)) return first.toUpperCase();
  return initials(name) || "OP";
}

export const openTasks = (o: Op, zoneId?: string) => o.tasks(zoneId).filter((t) => t.column !== o.doneColumn);

export function requestTitle(op: OperationInfo, r: OpRequest, me: string) {
  const code = zoneById(op, r.zoneId)?.code ?? "?";
  if (r.kind === "staff") return `${r.count ?? 1} ${r.count === 1 ? "person" : "people"} for ${code}`;
  if (r.kind === "move") return `Move ${(r.people ?? []).map((u) => nameOf(u, me)).join(", ")} to ${code}`;
  if (r.kind === "supplies") return `Supplies for ${code}`;
  return `Issue at ${code}`;
}

/** Normal broadcasts that reach this person and still want a "Got it". */
export function unreadBroadcasts(o: Op): OpBroadcast[] {
  return o.live.broadcasts.filter((b) =>
    b.level === "normal" && b.by !== o.me && !b.acks[o.me] && audienceOf(o.info, o.live, o.members, b.audience).includes(o.me));
}

export type Tone = "ok" | "warn" | "bad" | "off";
/** A zone's pin: ink like every other zone, red only for an issue, grey when closed. */
export function zoneTone(live: OpLive, z: OperationZone): Tone {
  const status = zoneStatus(live, z.id);
  if (status === "issue") return "bad";
  if (status === "closed") return "off";
  return "ok";
}

/** Supplies: Hugeicons' package, at the app's stroke. */
export function IconPackage({ size = 20 }: { size?: number }) {
  return <HugeiconsIcon icon={PackageIcon} size={size} strokeWidth={1.6} color="currentColor" aria-hidden="true" />;
}

/* ---------------------------------------------------------------------------
   A full-screen layer over the chat: status bar, a bar with a back button
   and a centred title, and a page that scrolls under it.
--------------------------------------------------------------------------- */

const LEAVE_MS = 220;
const EDGE = 24;

export function PageLayer({ label, back = "Back", title, end, onClose, children }: {
  /** What a screen reader calls the page. */
  label: string;
  back?: string;
  /** Shown in the bar's centre once the page scrolls. */
  title?: ReactNode;
  end?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    timer.current = setTimeout(onClose, reducedMotion() ? 0 : LEAVE_MS);
  };
  useDialog(rootRef, () => close());
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Swipe from the left edge to go back, like any pushed screen.
  const drag = useRef<{ x: number; dx: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el || e.button !== 0 || closing.current) return;
    if (e.clientX - el.getBoundingClientRect().left > EDGE) return;
    e.stopPropagation();
    drag.current = { x: e.clientX, dx: 0, t: performance.now() };
    el.setPointerCapture(e.pointerId);
    el.style.animation = "none";
    el.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = rootRef.current;
    if (!d || !el) return;
    d.dx = Math.max(0, e.clientX - d.x);
    el.style.transform = `translateX(${d.dx}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    const el = rootRef.current;
    drag.current = null;
    if (!d || !el) return;
    const width = el.offsetWidth || 400;
    const velocity = d.dx / Math.max(1, performance.now() - d.t);
    const out = d.dx > width * 0.35 || (velocity > 0.5 && d.dx > 24);
    const ms = reducedMotion() ? 0 : 280;
    el.style.transition = `transform ${ms}ms cubic-bezier(.22, 1, .36, 1)`;
    el.style.transform = out ? "translateX(100%)" : "";
    if (out) {
      closing.current = true;
      timer.current = setTimeout(onClose, ms);
    } else {
      timer.current = setTimeout(() => { el.style.transition = ""; }, ms);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`${p.layer} ${leaving ? p.leaving : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <StatusBar />
      <header className={`${p.bar} ${scrolled ? p.barScrolled : ""}`}>
        <span className={p.barStart}>
          <button className={`${p.back} ${styles.glass}`} onClick={close} aria-label={`Back to ${back}`}>
            <IconBack size={18} />{back}
          </button>
        </span>
        <span className={`${p.barTitle} ${scrolled ? p.barTitleOn : ""}`} aria-hidden={!scrolled}>{title}</span>
        <span className={p.barEnd}>{end}</span>
      </header>
      <div className={p.scroll} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 48)}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Zones: a row or a tile; hold for its menu
--------------------------------------------------------------------------- */

/**
 * A zone, as a card: its code and name, how many are there out of how many
 * it needs (the count in ink, the target greyed), a bar of how full it is,
 * and a line of what's going on. Every zone looks the same; only an issue
 * says so in colour, and that's enough to make someone open it.
 */
export function ZoneTile({ o, zone: z, variant = "row" }: { o: Op; zone: OperationZone; variant?: "row" | "tile" }) {
  const ui = useChatUi();
  const st = staffing(o.live, z);
  const status = zoneStatus(o.live, z.id);
  const tasks = openTasks(o, z.id).length;
  const reqs = openRequestsIn(o.live, z.id).filter((r) => r.status === "pending");
  const hold = useHold(() => ui.openSheet(<ZoneMenu groupId={o.group.id} zoneId={z.id} onClose={ui.closeSheet} />));
  const fill = Math.min(1, st.n / Math.max(1, st.target));
  const gap = st.target - st.n;
  const staffed = gap > 0 ? `${gap} short` : gap < 0 ? `${-gap} spare` : "Full";
  return (
    <button
      className={`${p.zone} ${variant === "tile" ? p.zoneCompact : ""}`}
      onClick={() => { if (!hold.wasHold()) ui.openZone?.(z.id); }}
      onPointerDown={hold.onPointerDown}
      onPointerMove={hold.onPointerMove}
      onPointerUp={hold.onPointerUp}
      onPointerLeave={hold.onPointerLeave}
      // The page took the touch to scroll: that's not a hold.
      onPointerCancel={hold.onPointerCancel}
      onContextMenu={hold.onContextMenu}
      aria-label={`${z.code} ${z.name}, ${st.n} of ${st.target} here${status !== "ok" ? `, ${STATUS_LABEL[status]}` : ""}${reqs.length ? `, ${reqs.length} waiting` : ""}. Hold for more`}
    >
      <span className={p.zoneTop}>
        <span className={p.zoneCode}>{z.code}</span>
        <span className={p.zoneTitle}>
          <b>{z.name}</b>
          {z.area && <small>{z.area}</small>}
        </span>
        <span className={p.count}><b>{st.n}</b><span>/{st.target}</span></span>
      </span>
      <span className={p.zoneBar} aria-hidden="true"><i style={{ width: `${fill * 100}%` }} /></span>
      <span className={p.zoneFoot}>
        <span>{staffed}</span>
        <span>{tasks} {tasks === 1 ? "task" : "tasks"}</span>
        {reqs.length > 0 && <span>{reqs.length} waiting</span>}
        {status === "issue" && <span className={p.zoneIssue}><IconAlert size={12} />Issue</span>}
        {(status === "busy" || status === "closed") && <span className={p.zoneState}>{STATUS_LABEL[status]}</span>}
      </span>
    </button>
  );
}

/** What holding a zone offers: open it, send people, set its status, its chat, edit it. */
export function ZoneMenu({ groupId, zoneId, onClose }: { groupId: string; zoneId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const ui = useChatUi();
  const z = o ? zoneById(o.op, zoneId) : undefined;
  if (!o || !z) return null;
  const admin = canManageZones(o.info, o.me);
  const lead = z.leadId === o.me;
  // Moving people between zones is Command's call; a lead can ask for them, and set their own zone's status.
  const assign = admin || can(o.info, o.me, "approveRequests");
  const channel = o.info.channels.find((c) => c.id === z.channelId);
  const items: { key: string; label: string; sub?: string; icon: ReactNode; run: () => void }[] = [
    { key: "open", label: "Open zone", icon: <IconChevron size={18} />, run: () => ui.openZone?.(z.id) },
  ];
  if (assign) {
    items.push({ key: "assign", label: "Assign people", sub: "They get a move request to accept", icon: <IconUserGroup size={18} />, run: () => ui.openSheet(<AssignSheet groupId={groupId} zoneId={z.id} onClose={ui.closeSheet} />) });
  } else if (lead) {
    items.push({ key: "ask", label: "Ask for people", sub: "A request Command decides", icon: <IconUserGroup size={18} />, run: () => ui.openSheet(<RequestSheet groupId={groupId} zoneId={z.id} kind="staff" onClose={ui.closeSheet} />) });
  }
  if (admin || lead) {
    items.push({ key: "status", label: "Set status", sub: STATUS_LABEL[zoneStatus(o.live, z.id)], icon: <IconFlag size={18} />, run: () => ui.openSheet(<StatusSheet groupId={groupId} zoneId={z.id} onClose={ui.closeSheet} />) });
  }
  if (channel && canSee(o.info, channel, o.me)) items.push({ key: "chat", label: "Open chat", sub: `#${channel.name}`, icon: <b>#</b>, run: () => ui.switchChannel?.(z.channelId) });
  if (admin) items.push({ key: "edit", label: "Edit zone", sub: "Name, code, area, target and lead", icon: <IconEdit size={18} />, run: () => ui.openSheet(<ZoneSheet groupId={groupId} zoneId={z.id} onClose={ui.closeSheet} onToast={ui.toast} />) });
  return (
    <Sheet title={`${z.code} · ${z.name}`} onClose={onClose}>
      {(close) => (
        <div className={p.menu}>
          {items.map((it) => (
            <button key={it.key} className={p.menuItem} onClick={() => close(it.run)}>
              <span className={p.menuIcon}>{it.icon}</span>
              <span className={p.menuText}>{it.label}{it.sub && <small>{it.sub}</small>}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

const STATUS_OPTIONS: { id: ZoneStatus; text: string }[] = [
  { id: "ok", text: "Running as planned" },
  { id: "busy", text: "Coping, but stretched: keep an eye on it" },
  { id: "issue", text: "Something is wrong here" },
  { id: "closed", text: "Not in use right now" },
];

export function StatusSheet({ groupId, zoneId, onClose }: { groupId: string; zoneId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const ui = useChatUi();
  const z = o ? zoneById(o.op, zoneId) : undefined;
  if (!o || !z) return null;
  const current = zoneStatus(o.live, z.id);
  const act = o.act;
  return (
    <Sheet title={`${z.code} status`} onClose={onClose}>
      {(close) => (
        <div className={p.menu}>
          {STATUS_OPTIONS.map((x) => (
            <button
              key={x.id}
              className={p.menuItem}
              aria-pressed={current === x.id}
              onClick={() => close(() => { if (x.id !== current) { act.setZoneStatus(z.id, x.id); ui.toast(`${z.code} set to ${STATUS_LABEL[x.id]}`); } })}
            >
              <StatusChip status={x.id} />
              <span className={p.menuText}>{x.text}</span>
              {current === x.id && <span className={p.menuEnd}><IconCheck size={16} /></span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Someone to pick: their crew, and why they're suggested. */
function PickRow({ o, userId, on, why, onClick }: { o: Op; userId: string; on: boolean; why: string; onClick: () => void }) {
  const u = userById(userId);
  const crew = crewOf(o.info, userId);
  return (
    <button className={`${p.pickRow} ${on ? p.pickOn : ""}`} onClick={onClick} aria-pressed={on}>
      <Av id={userId} size={34} />
      <span className={p.pickMain}>
        <b>{userId === o.me ? "You" : u.fullName}</b>
        <small><CrewDot tone={crew?.tone} />{[crew?.name ?? "Crew", why].filter(Boolean).join(" · ")}</small>
      </span>
      <span className={p.check}>{on && <IconCheck size={14} />}</span>
    </button>
  );
}

/** Send people here: suggestions first (spare people from overstaffed zones), then whoever isn't checked in. */
export function AssignSheet({ groupId, zoneId, onClose }: { groupId: string; zoneId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const ui = useChatUi();
  const [picked, setPicked] = useState<string[]>([]);
  const z = o ? zoneById(o.op, zoneId) : undefined;
  if (!o || !z) return null;
  const list = suggestions(o.info, o.live, o.members, zoneId).slice(0, 12);
  const notIn = o.members.filter((u) => !o.live.presence[u]?.zoneId && !isCommand(o.info, u));
  const toggle = (u: string) => setPicked((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]));
  const act = o.act;
  const st = staffing(o.live, z);
  return (
    <Sheet
      title={`Assign to ${z.code}`}
      onClose={onClose}
      action={{
        label: picked.length ? `Send ${picked.length}` : "Send",
        disabled: !picked.length,
        onClick: () => {
          picked.forEach((u) => act.assign(u, zoneId));
          ui.toast(`Move request sent to ${picked.length} · ${z.code}`);
        },
      }}
    >
      <div className={p.chooseHead}>
        <b>{z.code} · {z.name}</b>
        <span>{st.n}/{st.target} here{picked.length ? ` · ${picked.length} chosen` : ""}</span>
      </div>
      <p className={p.sheetHint}>Each person gets a move request and taps Accept. Their check-in follows.</p>
      {list.length > 0 && <>
        <p className={p.label}>Suggested</p>
        <div className={p.pickList}>
          {list.map((x) => <PickRow key={x.userId} o={o} userId={x.userId} on={picked.includes(x.userId)} why={x.why} onClick={() => toggle(x.userId)} />)}
        </div>
      </>}
      {notIn.length > 0 && <>
        <p className={p.label}>Not checked in</p>
        <div className={p.pickList}>
          {notIn.map((u) => <PickRow key={u} o={o} userId={u} on={picked.includes(u)} why="On shift · not checked in" onClick={() => toggle(u)} />)}
        </div>
      </>}
      {!list.length && !notIn.length && <p className={p.emptyBox}>Nobody to send right now: everyone else is Command, a lead or already here.</p>}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Check-in
--------------------------------------------------------------------------- */

/** The zone's QR code (simulated): pick the code on the sign. */
export function ScanSheet({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const ui = useChatUi();
  if (!o) return null;
  const mine = o.live.presence[o.me]?.zoneId;
  const act = o.act;
  return (
    <Sheet title="Scan zone code" onClose={onClose}>
      {(close) => (
        <>
          <div className={p.scanner}>
            <span className={p.scanFrame}><IconQr size={40} /></span>
            <small>Point at the QR code on the zone’s sign. Camera scanning comes later; pick the code you see.</small>
          </div>
          {o.op.zones.length ? (
            <div className={p.codesBig}>
              {o.op.zones.map((z) => (
                <button
                  key={z.id}
                  className={mine === z.id ? p.codeHere : undefined}
                  onClick={() => close(() => {
                    if (mine === z.id) return;
                    act.checkIn(z.id, "qr");
                    ui.toast(`Checked in to ${z.code} · ${z.name}`);
                  })}
                  aria-label={`${z.code} ${z.name}${mine === z.id ? ", you're here" : ""}`}
                >
                  <b>{z.code}</b><small>{z.name}</small>
                </button>
              ))}
            </div>
          ) : <p className={p.emptyBox}>This Operation has no zones yet.</p>}
        </>
      )}
    </Sheet>
  );
}

/** "You're in A1 · Main Arena", or not checked in with Scan. */
export function WhereCard({ o }: { o: Op }) {
  const ui = useChatUi();
  const pr = o.live.presence[o.me];
  const z = zoneById(o.op, pr?.zoneId);
  if (!z || !pr) {
    return (
      <div className={`${p.where} ${p.whereOff}`}>
        <span className={p.whereIcon}><IconLocation size={19} /></span>
        <span className={p.whereMain}>
          <b>Not checked in</b>
          <small>Check in where you are so Command can see you.</small>
        </span>
        <button className={p.btnSm} onClick={() => ui.openSheet(<ScanSheet groupId={o.group.id} onClose={ui.closeSheet} />)}>
          <IconQr size={15} />Scan
        </button>
      </div>
    );
  }
  const st = staffing(o.live, z);
  const tasks = openTasks(o, z.id).length;
  return (
    <button className={p.where} onClick={() => ui.openZone?.(z.id)}>
      <span className={p.whereIcon}><IconLocation size={19} /></span>
      <span className={p.whereMain}>
        <b>You’re in {z.code} · {z.name}</b>
        <small>Since {clock(pr.since)} · {st.n}/{st.target} here · {tasks} {tasks === 1 ? "task" : "tasks"}</small>
      </span>
      <span className={p.chev}><IconChevron size={16} /></span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Broadcasts: a normal one stays pinned until "Got it"
--------------------------------------------------------------------------- */

export function BroadcastBanner({ o, b, className }: { o: Op; b: OpBroadcast; className?: string }) {
  const now = useNow(30_000);
  const act = o.act;
  return (
    <div className={`${p.banner} ${className ?? ""}`} role="status">
      <span className={p.bannerIcon}><IconMegaphone size={17} /></span>
      <span className={p.bannerMain}>
        <small>{nameOf(b.by, o.me)} · Broadcast · {agoText(now - b.at)}</small>
        <b>{b.text}</b>
      </span>
      <button className={p.btnSm} onClick={() => act.ack(b.id)}>Got it</button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The floor: the drawn venue, or the zones by area
--------------------------------------------------------------------------- */

function Pin({ o, z, picked, onPick, style }: { o: Op; z: OperationZone; picked?: string | null; onPick: (zoneId: string) => void; style?: CSSProperties }) {
  const st = staffing(o.live, z);
  const size = 28 + Math.min(st.n, 9) * 4;
  return (
    <button
      className={`${p.pin} ${p[`pin_${zoneTone(o.live, z)}`]} ${picked === z.id ? p.pinOn : ""}`}
      style={{ ...style, width: size, height: size }}
      onClick={() => onPick(z.id)}
      aria-label={`${z.code} ${z.name}, ${st.n} of ${st.target}`}
      aria-pressed={picked === z.id}
    >
      <b>{z.code}</b>
      <span className={p.pinCount}>{st.n}/{st.target}</span>
    </button>
  );
}

export function FloorMap({ o, onPick, picked }: { o: Op; onPick: (zoneId: string) => void; picked?: string | null }) {
  if (o.op.map === "ewc") {
    return (
      <div className={p.map}>
        <svg viewBox="0 0 1000 640" className={p.mapSvg} aria-hidden="true">
          <rect x="20" y="20" width="960" height="600" rx="28" className={p.mapGround} />
          <rect x="50" y="50" width="300" height="370" rx="20" className={p.mapHall} />
          <rect x="380" y="50" width="300" height="370" rx="20" className={p.mapHall} />
          <rect x="710" y="50" width="240" height="540" rx="20" className={p.mapOut} />
          <rect x="50" y="450" width="630" height="140" rx="20" className={p.mapLevel} />
          <text x="72" y="86" className={p.mapLabel}>HALL A</text>
          <text x="402" y="86" className={p.mapLabel}>HALL B</text>
          <text x="732" y="86" className={p.mapLabel}>OUTDOOR</text>
          <text x="72" y="484" className={p.mapLabel}>LEVEL 2 · MEZZANINE</text>
          <rect x="880" y="560" width="70" height="14" rx="7" className={p.mapGate} />
          <text x="828" y="572" className={p.mapSmall}>GATE 3</text>
        </svg>
        {o.op.zones.map((z, i) => {
          // A zone added later without a place on the drawing goes along the middle.
          const at = z.pin ?? { x: 0.12 + (i % 4) * 0.25, y: 0.5 };
          return <Pin key={z.id} o={o} z={z} picked={picked} onPick={onPick} style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }} />;
        })}
      </div>
    );
  }
  // No drawing: a block per area, its zones as pins.
  const areas: { name: string; zones: OperationZone[] }[] = [];
  for (const z of o.op.zones) {
    const name = z.area || "Venue";
    const a = areas.find((x) => x.name === name);
    if (a) a.zones.push(z);
    else areas.push({ name, zones: [z] });
  }
  if (!areas.length) return <p className={p.emptyBox}>No zones yet. Add them in Settings › Zones.</p>;
  return (
    <div className={p.areas}>
      {areas.map((a) => (
        <div key={a.name} className={p.area}>
          <span className={p.areaName}>{a.name}</span>
          <div className={p.areaPins}>
            {a.zones.map((z) => <Pin key={z.id} o={o} z={z} picked={picked} onPick={onPick} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MapLegend() {
  return (
    <div className={p.legend}>
      <span><i style={{ background: "var(--ink)" }} />Zone</span>
      <span><i style={{ background: "var(--bad-mark)" }} />Issue</span>
      <span><i style={{ background: "var(--ink-3)" }} />Closed</span>
      <span>Size = people there</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   People: grouped by crew
--------------------------------------------------------------------------- */

export interface CrewGroup { key: string; name: string; tone?: AvatarTone; ids: string[] }

/** Command first, then each crew in the Operation's order, then anyone in none. */
export function crewGroups(o: Op, ids: string[]): CrewGroup[] {
  const command = o.info.roles.find((r) => r.id === o.op.commandRole);
  const out: CrewGroup[] = [{ key: "command", name: command?.name ?? "Command", tone: command?.tone, ids: [] }];
  for (const id of o.op.crews) {
    const role = o.info.roles.find((r) => r.id === id);
    if (role) out.push({ key: role.id, name: role.name, tone: role.tone, ids: [] });
  }
  const rest: CrewGroup = { key: "other", name: "Crew", ids: [] };
  for (const u of ids) {
    if (isCommand(o.info, u)) { out[0].ids.push(u); continue; }
    const crew = crewOf(o.info, u);
    (out.find((g) => g.key === crew?.id) ?? rest).ids.push(u);
  }
  return [...out, rest].filter((g) => g.ids.length);
}

/** Who's here, grouped by crew, leads marked. */
export function WhoHere({ o, zoneId }: { o: Op; zoneId: string }) {
  const ids = here(o.live, zoneId);
  if (!ids.length) return <p className={p.emptyBox}>Nobody checked in yet.</p>;
  const lead = zoneById(o.op, zoneId)?.leadId;
  return (
    <div className={p.who}>
      {crewGroups(o, ids).map((g) => (
        <div key={g.key}>
          <span className={p.whoCrew}><CrewDot tone={g.tone} />{g.name} · {g.ids.length}</span>
          <div className={p.whoPeople}>
            {g.ids.map((u) => (
              <span key={u} className={p.whoPerson} title={userById(u).fullName}>
                <Av id={u} size={38} />
                <small>{nameOf(u, o.me)}{u === lead && <em> · Lead</em>}</small>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Tasks: a row of the Ops board, with its step arrows
--------------------------------------------------------------------------- */

export function TaskRow({ o, task, showZone }: { o: Op; task: Task; showZone?: boolean }) {
  const now = useNow(30_000);
  const cols = o.boardMessage?.card.columns ?? [];
  const i = cols.findIndex((c) => c.id === task.column);
  const done = task.column === o.doneColumn;
  const step = done ? "done" : i <= 0 ? "todo" : "doing";
  const zone = showZone ? zoneById(o.op, task.zone) : undefined;
  const late = !done && task.due !== null && task.due < now;
  const due = done ? null : task.due === null ? null : late ? `${ago(now - task.due)} late` : task.due - now < 60_000 ? "due now" : `due in ${ago(task.due - now)}`;
  const nextIsDone = i === cols.length - 2;
  const act = o.act;
  return (
    <div className={`${p.task} ${done ? p.taskDone : ""}`}>
      <PrioDot p={task.priority} />
      <span className={p.taskMain}>
        <b>{task.title}</b>
        <small>
          {zone && <Code z={zone} />}
          <span>{task.assignee ? nameOf(task.assignee, o.me) : "Anyone"}</span>
          {due && <span className={late ? p.late : undefined}>· {due}</span>}
        </small>
      </span>
      <span className={`${p.stepChip} ${p[`step_${step}`]}`}>{cols[i]?.name ?? "To do"}</span>
      <span className={p.arrows}>
        <button className={p.arrow} disabled={i <= 0} onClick={() => act.stepTask(task, -1)} aria-label={`Move “${task.title}” back${cols[i - 1] ? ` to ${cols[i - 1].name}` : ""}`}>
          <IconArrowUp size={13} />
        </button>
        <button className={p.arrow} disabled={i < 0 || i >= cols.length - 1} onClick={() => act.stepTask(task, 1)} aria-label={`Move “${task.title}” on${cols[i + 1] ? ` to ${cols[i + 1].name}` : ""}`}>
          {nextIsDone ? <IconCheck size={13} /> : <IconArrowDown size={13} />}
        </button>
      </span>
    </div>
  );
}

/** Open first (soonest due first), done last. */
export const byStep = (o: Op) => (a: Task, b: Task) =>
  Number(a.column === o.doneColumn) - Number(b.column === o.doneColumn) || (a.due ?? Infinity) - (b.due ?? Infinity) || a.order - b.order;

const DUES = [{ id: "15", label: "15 min" }, { id: "30", label: "30 min" }, { id: "60", label: "1 hour" }, { id: "120", label: "2 hours" }];

/** A task on the Ops board for a zone: title, zone, priority, due. */
export function NewTaskSheet({ groupId, zoneId, onClose }: { groupId: string; zoneId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const ui = useChatUi();
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState(zoneId);
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState("30");
  if (!o) return null;
  const z = zoneById(o.op, zone);
  const ready = !!title.trim() && !!o.boardMessage && !!z;
  const act = o.act;
  const add = () => {
    if (!ready) return;
    act.addTask({ title: title.trim(), zoneId: zone, priority, dueMins: Number(due) });
    ui.toast(`Added to ${z.code} · ${o.boardMessage?.card.name ?? "Ops board"}`);
  };
  return (
    <Sheet title="New task" onClose={onClose} action={{ label: "Add", disabled: !ready, onClick: add }}>
      {(close) => (
        <>
          <input
            className={p.taskInput}
            data-autofocus
            placeholder="Check stage lights"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && ready) close(add); }}
            aria-label="Task"
          />
          {!o.boardMessage && <p className={p.sheetHint}>This Operation has no Ops board yet, so there’s nowhere to put tasks.</p>}
          <p className={p.label}>Zone</p>
          <div className={styles.chipGrid} role="radiogroup" aria-label="Zone">
            {o.op.zones.map((x) => (
              <button key={x.id} role="radio" aria-checked={zone === x.id} className={`${styles.choice} ${zone === x.id ? styles.choiceOn : ""}`} onClick={() => setZone(x.id)}>
                {x.code}
              </button>
            ))}
          </div>
          <p className={p.label}>Priority</p>
          <Segmented value={priority} onChange={setPriority} options={[{ id: "high", label: "High" }, { id: "medium", label: "Medium" }, { id: "low", label: "Low" }]} />
          <p className={p.label}>Due</p>
          <Segmented value={due} onChange={setDue} options={DUES} />
        </>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   The log: what happened, newest first, in stretches of time that fold
   away (the newest one open); zone codes open the zone
--------------------------------------------------------------------------- */

export function FeedList({ o, filter = WHOLE_LOG }: { o: Op; filter?: LogFilter }) {
  const now = useNow(30_000);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const items = [...o.live.feed].reverse().filter((e) => passesLog(filter, e, now));
  if (!o.live.feed.length) return <p className={p.emptyBox}>Nothing yet. Check-ins, requests, broadcasts and finished tasks show up here.</p>;
  if (!items.length) return <p className={p.emptyBox}>Nothing in the log matches these filters.</p>;
  return (
    <div className={p.log}>
      {logSections(items, now).map((sec, i) => {
        const on = open[sec.key] ?? i === 0;
        return (
          <section key={sec.key} className={p.logSection} aria-label={sec.label}>
            <button className={`${p.logHead} ${on ? p.logOpen : ""}`} onClick={() => setOpen((x) => ({ ...x, [sec.key]: !on }))} aria-expanded={on}>
              <IconChevron size={14} />
              {sec.label}
              <em>{sec.items.length}</em>
            </button>
            {on && <ol className={p.logItems}>{sec.items.map((e) => <FeedRow key={e.id} o={o} e={e} now={now} />)}</ol>}
          </section>
        );
      })}
    </div>
  );
}

function FeedRow({ o, e, now }: { o: Op; e: FeedEvent; now: number }) {
  const ui = useChatUi();
  const who = (id: string) => nameOf(id, o.me);
  const zl = (id?: string | null) => {
    const z = zoneById(o.op, id);
    return z ? <button className={p.codeLink} onClick={() => ui.openZone?.(z.id)} aria-label={`Open ${z.code} · ${z.name}`}>{z.code}</button> : <span>—</span>;
  };
  // Who did it leads the row (their picture); a small mark on it says what kind of thing happened.
  let actor: string | null = null;
  let icon: ReactNode = <IconChevron size={11} />;
  let bad = false;
  let body: ReactNode = null;
  const name = (id: string) => <b>{who(id)}</b>;
  switch (e.kind) {
    case "checkin": actor = e.userId; icon = <IconLocation size={11} />; body = <>{name(e.userId)} checked in to {zl(e.zoneId)}{e.via === "qr" ? " by QR" : e.via === "link" ? " from a crew link" : ""}</>; break;
    case "checkout": actor = e.userId; icon = <IconBack size={11} />; body = <>{name(e.userId)} left {zl(e.zoneId)}</>; break;
    case "move": actor = e.userId; icon = <IconRoute size={11} />; body = <>{name(e.userId)} moved {e.fromZoneId ? <>{zl(e.fromZoneId)}<span className={p.feedArrow}>→</span></> : "to "}{zl(e.zoneId)}</>; break;
    case "request": {
      const r = o.live.requests.find((x) => x.id === e.requestId);
      if (!r) break;
      actor = e.by;
      icon = r.kind === "issue" ? <IconAlert size={11} /> : r.kind === "supplies" ? <IconPackage size={11} /> : <IconUserGroup size={11} />;
      bad = r.kind === "issue";
      body = <>{name(e.by)} raised {requestTitle(o.op, r, o.me)}{r.urgency === "urgent" ? <span className={p.feedBad}> · urgent</span> : null}</>;
      break;
    }
    case "decision": {
      const r = o.live.requests.find((x) => x.id === e.requestId);
      if (!r) break;
      actor = e.by;
      icon = e.approved ? <IconCheck size={11} /> : <IconClose size={11} />;
      body = <>{name(e.by)} {e.approved ? "approved" : "declined"} {requestTitle(o.op, r, o.me)} <span className={p.feedMeta}>in {ago(e.at - r.at)}</span></>;
      break;
    }
    case "broadcast": {
      const b = o.live.broadcasts.find((x) => x.id === e.broadcastId);
      if (!b) break;
      const rr = readRate(o.info, o.live, o.members, b);
      actor = b.by;
      icon = <IconMegaphone size={11} />;
      bad = b.level === "critical";
      body = <>{name(b.by)} {b.level === "critical" ? <span className={p.feedBad}>sent a critical alert</span> : "broadcast"} “{b.text}” <span className={p.feedMeta}>{rr.read}/{rr.aud} read</span></>;
      break;
    }
    case "remind": actor = e.by; icon = <IconBell size={11} />; body = <>{name(e.by)} reminded {e.count} who hadn’t read</>; break;
    case "task": actor = e.by; icon = <IconTask size={11} />; body = <>{name(e.by)} finished {e.title}{e.zoneId ? <> in {zl(e.zoneId)}</> : null}</>; break;
    case "day": {
      actor = e.by;
      icon = <IconClock size={11} />;
      const what = e.step === "finish" ? (e.to > e.day ? `finished Day ${e.day}` : `finished Day ${e.day}, the last day`)
        : e.step === "pause" ? `paused Day ${e.day}` : e.step === "resume" ? `resumed Day ${e.day}`
          : e.to < e.day ? `went back to Day ${e.to}` : `reopened Day ${e.to}`;
      body = <>{name(e.by)} {what}</>;
      break;
    }
    case "zone": actor = e.by; icon = <IconFlag size={11} />; bad = e.status === "issue"; body = <>{name(e.by)} set {zl(e.zoneId)} to <span className={p[`fs_${e.status}`]}>{STATUS_LABEL[e.status]}</span></>; break;
  }
  if (!body) return null;
  return (
    <li className={p.feedRow}>
      <span className={p.feedWho} aria-hidden="true">
        {actor ? <Av id={actor} size={32} /> : <span className={p.feedIcon}>{icon}</span>}
        {actor && <span className={`${p.feedKind} ${bad ? p.feedKindBad : ""}`}>{icon}</span>}
      </span>
      <span className={p.feedBody}>{body}</span>
      {/* "25h 30m" reads badly: past a few hours, the time of day says it better. */}
      <time className={p.feedTime} title={clock(e.at)}>{now - e.at > 6 * 3_600_000 ? clock(e.at) : ago(now - e.at)}</time>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   The Day report: totals, people through the day, staffing, requests
--------------------------------------------------------------------------- */

const n0 = (n: number) => String(Math.round(n));
const mins = (n: number) => `${Math.round(n)} min`;
const hours = (hm: string) => { const [h, m] = hm.split(":").map(Number); return (h || 0) + (m || 0) / 60; };

const KIND_LABEL: Record<RequestKind, string> = { staff: "People", move: "Moves", supplies: "Supplies", issue: "Issues" };
const KIND_COLOR: Record<RequestKind, string> = { staff: "var(--chart-1)", move: "var(--chart-2)", supplies: "var(--chart-3)", issue: "var(--bad-mark)" };

export function DayReport({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const now = useNow(60_000);
  const [picked, setPicked] = useState<string | null>(null);
  if (!o) return null;
  const { op, live } = o;
  const day = currentDay(op, live, now).n;
  const shiftId = picked ?? live.shift;
  const shift = op.shifts.find((s) => s.id === shiftId) ?? op.shifts[0];
  const liveIndex = op.shifts.findIndex((s) => s.id === live.shift);
  const shownIndex = op.shifts.findIndex((s) => s.id === shift?.id);

  const decided = live.requests.filter((r) => r.decidedAt).map((r) => ((r.decidedAt ?? r.at) - r.at) / 60_000);
  const avg = decided.length ? decided.reduce((a, b) => a + b, 0) / decided.length : 0;
  const approved = live.requests.filter((r) => r.status === "approved" || r.status === "done").length;
  const tasksDone = o.tasks().filter((t) => t.column === o.doneColumn).length;
  const rates = live.broadcasts.map((b) => { const r = readRate(o.info, live, o.members, b); return r.aud ? r.read / r.aud : 1; });
  const reach = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const series: Point[] = live.headcount.length
    ? live.headcount.map((h, i, all) => ({ x: h.h, label: h.h === "Now" ? "Now" : `${h.h}:00`, value: i === all.length - 1 ? onSite(live) : h.value }))
    : [{ x: "Now", label: "Now", value: onSite(live) }];
  const staffParts: Part[] = op.zones.map((z) => {
    const st = staffing(live, z);
    return { key: z.id, label: z.code, value: st.n, color: st.level === "critical" ? "var(--bad-mark)" : st.level === "short" ? "var(--warn-mark)" : st.level === "over" ? "var(--chart-3)" : "var(--ok-mark)" };
  });
  const kinds: Part[] = (Object.keys(KIND_LABEL) as RequestKind[]).map((k) => ({ key: k, label: KIND_LABEL[k], value: live.requests.filter((r) => r.kind === k).length, color: KIND_COLOR[k] }));
  const slow = [...live.requests].map((r) => ({ r, m: ((r.decidedAt ?? now) - r.at) / 60_000 })).sort((a, b) => b.m - a.m).slice(0, 5);

  // Another shift of the day: closed (with its peak, from the headcount) or still to come.
  const other = shift && shift.id !== live.shift ? (() => {
    const from = hours(shift.from);
    const to = hours(shift.to);
    const peak = Math.max(0, ...live.headcount.filter((h) => h.h !== "Now" && Number(h.h) >= from && Number(h.h) < to).map((h) => h.value));
    return shownIndex < liveIndex
      ? `The ${shift.name.toLowerCase()} shift closed at ${shift.to}${peak ? ` · ${peak} on site at peak` : ""}. Requests, tasks and broadcasts are counted for the whole day under ${op.shifts[liveIndex]?.name ?? "the live shift"}.`
      : `The ${shift.name.toLowerCase()} shift starts at ${shift.from}.`;
  })() : null;

  return (
    <Sheet title="Day report" onClose={onClose}>
      {op.shifts.length > 1 && (
        <Segmented value={shift?.id ?? ""} onChange={setPicked} options={op.shifts.map((s) => ({ id: s.id, label: `Day ${day} · ${s.name}` }))} />
      )}
      {other ? <p className={p.emptyBox}>{other}</p> : <>
        <div className={p.totals}>
          <div><b>{onSite(live)}</b><small>on site</small></div>
          <div><b>{live.requests.length}</b><small>requests</small></div>
          <div><b>{approved}</b><small>approved</small></div>
          <div><b>{mins(avg)}</b><small>avg to decide</small></div>
          <div><b>{tasksDone}</b><small>tasks done</small></div>
          <div><b>{Math.round(reach * 100)}%</b><small>broadcast read</small></div>
        </div>
        <p className={p.label}>People on site through the day</p>
        <div className={p.reportChart}><TrendChart data={series} kind="area" format={n0} names={{ value: "On site" }} xTicks={series.map((x) => x.x)} /></div>
        {staffParts.length > 0 && <>
          <p className={p.label}>Staffing now, by zone</p>
          <div className={p.reportChart}><PartBars parts={staffParts} format={n0} /></div>
        </>}
        <p className={p.label}>Requests by kind</p>
        <StackedBar parts={kinds} format={n0} height={14} />
        <div className={p.legendRow}>{kinds.map((k) => <span key={k.key}><i style={{ background: k.color }} />{k.label} {k.value}</span>)}</div>
        {live.broadcasts.length > 0 && (() => {
          const last = live.broadcasts[live.broadcasts.length - 1];
          const r = readRate(o.info, live, o.members, last);
          return <>
            <p className={p.label}>Last broadcast · {r.read}/{r.aud} read</p>
            <div className={p.donutWrap}>
              <DonutChart
                parts={[{ key: "read", label: "Read", value: r.read, color: "var(--ok-mark)" }, { key: "unread", label: "Not yet", value: r.aud - r.read, color: "var(--fill-2)" }]}
                center={<span className={p.donutCenter}><b>{r.aud ? Math.round((r.read / r.aud) * 100) : 100}%</b><small>read</small></span>}
                format={n0}
              />
            </div>
            <p className={p.sheetHint}>“{last.text}”</p>
          </>;
        })()}
        {slow.length > 0 && <>
          <p className={p.label}>Slowest requests</p>
          <ol className={p.slow}>
            {slow.map(({ r, m }) => (
              <li key={r.id}>
                <span><b>{requestTitle(op, r, o.me)}</b><small>{zoneById(op, r.zoneId)?.name ?? ""} · {r.status === "pending" ? "still pending" : r.status}</small></span>
                <em className={m > 5 ? p.late : undefined}>{ago(m * 60_000)}</em>
              </li>
            ))}
          </ol>
        </>}
        <p className={p.sheetHint}>Export to PDF or CSV · Soon</p>
      </>}
    </Sheet>
  );
}
