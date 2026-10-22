"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import {
  IconAlert, IconBell, IconCamera, IconCheck, IconClose, IconCloud, IconFlag, IconInfo, IconMegaphone, IconMinus, IconPlus, IconRoute, IconUserGroup,
} from "@/components/chat/Icons";
import { Segmented, Sheet, useChatUi, useNow, type ChatUi } from "@/components/chat/ui";
import {
  ago, agoText, audienceOf, audienceText, canBroadcast, canDecide, crewOf, isSending, readRate, suggestions, zoneById, zoneStatus,
  type Audience, type OpBroadcast, type OpRequest, type RequestKind,
} from "@/lib/chat/operation";
import { canSee } from "@/lib/chat/groups";
import { userById } from "@/lib/chat/store";
import type { Card, GroupInfo, Message, OperationInfo } from "@/lib/chat/types";
import { Av, CrewDot, Urgent } from "./kit";
import { useOperation } from "./useOperation";
import s from "./cards.module.css";

/**
 * Requests and broadcasts as they appear in threads (an "opRef" card points
 * at the live item by id, so every tab shows its current state), and the
 * sheets that raise, approve and send them. Ported from the Command Center
 * prototype (components/command/parts.tsx, Console.tsx) onto useOperation.
 */

/** The screen host, with the Operation's optional navigation (the Radio engineer adds these to ChatUi). */
type OpUi = ChatUi & {
  openZone?: (zoneId: string) => void;
  openRadio?: () => void;
  openOperation?: () => void;
  switchChannel?: (channelId: string) => void;
};
const useOpUi = () => useChatUi() as OpUi;

/* ---------------------------------------------------------------------------
   Small pieces
--------------------------------------------------------------------------- */

/** Hugeicons' package, drawn the way components/chat/Icons.tsx draws every icon. */
function IconPackage({ size = 20 }: { size?: number }) {
  return <HugeiconsIcon icon={PackageIcon} size={size} strokeWidth={1.6} color="currentColor" aria-hidden="true" />;
}

export const KIND_LABEL: Record<RequestKind, string> = { staff: "Need people", move: "Move", supplies: "Supplies", issue: "Issue" };

export function KindIcon({ kind, size = 18 }: { kind: RequestKind; size?: number }) {
  if (kind === "staff") return <IconUserGroup size={size} />;
  if (kind === "move") return <IconRoute size={size} />;
  if (kind === "supplies") return <IconPackage size={size} />;
  return <IconAlert size={size} />;
}

const firstName = (id: string) => userById(id).name;
const names = (ids: string[]) => {
  const n = ids.map(firstName);
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, 2).join(", ")} and ${n.length - 2} more`;
};
/** How long a decision took: "in 2 min", "in under a minute". */
const took = (ms: number) => (ms < 60_000 ? "in under a minute" : `in ${ago(ms)}`);

/** "3 people for B2", "Supplies for D1", "Issue at C1", "Move Salman to B2" ("…for a removed zone" once its zone is gone). */
export function requestTitle(op: OperationInfo, r: Pick<OpRequest, "kind" | "zoneId" | "count" | "people">) {
  const code = zoneById(op, r.zoneId)?.code ?? "a removed zone";
  if (r.kind === "staff") return `${r.count ?? 1} ${(r.count ?? 1) === 1 ? "person" : "people"} for ${code}`;
  if (r.kind === "move") return `Move ${r.people?.length ? names(r.people) : "someone"} to ${code}`;
  if (r.kind === "supplies") return `Supplies for ${code}`;
  return `Issue at ${code}`;
}

/** A zone code that opens the zone page (when the screen can), with the zone's name. */
function ZoneChip({ code, name, onOpen }: { code: string; name: string; onOpen?: () => void }) {
  const inner = <><b>{code}</b>{name}</>;
  return onOpen
    ? <button className={s.zoneChip} onClick={onOpen} aria-label={`Open ${code} ${name}`}>{inner}</button>
    : <span className={s.zoneChip}>{inner}</span>;
}

function Gone({ children = "No longer available" }: { children?: ReactNode }) {
  return <div className={s.gone}><IconInfo size={16} />{children}</div>;
}

/* ---------------------------------------------------------------------------
   The card in the thread
--------------------------------------------------------------------------- */

type OpRef = Extract<Card, { type: "opRef" }>;

/** Reads the live request or broadcast the card points at, so every tab shows where it stands now. */
export function OpRefCard({ message, card, interactive }: { message: Message; card: OpRef; interactive: boolean }) {
  const { live, op } = useOperation(card.groupId);
  // Before the page has mounted there is no live state yet: the summary stands in.
  if (!live) return <Gone>{message.body}</Gone>;
  if (!op) return <Gone>This Operation has ended</Gone>;
  if (card.ref === "request") {
    const r = live.requests.find((x) => x.id === card.id);
    return r ? <RequestView groupId={card.groupId} request={r} interactive={interactive} /> : <Gone />;
  }
  const b = live.broadcasts.find((x) => x.id === card.id);
  return b ? <BroadcastView groupId={card.groupId} broadcast={b} interactive={interactive} /> : <Gone />;
}

/* ---------------------------------------------------------------------------
   Requests
--------------------------------------------------------------------------- */

const STATUS_TEXT: Record<OpRequest["status"], string> = { pending: "Pending", approved: "Approved", declined: "Declined", done: "Done" };

export function RequestView({ groupId, request: r, compact, interactive = true }: {
  groupId: string;
  request: OpRequest;
  compact?: boolean;
  interactive?: boolean;
}) {
  const { info, op, live, me, act } = useOperation(groupId);
  const ui = useOpUi();
  const ticked = useNow(15_000);
  // "Sending…" lasts 5 s at most (the phone that sent it may have gone away
  // before it landed): wake once when that runs out, between the slow ticks.
  const [woke, setWoke] = useState(0);
  useEffect(() => {
    if (!r.sending) return;
    const t = setTimeout(() => setWoke(Date.now()), Math.max(0, r.at + 5000 - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [r.sending, r.at]);
  const now = Math.max(ticked, woke);
  const z = op ? zoneById(op, r.zoneId) : undefined;
  if (!info || !op) return <Gone />;
  if (!z) return <ZoneRemoved op={op} request={r} me={me} compact={compact} now={now} />;

  const pending = r.status === "pending";
  const age = now - r.at;
  const stale = pending && age > 5 * 60_000;
  const urgent = pending && r.urgency === "urgent";
  const mayDecide = canDecide(info, me, r);
  const from = r.fromZoneId ? zoneById(op, r.fromZoneId) : undefined;
  const openZone = ui.openZone;
  const myAnswer = r.accepts[me];

  const approve = () => {
    if (r.kind === "staff") {
      ui.openSheet(<ChoosePeople groupId={groupId} requestId={r.id} onClose={ui.closeSheet} />);
      return;
    }
    act.decide(r.id, true, r.people);
    ui.toast(r.kind === "move" ? "Move approved · waiting for answers" : `Approved · ${z.code}`);
  };
  const decline = () => { act.decide(r.id, false); ui.toast("Declined"); };
  const answer = (accept: boolean) => {
    act.answer(r.id, accept);
    if (!accept) { ui.toast("Command knows you can’t"); return; }
    ui.toast(`Checked in to ${z.code} · ${z.name}`);
    // Only to a zone channel that's there for me: one I can't see (or that was closed) would show nothing.
    const channel = info.channels.find((c) => c.id === z.channelId);
    if (channel && canSee(info, channel, me)) ui.switchChannel?.(z.channelId);
  };

  const waitingFor = r.kind === "staff" || r.kind === "move" || !z.leadId || z.leadId === r.by
    ? "Command"
    : `${firstName(z.leadId)} or Command`;

  return (
    <article
      className={[s.req, urgent ? s.reqUrgent : "", stale ? s.reqStale : "", compact ? s.reqCompact : "", r.status === "declined" || r.status === "done" ? s.reqClosed : ""].join(" ")}
      aria-label={requestTitle(op, r)}
    >
      <header className={s.reqHead}>
        <span className={`${s.reqKind} ${r.kind === "issue" && r.status !== "declined" && r.status !== "done" ? s.reqKindIssue : ""}`} aria-hidden="true">
          <KindIcon kind={r.kind} />
        </span>
        <span className={s.reqTitle}>
          <b>{requestTitle(op, r)}</b>
          <small>{KIND_LABEL[r.kind]} · {r.by === me ? "you" : firstName(r.by)}{from ? ` · from ${from.code}` : ""}</small>
        </span>
        <span className={s.reqAge}>
          {isSending(r, now)
            ? <span className={s.sending}><IconCloud size={13} />Sending…</span>
            : <span className={stale ? s.ageStale : undefined} title={stale ? "Waiting more than 5 minutes" : undefined}>{ago(age)}</span>}
        </span>
      </header>

      <div className={s.reqTags}>
        <ZoneChip code={z.code} name={z.name} onOpen={interactive && openZone ? () => openZone(z.id) : undefined} />
        {urgent && <Urgent />}
        {!pending && <span className={`${s.chip} ${s[`rs_${r.status}`]}`}>{r.status === "done" ? <IconCheck size={11} /> : null}{STATUS_TEXT[r.status]}</span>}
      </div>

      {r.note && <p className={s.reqNote}>{r.note}</p>}
      {r.photo && (compact
        ? <span className={s.photoSmall}><IconCamera size={13} />Photo attached</span>
        : <div className={s.photo} role="img" aria-label="Photo"><IconCamera size={16} /><span>Photo · {z.code}</span></div>)}

      {r.people && r.status !== "declined" && Object.keys(r.accepts).length > 0 && (
        <div className={s.accepts}>
          {r.people.map((u) => {
            const a = r.accepts[u] ?? "pending";
            return (
              <span key={u} className={`${s.acceptRow} ${s[`ac_${a}`]}`}>
                <Av id={u} size={22} />
                <span>{u === me ? "You" : userById(u).fullName}</span>
                <em>{a === "accepted" ? "On the way" : a === "declined" ? "Can’t" : "Asked…"}</em>
              </span>
            );
          })}
        </div>
      )}

      {r.decidedBy && r.decidedAt && (
        <p className={s.reqMeta}>
          {r.status === "declined" ? "Declined" : "Approved"} by {r.decidedBy === me ? "you" : firstName(r.decidedBy)} {took(r.decidedAt - r.at)}
        </p>
      )}

      {interactive && pending && mayDecide && (
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={decline}><IconClose size={16} />Decline</button>
          <button className={s.btn} onClick={approve}>
            {r.kind === "staff" ? <><IconUserGroup size={16} />Choose people</> : <><IconCheck size={16} />Approve</>}
          </button>
        </div>
      )}

      {interactive && r.status === "approved" && (r.kind === "supplies" || r.kind === "issue") && mayDecide && (
        <div className={s.actions}>
          {r.kind === "issue" && live && zoneStatus(live, z.id) !== "issue" && (
            <button className={s.btnGhost} onClick={() => { act.setZoneStatus(z.id, "issue"); ui.toast(`${z.code} set to Issue`); }}>
              <IconAlert size={16} />Set {z.code} to Issue
            </button>
          )}
          <button className={s.btn} onClick={() => { act.markDone(r.id); ui.toast("Marked done"); }}><IconCheck size={16} />Mark done</button>
        </div>
      )}

      {interactive && myAnswer === "pending" && r.status !== "declined" && (
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={() => answer(false)}><IconClose size={16} />Can’t</button>
          <button className={s.btn} onClick={() => answer(true)}><IconCheck size={16} />Accept</button>
        </div>
      )}

      {pending && !mayDecide && <p className={s.reqMeta}>Waiting for {waitingFor}</p>}
    </article>
  );
}

/**
 * A request whose zone was removed from the Operation: kept for the record,
 * quiet and closed, with nothing left to approve, answer or mark done.
 */
function ZoneRemoved({ op, request: r, me, compact, now }: { op: OperationInfo; request: OpRequest; me: string; compact?: boolean; now: number }) {
  // Removing the zone declines what was still open, so "Declined" here would read as someone's answer: it's just closed.
  const done = r.status === "done";
  const title = requestTitle(op, r);
  return (
    <article className={[s.req, s.reqClosed, compact ? s.reqCompact : ""].join(" ")} aria-label={`${title}, closed`}>
      <header className={s.reqHead}>
        <span className={s.reqKind} aria-hidden="true"><KindIcon kind={r.kind} /></span>
        <span className={s.reqTitle}>
          <b>{title}</b>
          <small>{KIND_LABEL[r.kind]} · {r.by === me ? "you" : firstName(r.by)}</small>
        </span>
        <span className={s.reqAge}>{ago(now - r.at)}</span>
      </header>
      <div className={s.reqTags}>
        <span className={`${s.chip} ${done ? s.rs_done : s.rs_declined}`}>{done ? <><IconCheck size={11} />Done</> : "Closed"}</span>
      </div>
      {r.note && <p className={s.reqNote}>{r.note}</p>}
      <p className={s.reqMeta}><IconInfo size={13} />{done ? "Its zone has since been removed" : "Its zone was removed, so nothing is left to do here"}</p>
    </article>
  );
}

/** A person to pick, with why they're suggested. */
function PickRow({ info, userId, on, why, star, onClick }: { info: GroupInfo; userId: string; on: boolean; why: string; star?: boolean; onClick: () => void }) {
  const u = userById(userId);
  const crew = crewOf(info, userId);
  return (
    <button className={`${s.pickRow} ${on ? s.pickOn : ""}`} onClick={onClick} aria-pressed={on}>
      <Av id={userId} size={36} />
      <span className={s.pickMain}>
        <b>{u.fullName}</b>
        <small>
          {crew && <><CrewDot tone={crew.tone} />{crew.name} · </>}
          {star && <em className={s.star}>★ </em>}{why || "Checked in"}
        </small>
      </span>
      <span className={s.check}>{on && <IconCheck size={14} />}</span>
    </button>
  );
}

/** Approve a staff request: pick who goes. Spare people from overstaffed zones, in the right crew, come first. */
export function ChoosePeople({ groupId, requestId, onClose }: { groupId: string; requestId: string; onClose: () => void }) {
  const { info, op, live, members, me, act } = useOperation(groupId);
  const ui = useOpUi();
  const r = live?.requests.find((x) => x.id === requestId);
  const list = info && live && r ? suggestions(info, live, members, r.zoneId) : [];
  const need = r?.count ?? 1;
  const [picked, setPicked] = useState<string[]>(() => list.slice(0, need).map((x) => x.userId));
  const toggle = (u: string) => setPicked((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]));
  const z = op && r ? zoneById(op, r.zoneId) : undefined;
  const open = r?.status === "pending";

  return (
    <Sheet
      title="Choose people"
      onClose={onClose}
      action={{
        label: picked.length ? `Send ${picked.length}` : "Send",
        disabled: !open || !picked.length,
        onClick: () => {
          act.decide(requestId, true, picked);
          ui.toast(`Approved · ${picked.length} asked to move to ${z?.code ?? "the zone"}`);
        },
      }}
    >
      {!r || !z || !info ? <p className={s.emptyBox}>This request is no longer available.</p> : <>
        <div className={s.chooseHead}>
          <b>{z.code} · {z.name} needs {need}</b>
          <span>{picked.length}/{need} chosen{picked.length > need ? " · more than asked" : ""}</span>
        </div>
        {!open && (
          <p className={s.criticalNote}>
            <IconInfo size={15} />
            {r.decidedBy ? `${r.decidedBy === me ? "You" : firstName(r.decidedBy)} already ${r.status === "declined" ? "declined" : "answered"} this.` : "This request was already answered."}
          </p>
        )}
        <p className={s.hint}>Suggested first: checked in elsewhere, from zones that can spare people, in a crew that works {z.code}.</p>
        {list.length ? (
          <div className={s.pickList}>
            {list.slice(0, 14).map((x, i) => (
              <PickRow key={x.userId} info={info} userId={x.userId} on={picked.includes(x.userId)} why={x.why} star={i < need} onClick={() => toggle(x.userId)} />
            ))}
          </div>
        ) : (
          <p className={s.emptyBox}>Nobody checked in elsewhere right now. Ask a lead on the radio, or assign someone from the zone page.</p>
        )}
      </>}
    </Sheet>
  );
}

type RaiseKind = Exclude<RequestKind, "move">;
const TITLES: Record<RaiseKind, string> = { staff: "Need people", supplies: "Need supplies", issue: "Report an issue" };
const PLACEHOLDER: Record<RaiseKind, string> = {
  staff: "Doors open in 20, the queue is long…",
  supplies: "What do you need, and how many?",
  issue: "What happened, and where exactly?",
};

/** Need people, need supplies, report an issue: posted in the zone's channel and in Command's queue. */
export function RequestSheet({ groupId, zoneId, kind: initial, onClose }: { groupId: string; zoneId: string; kind: RequestKind; onClose: () => void }) {
  const { op, me, act } = useOperation(groupId);
  const ui = useOpUi();
  const first: RaiseKind = initial === "move" ? "staff" : initial;
  const [kind, setKind] = useState<RaiseKind>(first);
  const [count, setCount] = useState(2);
  const [urgency, setUrgency] = useState<OpRequest["urgency"]>(first === "issue" ? "urgent" : "normal");
  const [urgencyTouched, setUrgencyTouched] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(false);
  const [zone, setZone] = useState(zoneId);
  const z = op ? zoneById(op, zone) : undefined;

  const pickKind = (k: RaiseKind) => {
    setKind(k);
    // Issues default to urgent, until you choose yourself.
    if (!urgencyTouched) setUrgency(k === "issue" ? "urgent" : "normal");
  };
  const togglePhoto = async () => {
    if (photo) { setPhoto(false); return; }
    if (await ui.ask("camera")) setPhoto(true);
    else ui.toast("Camera access is off");
  };
  const send = () => {
    if (!z) return;
    act.raiseRequest({
      kind, zoneId: z.id, note: note.trim(), urgency,
      ...(kind === "staff" ? { count } : {}),
      ...(kind === "issue" && photo ? { photo: true } : {}),
    });
    const lead = z.leadId && z.leadId !== me && kind !== "staff" ? firstName(z.leadId) : null;
    ui.toast(lead ? `Sent to ${lead} and Command` : "Sent to Command");
  };

  return (
    <Sheet title={TITLES[kind]} onClose={onClose} action={{ label: "Send", disabled: !note.trim() || !z, onClick: send }}>
      <Segmented<RaiseKind> value={kind} onChange={pickKind} options={[{ id: "staff", label: "People" }, { id: "supplies", label: "Supplies" }, { id: "issue", label: "Issue" }]} />
      {op && op.zones.length > 1 ? (
        <>
          <p className={s.label}>Zone</p>
          <div className={s.codes} role="radiogroup" aria-label="Zone">
            {op.zones.map((x) => (
              <button key={x.id} role="radio" aria-checked={zone === x.id} className={zone === x.id ? s.codeOn : undefined} onClick={() => setZone(x.id)} title={x.name}>
                {x.code}
              </button>
            ))}
          </div>
        </>
      ) : z ? <p className={s.forZone}>For <b>{z.code} · {z.name}</b></p> : null}
      {kind === "staff" && (
        <div className={s.field}>
          <span>How many people<small>Command picks who goes</small></span>
          <span className={s.stepper}>
            <button onClick={() => setCount((n) => Math.max(1, n - 1))} disabled={count <= 1} aria-label="Fewer"><IconMinus size={14} /></button>
            <b aria-live="polite">{count}</b>
            <button onClick={() => setCount((n) => Math.min(12, n + 1))} disabled={count >= 12} aria-label="More"><IconPlus size={14} /></button>
          </span>
        </div>
      )}
      <textarea className={s.input} rows={3} placeholder={PLACEHOLDER[kind]} value={note} onChange={(e) => setNote(e.target.value)} data-autofocus aria-label="Note" />
      {kind === "issue" && (
        <button className={`${s.attach} ${photo ? s.attachOn : ""}`} onClick={() => void togglePhoto()} aria-pressed={photo}>
          <IconCamera size={18} />{photo ? "Photo attached · tap to remove" : "Add a photo"}
        </button>
      )}
      <div className={s.field}>
        <span>Urgency<small>Urgent goes to the top of Command’s queue</small></span>
        <Segmented<OpRequest["urgency"]>
          value={urgency}
          onChange={(v) => { setUrgency(v); setUrgencyTouched(true); }}
          options={[{ id: "normal", label: "Normal" }, { id: "urgent", label: "Urgent" }]}
        />
      </div>
      <p className={s.hint}><IconCloud size={14} />Bad signal? It’s queued on your phone and sends when you’re back.</p>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Broadcasts
--------------------------------------------------------------------------- */

export function BroadcastView({ groupId, broadcast: b, interactive = true }: { groupId: string; broadcast: OpBroadcast; interactive?: boolean }) {
  const { info, live, members, me, act } = useOperation(groupId);
  const ui = useOpUi();
  const now = useNow(30_000);
  if (!info || !live) return <Gone />;
  const { read, aud } = readRate(info, live, members, b);
  const pct = aud ? Math.round((read / aud) * 100) : 0;
  const forMe = audienceOf(info, live, members, b.audience).includes(me);
  const critical = b.level === "critical";
  const everyone = aud > 0 && read >= aud;
  const remind = () => {
    const n = act.remind(b.id);
    ui.toast(n ? `Reminded ${n} ${n === 1 ? "person" : "people"}` : "Everyone has read it");
  };
  const gotIt = () => { act.ack(b.id); ui.toast("Command can see you’ve read it"); };

  return (
    <article className={`${s.bc} ${critical ? s.bcCritical : ""}`} aria-label={critical ? "Critical broadcast" : "Broadcast"}>
      <header className={s.bcHead}>
        <span className={s.bcLevel}>{critical ? <IconAlert size={12} /> : <IconMegaphone size={12} />}{critical ? "Critical" : "Broadcast"}</span>
        <span className={s.bcMeta}>{b.by === me ? "You" : firstName(b.by)} · {agoText(now - b.at)} · {audienceText(info, b.audience)}</span>
      </header>
      <p className={s.bcText}>{b.text}</p>
      <footer className={s.bcFoot}>
        <span className={`${s.bcBar} ${everyone ? s.bcBarFull : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={aud} aria-valuenow={read} aria-label="Read">
          <i style={{ width: `${pct}%` }} />
        </span>
        <b>{read}/{aud} read</b>
        {everyone
          ? <span className={s.allRead}><IconCheck size={12} />Everyone</span>
          : interactive && canBroadcast(info, me) && <button className={s.linkBtn} onClick={remind}><IconBell size={14} />Remind {aud - read}</button>}
      </footer>
      {b.reminded && !everyone && <p className={s.reqMeta}>Reminded {agoText(now - b.reminded)}</p>}
      {interactive && forMe && !b.acks[me] && (
        <div className={s.bcAck}>
          <span>{critical ? "Critical: needs your Got it" : "Let Command know you’ve read it"}</span>
          <button className={s.btnSm} onClick={gotIt}><IconCheck size={14} />Got it</button>
        </div>
      )}
    </article>
  );
}

type To = "all" | "roles" | "zones";

/** Write a broadcast: who it's for, how loud. Critical takes over every phone it reaches. */
export function BroadcastSheet({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { info, op, live, members, me, act } = useOperation(groupId);
  const ui = useOpUi();
  const [text, setText] = useState("");
  const [level, setLevel] = useState<OpBroadcast["level"]>("normal");
  const [to, setTo] = useState<To>("all");
  const [roles, setRoles] = useState<string[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const allowed = !!info && canBroadcast(info, me);
  const audience: Audience = to === "all" ? { all: true } : to === "roles" ? { roles } : { zones };
  const picked = to === "all" || (to === "roles" ? roles.length > 0 : zones.length > 0);
  const valid = allowed && !!text.trim() && picked;
  const reach = info && live ? audienceOf(info, live, members, audience).filter((u) => u !== me).length : 0;
  const tog = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const crews = info && op ? op.crews.map((id) => info.roles.find((r) => r.id === id)).filter((r): r is GroupInfo["roles"][number] => !!r) : [];

  const send = () => {
    act.sendBroadcast(text.trim(), level, audience);
    ui.toast(level === "critical" ? "Critical broadcast sent · breaks through mute" : `Broadcast sent to ${reach}`);
  };

  return (
    <Sheet title="Broadcast" onClose={onClose} action={{ label: level === "critical" ? "Send critical" : "Send", disabled: !valid, onClick: send }}>
      {!allowed ? <p className={s.emptyBox}>Only Command can send broadcasts in this Operation.</p> : <>
        <textarea
          className={s.input}
          rows={3}
          placeholder="Doors open in 10 minutes. All crews to positions."
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-autofocus
          aria-label="Broadcast text"
        />
        <p className={s.label}>To</p>
        <Segmented<To> value={to} onChange={setTo} options={[{ id: "all", label: "Everyone" }, { id: "roles", label: "Crews" }, { id: "zones", label: "Zones" }]} />
        {to === "roles" && (
          crews.length ? (
            <div className={s.codes}>
              {crews.map((r) => (
                <button key={r.id} className={roles.includes(r.id) ? s.codeOn : undefined} onClick={() => setRoles((x) => tog(x, r.id))} aria-pressed={roles.includes(r.id)}>
                  <CrewDot tone={r.tone} />{r.name}
                </button>
              ))}
            </div>
          ) : <p className={s.hint}>This Operation has no crews yet.</p>
        )}
        {to === "zones" && op && (
          op.zones.length ? (
            <div className={s.codes}>
              {op.zones.map((z) => (
                <button key={z.id} className={zones.includes(z.id) ? s.codeOn : undefined} onClick={() => setZones((x) => tog(x, z.id))} aria-pressed={zones.includes(z.id)} title={z.name}>
                  {z.code}
                </button>
              ))}
            </div>
          ) : <p className={s.hint}>This Operation has no zones yet.</p>
        )}
        <p className={s.reach}>
          {picked
            ? <>Reaches <b>{reach}</b> {reach === 1 ? "person" : "people"}{to === "zones" ? " there now" : ""}{to !== "all" ? ", Command included" : ""}</>
            : to === "roles" ? "Pick at least one crew." : "Pick at least one zone."}
        </p>
        <p className={s.label}>Level</p>
        <Segmented<OpBroadcast["level"]> value={level} onChange={setLevel} options={[{ id: "normal", label: "Normal" }, { id: "critical", label: "Critical" }]} />
        {level === "critical"
          ? <p className={s.criticalNote}><IconAlert size={15} />Full screen on every phone it reaches. Ignores mute and Do Not Disturb, and stays until each person taps Got it.</p>
          : <p className={s.hint}><IconFlag size={14} />Posts in #broadcasts and notifies, unless someone has muted the Operation.</p>}
      </>}
    </Sheet>
  );
}
