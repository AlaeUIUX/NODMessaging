"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import Avatar from "@/components/chat/Avatar";
import { Segmented, Sheet } from "@/components/chat/ui";
import {
  IconAlert, IconBolt, IconCamera, IconCheck, IconChevron, IconClose, IconCloud, IconLocation, IconMinus, IconPlus, IconQr, IconUserGroup,
} from "@/components/chat/Icons";
import {
  ago, agoText, canCommand, canDecide, CREWS, crewOf, firstName, glyph, here, KIND_LABEL, leadOf, openRequestsIn, openTasksIn, person, PRIORITY_LABEL,
  STATUS_LABEL, staffing, suggestions, zoneLabel, zoneOf,
  type Broadcast, type CrewId, type OpRequest, type OpState, type Priority, type RequestKind, type Task, type Zone, type ZoneStatus,
} from "./data";
import * as op from "./store";
import c from "./command.module.css";

/* ---------------------------------------------------------------------------
   The screen host: whoever is looking (a phone, the console) gives its
   sheets, toasts and navigation to everything inside it.
--------------------------------------------------------------------------- */

export interface Ui {
  me: string;
  now: number;
  toast: (text: string) => void;
  sheet: (node: ReactNode | null) => void;
  openZone: (zoneId: string) => void;
  openChat: (zoneId: string) => void;
  openConsole?: () => void;
}
const UiCtx = createContext<Ui | null>(null);
export const UiProvider = UiCtx.Provider;
export function useUi() {
  const ui = useContext(UiCtx);
  if (!ui) throw new Error("useUi outside a Command screen");
  return ui;
}

/* ---- small pieces ---- */

export function Av({ id, size = 28, ring }: { id: string; size?: number; ring?: boolean }) {
  const p = person(id);
  return (
    <span className={ring ? c.avRing : c.av} title={p.name}>
      <Avatar glyph={glyph(p.name)} tone={p.tone} size={size} shape="circle" />
    </span>
  );
}

export function Stack({ ids, size = 22, max = 4 }: { ids: string[]; size?: number; max?: number }) {
  return (
    <span className={c.stack}>
      {ids.slice(0, max).map((u) => <Av key={u} id={u} size={size} ring />)}
      {ids.length > max && <span className={c.stackMore} style={{ height: size, minWidth: size }}>+{ids.length - max}</span>}
    </span>
  );
}

const LEVEL_VAR = { ok: "var(--ok-mark)", over: "var(--chart-3)", short: "var(--warn-mark)", critical: "var(--bad-mark)" } as const;
const LEVEL_INK = { ok: "var(--ok)", over: "var(--ink-2)", short: "var(--warn)", critical: "var(--bad)" } as const;

/** Staffing as a ring: on site over target, coloured only when it matters. */
export function Ring({ n, target, level, size = 44 }: { n: number; target: number; level: keyof typeof LEVEL_VAR; size?: number }) {
  const r = (size - 6) / 2;
  const len = 2 * Math.PI * r;
  const share = Math.min(1, n / target);
  return (
    <span className={c.ring} style={{ width: size, height: size }} aria-label={`${n} of ${target} on site`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LEVEL_VAR[level]} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${len * share} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray var(--t-slow) var(--ease-out), stroke var(--t-mid)" }}
        />
      </svg>
      <b style={{ color: LEVEL_INK[level], fontSize: size < 40 ? 11 : 13 }}>{n}/{target}</b>
    </span>
  );
}

export function StatusChip({ status }: { status: ZoneStatus }) {
  return <span className={`${c.chip} ${c[`st_${status}`]}`}>{STATUS_LABEL[status]}</span>;
}
export function PrioDot({ p }: { p: Priority }) {
  return <i className={c.prio} style={{ background: `var(--prio-${p})` }} title={`${PRIORITY_LABEL[p]} priority`} />;
}
export function Urgent() {
  return <span className={`${c.chip} ${c.urgent}`}><IconBolt size={11} />Urgent</span>;
}
export function Code({ z }: { z: Zone }) {
  return <span className={c.code}>{z.code}</span>;
}

/** Hold (or right-click) for a menu, tap to open: the app's hold gesture. */
export function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: () => { held.current = false; clear(); timer.current = setTimeout(() => { held.current = true; onHold(); }, 480); },
    onPointerUp: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); held.current = true; onHold(); },
    /** True when the last press was a hold, so the tap that ends it shouldn't open anything. */
    wasHold: () => held.current,
  };
}

/* ---- zones ---- */

export function ZoneTile({ s, z, variant = "row" }: { s: OpState; z: Zone; variant?: "row" | "tile" }) {
  const ui = useUi();
  const st = staffing(s, z);
  const tasks = openTasksIn(s, z.id).length;
  const reqs = openRequestsIn(s, z.id).filter((r) => r.status === "pending");
  const hold = useHold(() => ui.sheet(<ZoneMenu s={s} z={z} />));
  const urgent = reqs.some((r) => r.urgency === "urgent");
  return (
    <button
      className={`${variant === "tile" ? c.zoneTile : c.zoneRow} ${z.status === "issue" ? c.isIssue : ""} ${st.level === "critical" ? c.isShort : ""}`}
      onClick={() => !hold.wasHold() && ui.openZone(z.id)}
      onPointerDown={hold.onPointerDown} onPointerUp={hold.onPointerUp} onPointerLeave={hold.onPointerLeave} onContextMenu={hold.onContextMenu}
    >
      <Ring {...st} size={variant === "tile" ? 48 : 44} />
      <span className={c.zoneMain}>
        <span className={c.zoneName}><Code z={z} />{z.name}</span>
        <span className={c.zoneMeta}>
          {z.area}
          <span>· {tasks} task{tasks === 1 ? "" : "s"}</span>
          {reqs.length > 0 && <span className={urgent ? c.metaUrgent : c.metaReq}>· {reqs.length} request{reqs.length === 1 ? "" : "s"}</span>}
        </span>
      </span>
      <span className={c.zoneEnd}>
        <StatusChip status={z.status} />
        {z.leadId && <Av id={z.leadId} size={22} />}
      </span>
    </button>
  );
}

export function ZoneMenu({ s, z }: { s: OpState; z: Zone }) {
  const ui = useUi();
  const close = () => ui.sheet(null);
  const items: { label: string; icon: ReactNode; run: () => void; tone?: string }[] = [
    { label: "Open zone", icon: <IconChevron size={18} />, run: () => ui.openZone(z.id) },
    { label: "Assign people", icon: <IconUserGroup size={18} />, run: () => ui.sheet(<AssignSheet s={s} zoneId={z.id} />) },
    { label: "Set status", icon: <IconAlert size={18} />, run: () => ui.sheet(<StatusSheet z={z} />) },
    { label: "Open chat", icon: <span className={c.hash}>#</span>, run: () => ui.openChat(z.id) },
  ];
  return (
    <Sheet title={`${z.code} · ${z.name}`} onClose={close}>
      {(done) => (
        <div className={c.menu}>
          {items.map((it) => (
            <button key={it.label} onClick={() => done(it.run)}>
              <span className={c.menuIcon}>{it.icon}</span>{it.label}
            </button>
          ))}
          <button disabled><span className={c.menuIcon}>✎</span>Edit zone<span className={c.soon}>Soon</span></button>
        </div>
      )}
    </Sheet>
  );
}

export function StatusSheet({ z }: { z: Zone }) {
  const ui = useUi();
  const opts: { id: ZoneStatus; text: string }[] = [
    { id: "ok", text: "Running as planned" },
    { id: "busy", text: "Under pressure, watch it" },
    { id: "issue", text: "Something is wrong here" },
    { id: "closed", text: "Not in use right now" },
  ];
  return (
    <Sheet title={`${z.code} status`} onClose={() => ui.sheet(null)}>
      {(done) => (
        <div className={c.menu}>
          {opts.map((o) => (
            <button key={o.id} onClick={() => done(() => { op.setZoneStatus(z.id, o.id, ui.me); ui.toast(`${z.code} set to ${STATUS_LABEL[o.id]}`); })}>
              <StatusChip status={o.id} /><span className={c.menuText}>{o.text}</span>
              {z.status === o.id && <IconCheck size={16} />}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Assign: send someone here. They get a move request to accept. */
export function AssignSheet({ s, zoneId }: { s: OpState; zoneId: string }) {
  const ui = useUi();
  const [picked, setPicked] = useState<string[]>([]);
  const list = suggestions(s, zoneId);
  const notIn = Object.entries(s.presence).filter(([u, p]) => !p.zoneId && !canCommand(u)).map(([u]) => u);
  const toggle = (u: string) => setPicked((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]));
  return (
    <Sheet
      title={`Assign to ${zoneOf(s, zoneId)?.code}`}
      onClose={() => ui.sheet(null)}
      action={{ label: picked.length ? `Send ${picked.length}` : "Send", disabled: !picked.length, onClick: () => { picked.forEach((u) => op.assign(u, zoneId, ui.me)); ui.toast(`Move request sent to ${picked.length}`); } }}
    >
      <p className={c.sheetHint}>Each person gets a move request and taps Accept. Their check-in follows.</p>
      {notIn.length > 0 && <>
        <div className={c.label}>Not checked in</div>
        <div className={c.pickList}>{notIn.map((u) => <PickRow key={u} u={u} on={picked.includes(u)} why="On shift · not checked in" onClick={() => toggle(u)} />)}</div>
      </>}
      <div className={c.label}>Suggested</div>
      <div className={c.pickList}>
        {list.slice(0, 10).map(({ p, why }) => <PickRow key={p.id} u={p.id} on={picked.includes(p.id)} why={why} onClick={() => toggle(p.id)} />)}
      </div>
    </Sheet>
  );
}

export function PickRow({ u, on, why, onClick }: { u: string; on: boolean; why: string; onClick: () => void }) {
  const p = person(u);
  return (
    <button className={`${c.pickRow} ${on ? c.pickOn : ""}`} onClick={onClick} aria-pressed={on}>
      <Av id={u} size={34} />
      <span className={c.pickMain}>
        <b>{p.name}</b>
        <small><i className={c.crewDot} style={{ background: crewOf(p.crew).color }} />{crewOf(p.crew).name} · {why}</small>
      </span>
      <span className={c.check}>{on && <IconCheck size={14} />}</span>
    </button>
  );
}

/* ---- requests ---- */

const KIND_ICON: Record<RequestKind, string> = { staff: "👥", move: "↔", supplies: "📦", issue: "⚠" };

export function requestTitle(s: OpState, r: OpRequest) {
  if (r.kind === "staff") return `${r.count ?? 1} ${r.count === 1 ? "person" : "people"} for ${zoneOf(s, r.zoneId)?.code}`;
  if (r.kind === "move") return `Move ${r.people?.map(firstName).join(", ") ?? ""} to ${zoneOf(s, r.zoneId)?.code}`;
  if (r.kind === "supplies") return `Supplies for ${zoneOf(s, r.zoneId)?.code}`;
  return `Issue at ${zoneOf(s, r.zoneId)?.code}`;
}

export function RequestCard({ s, r, compact }: { s: OpState; r: OpRequest; compact?: boolean }) {
  const ui = useUi();
  const age = ui.now - r.at;
  const stale = r.status === "pending" && age > 5 * 60_000;
  const mayDecide = canDecide(s, ui.me, r);
  const z = zoneOf(s, r.zoneId)!;
  const approve = () => {
    if (r.kind === "staff") ui.sheet(<ChoosePeople s={s} r={r} />);
    else { op.decide(r.id, true, ui.me, r.people); ui.toast(r.kind === "move" ? "Move approved, waiting for answers" : "Approved"); }
  };
  return (
    <article className={`${c.req} ${r.urgency === "urgent" && r.status === "pending" ? c.reqUrgent : ""} ${stale ? c.reqStale : ""} ${compact ? c.reqCompact : ""}`}>
      <header className={c.reqHead}>
        <span className={c.reqKind} aria-hidden="true">{KIND_ICON[r.kind]}</span>
        <span className={c.reqTitle}>
          <b>{requestTitle(s, r)}</b>
          <small>{KIND_LABEL[r.kind]} · {firstName(r.by)}{r.fromZoneId ? ` · from ${zoneOf(s, r.fromZoneId)?.code}` : ""}</small>
        </span>
        <span className={c.reqAge}>
          {r.sending ? <span className={c.sending}><IconCloud size={13} />Sending…</span> : <span className={stale ? c.ageStale : undefined}>{ago(age)}</span>}
        </span>
      </header>
      <div className={c.reqTags}>
        <button className={c.codeLink} onClick={() => ui.openZone(z.id)}>{z.code} · {z.name}</button>
        {r.urgency === "urgent" && r.status === "pending" && <Urgent />}
        {r.status !== "pending" && <span className={`${c.chip} ${c[`rs_${r.status}`]}`}>{r.status === "approved" ? "Approved" : r.status === "declined" ? "Declined" : "Done"}</span>}
      </div>
      <p className={c.reqNote}>{r.note}</p>
      {r.photo && <div className={c.photo} aria-label="Photo"><IconCamera size={16} /><span>Photo · wet floor by Gate 3</span></div>}
      {r.people && r.status !== "declined" && Object.keys(r.accepts).length > 0 && (
        <div className={c.accepts}>
          {r.people.map((u) => (
            <span key={u} className={`${c.acceptRow} ${c[`ac_${r.accepts[u] ?? "pending"}`]}`}>
              <Av id={u} size={20} />{firstName(u)}
              <em>{r.accepts[u] === "accepted" ? "On the way" : r.accepts[u] === "declined" ? "Can't" : "Asked…"}</em>
            </span>
          ))}
        </div>
      )}
      {r.decidedBy && <p className={c.reqDecided}>{r.status === "declined" ? "Declined" : "Approved"} by {firstName(r.decidedBy)} in {ago((r.decidedAt ?? r.at) - r.at)}</p>}
      {r.status === "pending" && mayDecide && (
        <div className={c.reqActions}>
          <button className={c.btnGhost} onClick={() => { op.decide(r.id, false, ui.me); ui.toast("Declined"); }}>Decline</button>
          <button className={c.btnPrimary} onClick={approve}>{r.kind === "staff" ? "Choose people" : "Approve"}</button>
        </div>
      )}
      {r.status === "approved" && (r.kind === "supplies" || r.kind === "issue") && mayDecide && (
        <div className={c.reqActions}>
          {r.kind === "issue" && z.status !== "issue" && <button className={c.btnGhost} onClick={() => { op.setZoneStatus(z.id, "issue", ui.me); ui.toast(`${z.code} set to Issue`); }}>Set {z.code} to Issue</button>}
          <button className={c.btnPrimary} onClick={() => { op.markDone(r.id, ui.me); ui.toast("Marked done"); }}>Mark done</button>
        </div>
      )}
      {r.status === "pending" && !mayDecide && <p className={c.reqWaiting}>Waiting for {r.kind === "staff" || r.kind === "move" ? "Command" : `${firstName(z.leadId ?? "reema")} or Command`}</p>}
    </article>
  );
}

/** Approve a staff request: pick who goes. Suggestions put spare people from overstaffed zones first. */
export function ChoosePeople({ s, r }: { s: OpState; r: OpRequest }) {
  const ui = useUi();
  const list = suggestions(s, r.zoneId);
  const need = r.count ?? 1;
  const [picked, setPicked] = useState<string[]>(() => list.slice(0, need).map((x) => x.p.id));
  const toggle = (u: string) => setPicked((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]));
  const z = zoneOf(s, r.zoneId)!;
  return (
    <Sheet
      title="Choose people"
      onClose={() => ui.sheet(null)}
      action={{ label: `Send ${picked.length}`, disabled: !picked.length, onClick: () => { op.decide(r.id, true, ui.me, picked); ui.toast(`Approved · ${picked.length} asked to move to ${z.code}`); } }}
    >
      <div className={c.chooseHead}>
        <b>{z.code} · {z.name} needs {need}</b>
        <span>{picked.length}/{need} chosen{picked.length > need ? " · more than asked" : ""}</span>
      </div>
      <p className={c.sheetHint}>Suggested first: checked in, on this shift, from zones that can spare people, in a crew that works {z.code}.</p>
      <div className={c.pickList}>
        {list.slice(0, 12).map(({ p, why }, i) => (
          <PickRow key={p.id} u={p.id} on={picked.includes(p.id)} why={i < need ? `★ ${why}` : why} onClick={() => toggle(p.id)} />
        ))}
      </div>
    </Sheet>
  );
}

/** Need people, need supplies, report an issue: posted in the zone's channel and Command's queue. */
export function RequestSheet({ zoneId, kind: initial }: { zoneId: string; kind: RequestKind }) {
  const ui = useUi();
  const [kind, setKind] = useState<RequestKind>(initial);
  const [count, setCount] = useState(2);
  const [urgent, setUrgent] = useState(initial === "issue");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(false);
  const titles: Record<RequestKind, string> = { staff: "Need people", supplies: "Need supplies", issue: "Report issue", move: "Move" };
  const placeholder: Record<RequestKind, string> = {
    staff: "Doors open in 20, queue is long…",
    supplies: "What do you need, and how many?",
    issue: "What happened, and where exactly?",
    move: "",
  };
  return (
    <Sheet
      title={titles[kind]}
      onClose={() => ui.sheet(null)}
      action={{
        label: "Send",
        disabled: !note.trim(),
        onClick: () => {
          op.raiseRequest({ kind, zoneId, count: kind === "staff" ? count : undefined, note: note.trim(), photo: kind === "issue" && photo, urgency: urgent ? "urgent" : "normal", by: ui.me });
          ui.toast(kind === "issue" ? "Reported to your lead and Command" : "Sent to Command");
        },
      }}
    >
      <Segmented value={kind} onChange={setKind} options={[{ id: "staff", label: "People" }, { id: "supplies", label: "Supplies" }, { id: "issue", label: "Issue" }]} />
      {kind === "staff" && (
        <div className={c.field}>
          <span>How many people</span>
          <span className={c.stepper}>
            <button onClick={() => setCount((n) => Math.max(1, n - 1))} aria-label="Fewer"><IconMinus size={14} /></button>
            <b>{count}</b>
            <button onClick={() => setCount((n) => Math.min(12, n + 1))} aria-label="More"><IconPlus size={14} /></button>
          </span>
        </div>
      )}
      <textarea className={c.input} rows={3} placeholder={placeholder[kind]} value={note} onChange={(e) => setNote(e.target.value)} data-autofocus />
      {kind === "issue" && (
        <button className={`${c.attach} ${photo ? c.attachOn : ""}`} onClick={() => setPhoto((p) => !p)}>
          <IconCamera size={18} />{photo ? "Photo attached · tap to remove" : "Add a photo"}
        </button>
      )}
      <div className={c.field}>
        <span>Urgent<small>Goes to the top of Command’s queue</small></span>
        <Segmented value={urgent ? "u" : "n"} onChange={(v) => setUrgent(v === "u")} options={[{ id: "n", label: "Normal" }, { id: "u", label: "Urgent" }]} />
      </div>
      <p className={c.sheetHint}><IconCloud size={13} /> Bad signal? It’s queued on your phone and sends when you’re back.</p>
    </Sheet>
  );
}

/* ---- tasks ---- */

export function TaskRow({ t, showZone, s }: { t: Task; showZone?: boolean; s: OpState }) {
  const ui = useUi();
  const overdue = t.step !== "done" && t.due < ui.now;
  return (
    <div className={`${c.task} ${t.step === "done" ? c.taskDone : ""}`}>
      <PrioDot p={t.priority} />
      <span className={c.taskMain}>
        <b>{t.title}</b>
        <small>
          {showZone && <>{zoneOf(s, t.zoneId)?.code} · </>}
          {t.assignee ? firstName(t.assignee) : "Anyone"} · <span className={overdue ? c.overdue : undefined}>{t.step === "done" ? "Done" : overdue ? `${ago(ui.now - t.due)} late` : `due ${clockIn(t.due - ui.now)}`}</span>
        </small>
      </span>
      <span className={`${c.stepChip} ${c[`step_${t.step}`]}`}>{t.step === "todo" ? "To do" : t.step === "doing" ? "Doing" : "Done"}</span>
      <span className={c.arrows}>
        <button onClick={() => op.stepTask(t.id, -1, ui.me)} disabled={t.step === "todo"} aria-label="Step back">↑</button>
        <button onClick={() => { op.stepTask(t.id, 1, ui.me); if (t.step === "doing") ui.toast("Task done"); }} disabled={t.step === "done"} aria-label="Step forward">↓</button>
      </span>
    </div>
  );
}
const clockIn = (ms: number) => (ms < 60_000 ? "now" : `in ${ago(ms)}`);

export function TaskSheet({ zoneId, s }: { zoneId: string; s: OpState }) {
  const ui = useUi();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [zone, setZone] = useState(zoneId);
  const [due, setDue] = useState("30");
  return (
    <Sheet
      title="New task"
      onClose={() => ui.sheet(null)}
      action={{ label: "Add", disabled: !title.trim(), onClick: () => { op.addTask({ title: title.trim(), zoneId: zone, priority, dueMin: Number(due) }, ui.me); ui.toast(`Added to ${zoneOf(s, zone)?.code}`); } }}
    >
      <input className={c.input} placeholder="Check stage lights" value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
      <div className={c.label}>Zone</div>
      <div className={c.codes}>
        {s.zones.map((z) => <button key={z.id} className={zone === z.id ? c.codeOn : undefined} onClick={() => setZone(z.id)}>{z.code}</button>)}
      </div>
      <div className={c.label}>Priority</div>
      <Segmented value={priority} onChange={setPriority} options={[{ id: "high", label: "High" }, { id: "medium", label: "Medium" }, { id: "low", label: "Low" }]} />
      <div className={c.label}>Due</div>
      <Segmented value={due} onChange={setDue} options={[{ id: "15", label: "15 min" }, { id: "30", label: "30 min" }, { id: "60", label: "1 hour" }, { id: "120", label: "Later" }]} />
    </Sheet>
  );
}

/* ---- check-in ---- */

export function ScanSheet({ s }: { s: OpState }) {
  const ui = useUi();
  return (
    <Sheet title="Scan zone code" onClose={() => ui.sheet(null)}>
      {(done) => (
        <>
          <div className={c.scanner}>
            <span className={c.scanFrame}><IconQr size={40} /></span>
            <small>Point at the QR code on the zone’s sign. Camera scanning comes later; pick the code you see.</small>
          </div>
          <div className={c.codesBig}>
            {s.zones.map((z) => (
              <button key={z.id} onClick={() => done(() => { op.checkIn(ui.me, z.id, "qr"); ui.toast(`Checked in to ${z.code} · ${z.name}`); })}>
                <b>{z.code}</b><small>{z.name}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** "You're in A1 · Main Arena" (or not checked in, with Scan / Pick zone). */
export function WhereCard({ s }: { s: OpState }) {
  const ui = useUi();
  const p = s.presence[ui.me];
  const z = zoneOf(s, p?.zoneId);
  if (!z) {
    return (
      <div className={`${c.where} ${c.whereOff}`}>
        <span className={c.whereIcon}><IconLocation size={18} /></span>
        <span className={c.whereMain}><b>Not checked in</b><small>Check in where you are so Command can see you.</small></span>
        <span className={c.whereBtns}>
          <button className={c.btnPrimarySm} onClick={() => ui.sheet(<ScanSheet s={s} />)}><IconQr size={14} />Scan</button>
        </span>
      </div>
    );
  }
  const st = staffing(s, z);
  return (
    <button className={c.where} onClick={() => ui.openZone(z.id)}>
      <span className={c.whereIcon} data-on="true"><IconLocation size={18} /></span>
      <span className={c.whereMain}>
        <b>You’re in {z.code} · {z.name}</b>
        <small>Since {timeOf(p!.since)} · {st.n}/{st.target} here · {openTasksIn(s, z.id).length} tasks</small>
      </span>
      <IconChevron size={16} />
    </button>
  );
}
const timeOf = (at: number) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export { timeOf };

/* ---- broadcasts ---- */

export function readRate(s: OpState, b: Broadcast) {
  const aud = op.audienceSize(s, b);
  const read = Object.keys(b.acks).length;
  return { read: Math.min(read, aud), aud };
}

export function BroadcastItem({ s, b, onRemind }: { s: OpState; b: Broadcast; onRemind?: () => void }) {
  const ui = useUi();
  const { read, aud } = readRate(s, b);
  const pct = Math.round((read / aud) * 100);
  return (
    <article className={`${c.bc} ${b.level === "critical" ? c.bcCritical : ""}`}>
      <header>
        <span className={c.bcLevel}>{b.level === "critical" ? "Critical" : "Broadcast"}</span>
        <small>{firstName(b.by)} · {agoText(ui.now - b.at)} · {audienceText(b)}</small>
      </header>
      <p>{b.text}</p>
      <footer>
        <span className={c.bcBar}><i style={{ width: `${pct}%` }} /></span>
        <b>{read}/{aud} read</b>
        {read < aud && onRemind && <button className={c.linkBtn} onClick={onRemind}>Remind {aud - read}</button>}
        {read >= aud && <span className={c.allRead}><IconCheck size={12} />Everyone</span>}
      </footer>
    </article>
  );
}
export function audienceText(b: Broadcast) {
  if (b.audience.all) return "Everyone";
  const parts = [...(b.audience.crews ?? []).map((x) => crewOf(x).name), ...(b.audience.zones ?? []).map((z) => z.toUpperCase())];
  return parts.join(", ") || "Command";
}

/** The pinned banner a crew member sees until "Got it". */
export function BroadcastBanner({ b }: { b: Broadcast }) {
  const ui = useUi();
  return (
    <div className={c.banner} role="status">
      <span className={c.bannerIcon}><IconBell /></span>
      <span className={c.bannerMain}><small>{firstName(b.by)} · Broadcast · {agoText(ui.now - b.at)}</small><b>{b.text}</b></span>
      <button className={c.btnPrimarySm} onClick={() => op.ack(b.id, ui.me)}>Got it</button>
    </div>
  );
}
function IconBell() { return <IconAlert size={16} />; }

/** Critical: full screen, ignores mute and Do Not Disturb, needs "Got it". */
export function CriticalTakeover({ b, muted }: { b: Broadcast; muted: boolean }) {
  const ui = useUi();
  return (
    <div className={c.takeover} role="alertdialog" aria-modal="true" aria-label="Critical broadcast">
      <div className={c.takeoverPulse} aria-hidden="true" />
      <span className={c.takeoverTag}><IconAlert size={14} />Critical broadcast</span>
      <h2>{b.text}</h2>
      <p>{person(b.by).name} · Command · {agoText(ui.now - b.at)}</p>
      {muted && <p className={c.takeoverMuted}>You have this Operation muted. Critical broadcasts still come through.</p>}
      <button className={c.takeoverBtn} onClick={() => { op.ack(b.id, ui.me); ui.toast("Command can see you’ve read it"); }}>Got it</button>
    </div>
  );
}

/** "Rima asks you to go to B2 · Stage B": Accept / Can't. */
export function MovePrompt({ s, r }: { s: OpState; r: OpRequest }) {
  const ui = useUi();
  const z = zoneOf(s, r.zoneId)!;
  const from = zoneOf(s, s.presence[ui.me]?.zoneId);
  return (
    <div className={c.move} role="alertdialog" aria-label="Move request">
      <span className={c.moveTag}><IconUserGroup size={14} />Move request{r.urgency === "urgent" ? " · Urgent" : ""}</span>
      <h3>{firstName(r.decidedBy ?? r.by)} asks you to go to <span className={c.codeInline}>{z.code}</span> {z.name}</h3>
      <p>{r.note}</p>
      <div className={c.moveRoute}>
        <span>{from ? `${from.code} · ${from.name}` : "Not checked in"}</span>
        <IconChevron size={14} />
        <b>{z.code} · {z.name}</b>
      </div>
      <div className={c.reqActions}>
        <button className={c.btnGhost} onClick={() => { op.answerMove(r.id, ui.me, false); ui.toast("Command knows you can’t"); }}>Can’t</button>
        <button className={c.btnPrimary} onClick={() => { op.answerMove(r.id, ui.me, true); ui.toast(`Checked in to ${z.code} · ${z.name}`); ui.openZone(z.id); }}>Accept</button>
      </div>
    </div>
  );
}

/* ---- the floor ---- */

export function FloorMap({ s, onPick, picked }: { s: OpState; onPick: (zoneId: string) => void; picked?: string | null }) {
  return (
    <div className={c.map}>
      <svg viewBox="0 0 1000 640" className={c.mapSvg} aria-hidden="true">
        <rect x="20" y="20" width="960" height="600" rx="28" className={c.mapGround} />
        <rect x="50" y="50" width="300" height="370" rx="20" className={c.mapHall} />
        <rect x="380" y="50" width="300" height="370" rx="20" className={c.mapHall} />
        <rect x="710" y="50" width="240" height="540" rx="20" className={c.mapOut} />
        <rect x="50" y="450" width="630" height="140" rx="20" className={c.mapLevel} />
        <text x="72" y="86" className={c.mapLabel}>HALL A</text>
        <text x="402" y="86" className={c.mapLabel}>HALL B</text>
        <text x="732" y="86" className={c.mapLabel}>OUTDOOR</text>
        <text x="72" y="484" className={c.mapLabel}>LEVEL 2 · MEZZANINE</text>
        <rect x="880" y="560" width="70" height="14" rx="7" className={c.mapGate} />
        <text x="828" y="572" className={c.mapSmall}>GATE 3</text>
      </svg>
      {s.zones.map((z) => {
        const st = staffing(s, z);
        const size = 28 + Math.min(st.n, 9) * 4;
        const tone = z.status === "issue" || st.level === "critical" ? "bad" : st.level === "short" || z.status === "busy" ? "warn" : z.status === "closed" ? "off" : "ok";
        return (
          <button
            key={z.id}
            className={`${c.pin} ${c[`pin_${tone}`]} ${picked === z.id ? c.pinOn : ""}`}
            style={{ left: `${z.pin.x * 100}%`, top: `${z.pin.y * 100}%`, width: size, height: size }}
            onClick={() => onPick(z.id)}
            aria-label={`${z.code} ${z.name}, ${st.n} of ${st.target}`}
          >
            <b>{z.code}</b>
            <span className={c.pinCount}>{st.n}/{st.target}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Who's here, grouped by crew. */
export function WhoHere({ s, zoneId }: { s: OpState; zoneId: string }) {
  const ids = here(s, zoneId);
  const groups = CREWS.map((cr) => ({ cr, ids: ids.filter((u) => person(u).crew === cr.id) })).filter((g) => g.ids.length);
  if (!ids.length) return <p className={c.empty}>Nobody checked in yet.</p>;
  return (
    <div className={c.who}>
      {groups.map(({ cr, ids: g }) => (
        <div key={cr.id} className={c.whoGroup}>
          <span className={c.whoCrew}><i className={c.crewDot} style={{ background: cr.color }} />{cr.name} · {g.length}</span>
          <div className={c.whoPeople}>
            {g.map((u) => (
              <span key={u} className={c.whoPerson}>
                <Av id={u} size={36} />
                <small>{firstName(u)}{s.zones.some((z) => z.leadId === u && z.id === zoneId) ? " · Lead" : ""}</small>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export const crewName = (id: CrewId) => crewOf(id).name;
export { IconClose, zoneLabel, leadOf };
