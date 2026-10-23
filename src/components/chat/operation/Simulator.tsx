"use client";

import { useEffect, useRef } from "react";
import { readMutes, setMute } from "@/lib/chat/mutes";
import {
  audienceOf, crewOf, DROPPED_MS, here, isCommand, isOnAir, leadsZone, listeners, radioChannels, staffing, zoneById, zoneStatus,
  type OpAction, type OpLive, type Target,
} from "@/lib/chat/operation";
import { onOpAction, opLive } from "@/lib/chat/opstore";
import { EWC_ID, EWC_SCRIPT } from "@/lib/chat/seed-ops";
import { clientId, useChat } from "@/lib/chat/store";
import type { Chat, GroupInfo } from "@/lib/chat/types";
import { useOperation, type OperationApi } from "./useOperation";

/**
 * Keeps every Operation alive on this device: radio chatter, answers on the
 * radio, people reading broadcasts and accepting moves, and now and then
 * someone moving zone or asking for supplies.
 *
 * One tab per device drives it (the "leader": the smallest clientId among
 * this tab and its peers), so two windows don't both talk. Anyone signed in
 * somewhere (this tab's person, or any peer's) is "live": they answer for
 * themselves and are never simulated.
 *
 * Every tab hears every action (onOpAction) and schedules the same answers,
 * with choices that are a hash of the ids rather than random; whichever tab
 * leads when a timer fires does it. Actions are idempotent, so an overlap
 * while leadership changes hands costs nothing.
 *
 * Renders nothing.
 */

/** A new tab waits this long for the other tabs' heartbeats before it may lead. */
const READY_MS = 2600;
const WORD_MS = 210;
/** A call still on air this long after it started, from someone no longer here, was left hanging by a closed tab. */
const STALE_MS = 45_000;
/** A leader tab in the background this long stops starting calls (its timers are about to slow to one a minute). */
const ASLEEP_MS = 4 * 60_000;

const COPY = ["Copy that.", "Copy, on it.", "Received, moving now.", "Copy. Will report back in five."];
const SUPPLIES = [
  "Two more radios with earpieces, please.",
  "Gaffer tape and cable ties.",
  "A box of water bottles for the crew.",
  "Spare batteries for the handhelds.",
  "An extension lead for the desk.",
  "Hand sanitiser refill by the door.",
];
/** People the demo walks through: the venue leaves them where they are. */
const DEMO_PEOPLE = new Set(["me", "reema", "faisal", "jamshad", "salman", "tariq"]);
/** Salman's mute on EWC is set once per device (Reset demo data clears the flag with the rest of nod.ops.*). */
const SALMAN_MUTED_KEY = "nod.ops.salmanMuted";

interface Line { by: string; target: Target; text: string }
type Get = () => OperationApi;

/** FNV-1a: the same choice in every tab. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const isOperationGroup = (c: Chat) => c.kind === "group" && !c.groupId && !c.removedAt && !!c.group?.operation;

export function OperationSimulator() {
  const { state } = useChat();
  const ids = state.data.chats.filter(isOperationGroup).map((c) => c.id);

  useEffect(() => { muteSalmanOnce(); }, []);

  return <>{ids.map((id) => <GroupSim key={id} groupId={id} />)}</>;
}

/** So the critical-breaks-through-mute demo works from the first visit. */
function muteSalmanOnce() {
  try {
    if (localStorage.getItem(SALMAN_MUTED_KEY)) return;
    localStorage.setItem(SALMAN_MUTED_KEY, "1");
  } catch { return; }
  if (!readMutes("salman")[EWC_ID]) setMute("salman", EWC_ID, { messages: "none", calls: false, until: null });
}

function GroupSim({ groupId }: { groupId: string }) {
  const api = useOperation(groupId);
  // Timers read the latest group, people and live state, never the ones they were scheduled with.
  const latest = useRef(api);
  useEffect(() => { latest.current = api; });
  useEffect(() => run(groupId, () => latest.current), [groupId]);
  return null;
}

/* ---------------------------------------------------------------------------
   The simulation for one Operation. Returns its cleanup.
--------------------------------------------------------------------------- */

function run(gid: string, get: Get): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };
  const startedAt = Date.now();
  // Calls this tab is streaming right now (id -> full text), finished on unmount so nothing hangs on air.
  const speaking = new Map<string, string>();
  // Actions already answered (an action can reach a tab twice).
  const handled = new Set<string>();
  let lastLine = -1;

  const liveSet = () => {
    const a = get();
    return new Set([a.me, ...a.peers.map((p) => p.userId)]);
  };
  // The tab with the smallest id leads, while it is awake. A hidden leader soon stops starting anything, so a
  // visible tab takes over rather than waiting for its heartbeats to lapse.
  // A paused or finished day is quiet: nobody simulated says or does anything until it's back on.
  const dayOn = () => (opLive(gid)?.day?.state ?? "on") === "on";
  const leader = () => Date.now() - startedAt >= READY_MS && !asleep() && dayOn() && get().peers.every((p) => p.clientId > clientId);
  // A background tab's timers slow to one a second (fine: words are paced by the clock), and after
  // five minutes to one a minute; long before that it stops starting new calls.
  let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
  const onVisibility = () => { hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0; };
  document.addEventListener("visibilitychange", onVisibility);
  const asleep = () => hiddenAt > 0 && Date.now() - hiddenAt > ASLEEP_MS;
  const ready = () => {
    const a = get();
    const l = opLive(gid);
    return a.info?.operation && l ? { a, info: a.info, l } : null;
  };

  /* ---- talking: the words stream in, about 210 ms each, paced by the clock ---- */

  const speak = (by: string, target: Target, text: string, fixedId?: string) => {
    // A fixed id (a reply to one call) makes two tabs' copies one call: the reducer keeps the first.
    if (fixedId && opLive(gid)?.radio.tx.some((t) => t.id === fixedId)) return;
    const id = get().act.keyUp(target, "sim", by, fixedId);
    const words = text.split(/\s+/).filter(Boolean);
    const start = Date.now();
    const end = 400 + words.length * WORD_MS;
    let shown = 0;
    speaking.set(id, text);
    // Word k is on air from 160 + k × 210 ms. A throttled timer just shows several at once.
    const step = () => {
      const t = Date.now() - start;
      if (t >= end) {
        speaking.delete(id);
        get().act.release(id, text, "sim");
        return;
      }
      const n = Math.min(words.length, Math.floor((t - 160) / WORD_MS) + 1);
      if (n > shown) {
        shown = n;
        get().act.words(id, words.slice(0, n).join(" "));
      }
      const next = shown < words.length ? 160 + shown * WORD_MS : end;
      later(Math.max(16, next - t), step);
    };
    later(160, step);
  };

  /** One voice per channel at a time; an All-call holds everyone. A call left on air too long no longer counts. */
  const busy = (l: OpLive, by: string, target: Target) => {
    const now = Date.now();
    return l.radio.tx.some((t) => isOnAir(t, now) && (t.by === by || t.target.all || (!!target.channel && t.target.channel === target.channel)));
  };

  /**
   * Calls left on air by a tab that closed mid-sentence go out with what was said: a simulated one after
   * STALE_MS, anyone's after DROPPED_MS (a live person's real call is released by their own tab long before).
   */
  const sweep = (l: OpLive, live: Set<string>) => {
    const now = Date.now();
    for (const t of l.radio.tx) {
      if (!t.live || speaking.has(t.id)) continue;
      const limit = live.has(t.by) ? DROPPED_MS : STALE_MS;
      if (now - t.at > limit) get().act.release(t.id, t.text, t.source);
    }
  };

  /* ---- (a) chatter: someone keys up somewhere every 4-8 s ---- */

  const chatter = () => {
    later(4000 + Math.random() * 4000, chatter);
    if (!leader() || asleep()) return;
    const r = ready();
    if (!r) return;
    const live = liveSet();
    sweep(r.l, live);
    const channels = new Set(radioChannels(r.info).map((c) => c.id));
    const pool = gid === EWC_ID ? EWC_SCRIPT : generatedLines(r.info, r.l, r.a.members);
    if (!pool.length) return;
    // Nobody says the same thing twice in a few minutes (read from the shared transcript, so it holds across tabs).
    const said = new Set(r.l.radio.tx.filter((t) => Date.now() - t.at < 4 * 60_000).map((t) => t.text));
    for (let tries = 0; tries < 12; tries++) {
      const i = Math.floor(Math.random() * pool.length);
      const line = pool[i];
      if (i === lastLine && pool.length > 1) continue;
      if (said.has(line.text) && pool.length > said.size) continue;
      if (!r.a.members.includes(line.by) || live.has(line.by)) continue;
      if (line.target.channel && !channels.has(line.target.channel)) continue;
      // A zone's line comes from someone there (or its lead), not from someone who has since moved on.
      const zone = line.target.channel?.startsWith("zone:") ? line.target.channel.slice(5) : null;
      if (zone && r.l.presence[line.by]?.zoneId !== zone && zoneById(r.info.operation!, zone)?.leadId !== line.by) continue;
      if (busy(r.l, line.by, line.target)) continue;
      lastLine = i;
      speak(line.by, line.target, line.text);
      return;
    }
  };

  /* ---- (b) answers: someone live calls a channel, someone there answers ---- */

  const onRelease = (txId: string) => {
    const tx = opLive(gid)?.radio.tx.find((t) => t.id === txId);
    if (!tx || tx.live || tx.source === "sim" || !liveSet().has(tx.by)) return;
    const channel = tx.target.channel;
    if (!channel || channel === "all" || tx.target.all) return;
    const reply = (tries: number) => {
      if (!leader()) return;
      const r = ready();
      if (!r) return;
      const who = replier(r.info, r.l, r.a.members, tx.by, channel, liveSet(), tx.id);
      if (!who) return;
      if (busy(r.l, who, { channel })) {
        if (tries < 2) later(1500, () => reply(tries + 1));
        return;
      }
      speak(who, { channel }, COPY[hash(tx.id) % COPY.length], `reply-${tx.id}`);
    };
    later(2200, () => reply(0));
  };

  /* ---- (c) broadcasts: most read within seconds; Remind brings in the rest ---- */

  const onBroadcast = (broadcastId: string, by: string, remind: boolean) => {
    const live = liveSet();
    if (!live.has(by)) return;
    const r = ready();
    const b = r?.l.broadcasts.find((x) => x.id === broadcastId);
    if (!r || !b) return;
    const waiting = audienceOf(r.info, r.l, r.a.members, b.audience)
      .filter((u) => !b.acks[u] && !live.has(u))
      .sort((x, y) => hash(broadcastId + x) - hash(broadcastId + y));
    const readers = remind ? waiting : waiting.slice(0, Math.round(waiting.length * (b.level === "critical" ? 0.8 : 0.6)));
    const ack = (u: string) => {
      if (!leader() || liveSet().has(u)) return;
      get().act.ack(broadcastId, u);
    };
    if (remind) {
      // Everyone left, over a few seconds.
      const step = Math.min(600, 3200 / Math.max(1, readers.length));
      readers.forEach((u, i) => later(900 + i * step, () => ack(u)));
      return;
    }
    // In small batches (2 or 3), 1.2 s apart.
    let at = 1200;
    for (let i = 0; i < readers.length;) {
      const size = 2 + (hash(`${broadcastId}:${i}`) % 2);
      const batch = readers.slice(i, i + size);
      batch.forEach((u, j) => later(at + j * 180, () => ack(u)));
      i += size;
      at += 1200;
    }
  };

  /* ---- (d) moves: the people sent accept a few seconds apart ---- */

  const onDecide = (requestId: string) => {
    const req = opLive(gid)?.requests.find((x) => x.id === requestId);
    if (!req || req.status !== "approved") return;
    const live = liveSet();
    const people = (req.people ?? Object.keys(req.accepts)).filter((u) => req.accepts[u] === "pending" && !live.has(u));
    people.forEach((u, i) => later(2600 + i * 1700, () => {
      if (!leader() || liveSet().has(u)) return;
      if (opLive(gid)?.requests.find((x) => x.id === requestId)?.accepts[u] !== "pending") return;
      get().act.answer(requestId, true, u);
    }));
  };

  /* ---- (e) the venue, every 45-70 s: a move between zones, or a lead short of something ---- */

  const ambient = () => {
    later(45_000 + Math.random() * 25_000, ambient);
    if (!leader() || asleep()) return;
    const r = ready();
    if (!r) return;
    const live = liveSet();
    if (Math.random() < 0.25 && askForSupplies(r.a, r.info, r.l, live)) return;
    if (!moveSomeone(r.a, r.info, r.l, live, later)) askForSupplies(r.a, r.info, r.l, live);
  };

  const off = onOpAction((groupId: string, action: OpAction) => {
    if (groupId !== gid) return;
    const key = actionKey(action);
    if (!key || handled.has(key)) return;
    handled.add(key);
    if (action.t === "radio.release") onRelease(action.id);
    else if (action.t === "broadcast.add") onBroadcast(action.broadcast.id, action.broadcast.by, false);
    else if (action.t === "broadcast.remind") onBroadcast(action.id, action.by, true);
    else if (action.t === "request.decide" && action.approve) onDecide(action.id);
  });

  later(3000 + Math.random() * 2000, chatter);
  later(45_000 + Math.random() * 25_000, ambient);

  // The tab is going away (React won't clean up): whatever it was saying goes out whole now.
  const onPageHide = () => {
    for (const [id, text] of speaking) get().act.release(id, text, "sim");
    speaking.clear();
  };
  window.addEventListener("pagehide", onPageHide);

  return () => {
    off();
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
    timers.forEach(clearTimeout);
    timers.clear();
    // Whatever this tab was saying goes out whole.
    for (const [id, text] of speaking) get().act.release(id, text, "sim");
    speaking.clear();
  };
}

function actionKey(a: OpAction): string | null {
  switch (a.t) {
    case "radio.release": return `release:${a.id}`;
    case "broadcast.add": return `broadcast:${a.broadcast.id}`;
    case "broadcast.remind": return `remind:${a.feedId}`;
    case "request.decide": return `decide:${a.id}`;
    default: return null;
  }
}

/* ---------------------------------------------------------------------------
   Who says what
--------------------------------------------------------------------------- */

/** The zone lead (a zone channel), another Command person (Command), or another listener (a crew). */
function replier(info: GroupInfo, l: OpLive, members: string[], speaker: string, channel: string, live: Set<string>, seed: string) {
  const op = info.operation;
  if (!op) return null;
  const free = (u: string) => u !== speaker && members.includes(u) && !live.has(u);
  if (channel.startsWith("zone:")) {
    const lead = zoneById(op, channel.slice(5))?.leadId;
    if (lead && free(lead)) return lead;
  }
  const pool = (channel === "command" ? members.filter((u) => isCommand(info, u)) : listeners(info, l, members, channel))
    .filter(free)
    .sort();
  return pool.length ? pool[hash(seed) % pool.length] : null;
}

/** For an Operation without a script: lines from its own zones, crews and Command. */
function generatedLines(info: GroupInfo, l: OpLive, members: string[]): Line[] {
  const op = info.operation;
  if (!op) return [];
  const out: Line[] = [];
  for (const z of op.zones) {
    const there = here(l, z.id).filter((u) => members.includes(u));
    const by = z.leadId && members.includes(z.leadId) ? z.leadId : there[0];
    if (!by) continue;
    const target = { channel: `zone:${z.id}` };
    const n = there.length;
    if (n >= z.target) out.push({ by, target, text: `${z.code}, all good here, ${n} of us.` });
    else if (n > 0) out.push({ by, target, text: `${z.code}, we're ${n} of ${z.target}. One more would help.` });
    out.push({ by, target, text: `${z.code}, quick check, everyone in position?` });
    const other = there.find((u) => u !== by);
    if (other) out.push({ by: other, target, text: `${z.code}, I'm on the door. All quiet for now.` });
  }
  for (const id of op.crews) {
    const role = info.roles.find((r) => r.id === id);
    const crew = members.filter((u) => crewOf(info, u)?.id === id);
    const by = crew.find((u) => leadsZone(op, u)) ?? crew[0];
    if (role && by) out.push({ by, target: { channel: `crew:${id}` }, text: `${role.name}, check in with your lead.` });
  }
  for (const by of members.filter((u) => isCommand(info, u))) {
    out.push({ by, target: { channel: "command" }, text: "Leads, quick status please. Anything short, tell me now." });
  }
  return out;
}

/**
 * Someone checks in to another zone of their crew. Never a lead, Command or a
 * demo person. Preferably two of a crew swap posts, so every zone keeps its
 * numbers (the demo's 7/5 and 2/5 are for you to fix); otherwise one person
 * moves, only from a zone with people to spare and never into a short one.
 */
function moveSomeone(a: OperationApi, info: GroupInfo, l: OpLive, live: Set<string>, later: (ms: number, fn: () => void) => void) {
  const op = info.operation;
  if (!op) return false;
  const demo = a.group?.id === EWC_ID ? DEMO_PEOPLE : new Set<string>();
  const open = (zoneId: string) => zoneStatus(l, zoneId) !== "closed";
  const people = a.members
    .filter((u) => !live.has(u) && !demo.has(u) && !isCommand(info, u) && !leadsZone(op, u) && l.presence[u]?.zoneId)
    .map((u) => ({ u, zone: zoneById(op, l.presence[u].zoneId), crew: crewOf(info, u)?.id }))
    .filter((x) => x.zone && x.crew && open(x.zone.id))
    .sort(() => Math.random() - 0.5);
  const via = () => (Math.random() < 0.4 ? "qr" : "tap") as "qr" | "tap";

  // A swap: two of the same crew, in two zones both of them work.
  for (const x of people) {
    const y = people.find((o) => o.crew === x.crew && o.zone!.id !== x.zone!.id && x.zone!.crews.includes(o.crew!) && o.zone!.crews.includes(x.crew!));
    if (!y) continue;
    a.act.checkIn(y.zone!.id, via(), x.u);
    later(1400, () => a.act.checkIn(x.zone!.id, via(), y.u));
    return true;
  }

  // One move, from spare to a zone that isn't short.
  for (const x of people) {
    const st = staffing(l, x.zone!);
    if (st.n <= st.target) continue;
    const to = op.zones.filter((z) => {
      if (z.id === x.zone!.id || !z.crews.includes(x.crew!) || !open(z.id)) return false;
      const s = staffing(l, z);
      return s.n >= s.target;
    });
    if (!to.length) continue;
    a.act.checkIn(to[Math.floor(Math.random() * to.length)].id, via(), x.u);
    return true;
  }
  return false;
}

/** A lead asks for something small. At most one waiting per zone, three across the Operation. */
function askForSupplies(a: OperationApi, info: GroupInfo, l: OpLive, live: Set<string>) {
  const op = info.operation;
  if (!op) return false;
  const waiting = l.requests.filter((r) => r.kind === "supplies" && r.status === "pending");
  if (waiting.length >= 3) return false;
  const zones = op.zones.filter((z) =>
    z.leadId && a.members.includes(z.leadId) && !live.has(z.leadId) && zoneStatus(l, z.id) !== "closed" && !waiting.some((r) => r.zoneId === z.id));
  if (!zones.length) return false;
  const z = zones[Math.floor(Math.random() * zones.length)];
  a.act.raiseRequest({ kind: "supplies", zoneId: z.id, note: SUPPLIES[Math.floor(Math.random() * SUPPLIES.length)], urgency: "normal" }, z.leadId!);
  return true;
}
