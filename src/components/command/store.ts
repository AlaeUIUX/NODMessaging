"use client";

import { useSyncExternalStore } from "react";
import {
  audienceOf, id, PEOPLE, person, seed, staffing, zoneOf,
  type Audience, type Broadcast, type FeedEvent, type OpRequest, type OpState, type Presence, type Priority, type Step, type Task, type ZoneStatus,
} from "./data";
import { replyFor, SCRIPT, seedRadio, type ChannelId, type Target, type Transmission } from "./radio";

/**
 * One Operation, held in localStorage so a second window (?as=salman) sees
 * the same thing live. Everything happens on this device: other people's
 * answers are faked with `later()`, the way the chat demo fakes replies.
 */

const KEY = "nod.command.v2";
let state: OpState | null = null;
const listeners = new Set<() => void>();

function fresh(now: number): OpState {
  const base = seed(now);
  return { ...base, radio: seedRadio(base, now) };
}

function read(): OpState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OpState;
      if (parsed.version === 2 && parsed.radio) return parsed;
    }
  } catch { /* private mode, bad JSON */ }
  return fresh(Date.now());
}

function emit() { listeners.forEach((l) => l()); }

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = e.newValue ? (JSON.parse(e.newValue) as OpState) : fresh(Date.now());
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}
function snapshot() {
  if (!state) state = read();
  return state;
}

export function useOp(): OpState | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

function commit(fn: (s: OpState) => OpState) {
  state = fn(snapshot());
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* full */ }
  emit();
}
const feed = (s: OpState, e: FeedEvent): FeedEvent[] => [...s.feed, e].slice(-300);

/* ---- who is being looked at right now: they answer for themselves, not the simulation ---- */

const live = new Map<string, number>();
export function watch(userId: string) {
  live.set(userId, (live.get(userId) ?? 0) + 1);
  return () => { const n = (live.get(userId) ?? 1) - 1; if (n) live.set(userId, n); else live.delete(userId); };
}
const later = (ms: number, fn: () => void) => { setTimeout(fn, ms); };

/* ---- presence ---- */

export function checkIn(userId: string, zoneId: string, via: Presence["via"] = "tap") {
  const now = Date.now();
  commit((s) => {
    const prev = s.presence[userId]?.zoneId ?? null;
    if (prev === zoneId) return s;
    const ev: FeedEvent = prev
      ? { id: id("f"), at: now, kind: "move", userId, fromZoneId: prev, zoneId }
      : { id: id("f"), at: now, kind: "checkin", userId, zoneId, via };
    return followZone({ ...s, presence: { ...s.presence, [userId]: { zoneId, since: now, via } }, feed: feed(s, ev) }, userId, prev, zoneId);
  });
}
export function checkOut(userId: string) {
  const now = Date.now();
  commit((s) => {
    const prev = s.presence[userId]?.zoneId;
    if (!prev) return s;
    return {
      ...s,
      presence: { ...s.presence, [userId]: { zoneId: null, since: now, via: "tap" } },
      feed: feed(s, { id: id("f"), at: now, kind: "checkout", userId, zoneId: prev }),
    };
  });
}

/* ---- requests ---- */

export function raiseRequest(r: Omit<OpRequest, "id" | "at" | "status" | "accepts" | "sending">) {
  const now = Date.now();
  const rid = id("r");
  commit((s) => ({
    ...s,
    requests: [...s.requests, { ...r, id: rid, at: now, status: "pending", accepts: {}, sending: true }],
    chat: [...s.chat, { id: id("m"), zoneId: r.zoneId, by: r.by, at: now, requestId: rid }],
    feed: feed(s, { id: id("f"), at: now, kind: "request", requestId: rid, by: r.by }),
    zones: r.kind === "issue" ? s.zones.map((z) => (z.id === r.zoneId && z.status === "ok" ? { ...z, status: "busy" } : z)) : s.zones,
  }));
  // Venue signal: queued, then it lands.
  later(1400, () => commit((s) => ({ ...s, requests: s.requests.map((x) => (x.id === rid ? { ...x, sending: false } : x)) })));
  return rid;
}

export function decide(requestId: string, approve: boolean, by: string, people?: string[]) {
  const now = Date.now();
  let moved: string[] = [];
  commit((s) => {
    const r = s.requests.find((x) => x.id === requestId);
    if (!r || r.status !== "pending") return s;
    const movesPeople = approve && (r.kind === "staff" || r.kind === "move");
    const who = movesPeople ? (people ?? r.people ?? []) : [];
    moved = who;
    const next: OpRequest = {
      ...r,
      status: approve ? "approved" : "declined",
      decidedBy: by,
      decidedAt: now,
      people: who.length ? who : r.people,
      accepts: Object.fromEntries(who.map((u) => [u, "pending" as const])),
    };
    return {
      ...s,
      requests: s.requests.map((x) => (x.id === requestId ? next : x)),
      feed: feed(s, { id: id("f"), at: now, kind: "decision", requestId, by, approved: approve }),
    };
  });
  // Everyone not on a screen right now answers on their own, a few seconds apart.
  moved.filter((u) => !live.has(u)).forEach((u, i) => later(2600 + i * 1700, () => answerMove(requestId, u, true)));
}

export function answerMove(requestId: string, userId: string, accept: boolean) {
  const now = Date.now();
  commit((s) => {
    const r = s.requests.find((x) => x.id === requestId);
    if (!r || r.accepts[userId] !== "pending") return s;
    const accepts = { ...r.accepts, [userId]: accept ? ("accepted" as const) : ("declined" as const) };
    const allIn = Object.values(accepts).every((a) => a !== "pending");
    const prev = s.presence[userId]?.zoneId ?? null;
    let next: OpState = {
      ...s,
      requests: s.requests.map((x) => (x.id === requestId ? { ...x, accepts, status: allIn ? "done" : x.status } : x)),
    };
    if (accept) {
      next = {
        ...next,
        presence: { ...next.presence, [userId]: { zoneId: r.zoneId, since: now, via: "assigned" } },
        radio: followZone(next, userId, prev, r.zoneId).radio,
        feed: feed(next, { id: id("f"), at: now, kind: "move", userId, fromZoneId: prev, zoneId: r.zoneId }),
      };
      // Staffed again: a busy zone settles back to OK.
      const z = zoneOf(next, r.zoneId);
      if (z && z.status === "busy" && staffing(next, z).level !== "short" && staffing(next, z).level !== "critical") {
        next = { ...next, zones: next.zones.map((x) => (x.id === z.id ? { ...x, status: "ok" } : x)) };
      }
    }
    return next;
  });
}

export function markDone(requestId: string, by: string) {
  const now = Date.now();
  commit((s) => {
    const r = s.requests.find((x) => x.id === requestId);
    if (!r) return s;
    const zones = r.kind === "issue" ? s.zones.map((z) => (z.id === r.zoneId && z.status === "issue" ? { ...z, status: "ok" as ZoneStatus } : z)) : s.zones;
    return {
      ...s,
      zones,
      requests: s.requests.map((x) => (x.id === requestId ? { ...x, status: "done", decidedBy: x.decidedBy ?? by, decidedAt: x.decidedAt ?? now } : x)),
      feed: r.kind === "issue" ? feed(s, { id: id("f"), at: now, kind: "zone", zoneId: r.zoneId, status: "ok", by }) : s.feed,
    };
  });
}

/* ---- zones ---- */

export function setZoneStatus(zoneId: string, status: ZoneStatus, by: string) {
  const now = Date.now();
  commit((s) => ({
    ...s,
    zones: s.zones.map((z) => (z.id === zoneId ? { ...z, status } : z)),
    feed: feed(s, { id: id("f"), at: now, kind: "zone", zoneId, status, by }),
  }));
}

/** Command or a lead sends someone: a one-person move request they accept. */
export function assign(userId: string, zoneId: string, by: string) {
  const s = snapshot();
  const from = s.presence[userId]?.zoneId ?? undefined;
  const rid = raiseRequest({ kind: "move", zoneId, fromZoneId: from, count: 1, people: [userId], note: `${person(by).name.split(" ")[0]} asks you to come to this zone.`, urgency: "normal", by });
  decide(rid, true, by, [userId]);
}

/* ---- tasks ---- */

export function addTask(t: { title: string; zoneId: string; priority: Priority; assignee?: string; dueMin: number }, by: string) {
  const now = Date.now();
  const task: Task = { id: id("t"), title: t.title, zoneId: t.zoneId, priority: t.priority, assignee: t.assignee, step: "todo", due: now + t.dueMin * 60_000 };
  commit((s) => ({ ...s, tasks: [task, ...s.tasks] }));
  void by;
}
const STEPS: Step[] = ["todo", "doing", "done"];
export function stepTask(taskId: string, dir: 1 | -1, by: string) {
  const now = Date.now();
  commit((s) => {
    const t = s.tasks.find((x) => x.id === taskId);
    if (!t) return s;
    const step = STEPS[Math.max(0, Math.min(2, STEPS.indexOf(t.step) + dir))];
    if (step === t.step) return s;
    return {
      ...s,
      tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, step, doneAt: step === "done" ? now : undefined } : x)),
      feed: step === "done" ? feed(s, { id: id("f"), at: now, kind: "task", taskId, by }) : s.feed,
    };
  });
}

/* ---- broadcasts ---- */

function simulateReads(bid: string, share: number, startMs: number) {
  const s = snapshot();
  const b = s.broadcasts.find((x) => x.id === bid);
  if (!b) return;
  const waiting = audienceOf(s, b.audience).filter((u) => !b.acks[u] && !live.has(u));
  const take = Math.round(waiting.length * share);
  waiting.slice(0, take).forEach((u, i) => later(startMs + i * 650 + (i % 3) * 300, () => ack(bid, u)));
}

export function sendBroadcast(text: string, level: Broadcast["level"], audience: Audience, by: string) {
  const now = Date.now();
  const bid = id("b");
  commit((s) => ({
    ...s,
    broadcasts: [...s.broadcasts, { id: bid, level, text, audience, by, at: now, acks: { [by]: now } }],
    feed: feed(s, { id: id("f"), at: now, kind: "broadcast", broadcastId: bid }),
  }));
  // Most read it within seconds; a few don't until reminded.
  simulateReads(bid, level === "critical" ? 0.82 : 0.6, 1200);
  return bid;
}
export function ack(broadcastId: string, userId: string) {
  const now = Date.now();
  commit((s) => ({
    ...s,
    broadcasts: s.broadcasts.map((b) => (b.id === broadcastId && !b.acks[userId] ? { ...b, acks: { ...b.acks, [userId]: now } } : b)),
  }));
}
export function remind(broadcastId: string, by: string) {
  const now = Date.now();
  const s = snapshot();
  const b = s.broadcasts.find((x) => x.id === broadcastId);
  if (!b) return 0;
  const count = audienceOf(s, b.audience).filter((u) => !b.acks[u]).length;
  commit((x) => ({
    ...x,
    broadcasts: x.broadcasts.map((y) => (y.id === broadcastId ? { ...y, reminded: now } : y)),
    feed: feed(x, { id: id("f"), at: now, kind: "remind", broadcastId, by, count }),
  }));
  simulateReads(broadcastId, 1, 900);
  return count;
}

/* ---- the rest ---- */

export function postChat(zoneId: string, by: string, text: string) {
  const now = Date.now();
  commit((s) => ({ ...s, chat: [...s.chat, { id: id("m"), zoneId, by, at: now, text }] }));
}
export function setMuted(userId: string, muted: boolean) {
  commit((s) => ({ ...s, muted: { ...s.muted, [userId]: muted } }));
}
export function setShift(shift: OpState["shift"]) {
  commit((s) => ({ ...s, shift }));
}
export function resetDemo() {
  commit(() => fresh(Date.now()));
}

export const everyoneCount = PEOPLE.length;
export const audienceSize = (s: OpState, b: Broadcast) => audienceOf(s, b.audience).length;
export { audienceOf };

/* ---- radio ---- */

/** Someone tuned to their zone's channel follows them to the next zone. */
function followZone(s: OpState, userId: string, from: string | null, to: string): OpState {
  const j = s.radio.joined[userId];
  if (j && j !== `zone:${from}`) return s;
  return { ...s, radio: { ...s.radio, joined: { ...s.radio.joined, [userId]: `zone:${to}` } } };
}

const radio = (s: OpState, patch: Partial<OpState["radio"]>): OpState => ({ ...s, radio: { ...s.radio, ...patch } });

export function tune(userId: string, channel: ChannelId) {
  commit((s) => radio(s, { joined: { ...s.radio.joined, [userId]: channel } }));
}
export function radioSeen(userId: string) {
  const now = Date.now();
  commit((s) => radio(s, { seen: { ...s.radio.seen, [userId]: now } }));
}

/** Keys up: a live transmission whose words arrive as they're spoken. */
export function keyUp(by: string, target: Target, source: Transmission["source"] = "voice") {
  const now = Date.now();
  const tid = id("x");
  commit((s) => radio(s, { tx: [...s.radio.tx, { id: tid, by, at: now, target, text: "", live: true, source }].slice(-200) }));
  return tid;
}
export function onAir(txId: string, text: string) {
  commit((s) => radio(s, { tx: s.radio.tx.map((t) => (t.id === txId ? { ...t, text } : t)) }));
}
export function keyDown(txId: string, text: string) {
  const now = Date.now();
  let done: Transmission | undefined;
  commit((s) => {
    const tx = s.radio.tx
      .map((t) => (t.id === txId ? { ...t, text: text.trim(), live: false, endedAt: now } : t))
      // Keyed and released without a word: nothing went out.
      .filter((t) => t.id !== txId || t.text);
    done = tx.find((t) => t.id === txId);
    return radio(s, { tx });
  });
  // Someone on the channel answers, the way people do on a radio.
  if (done) {
    const r = replyFor(snapshot(), done.target.channel, done.by);
    if (r && !live.has(r.by)) later(2200, () => speak(r.by, { channel: done!.target.channel }, r.text));
  }
}

/** Someone else talks: the words stream in over a couple of seconds. */
export function speak(by: string, target: Target, text: string) {
  const txId = keyUp(by, target, "sim");
  const words = text.split(" ");
  words.forEach((_, i) => later(160 + i * 210, () => onAir(txId, words.slice(0, i + 1).join(" "))));
  later(400 + words.length * 210, () => keyDown(txId, text));
}

/** The venue's chatter, while the showcase is open (one window runs it). */
let chatter: ReturnType<typeof setTimeout> | null = null;
export function startChatter() {
  if (chatter) return () => {};
  const tick = () => {
    const s = snapshot();
    const line = SCRIPT[Math.floor(Math.random() * SCRIPT.length)];
    // Several channels can be busy at once; one channel carries one voice at a time.
    const busy = s.radio.tx.some((t) => t.live && (t.by === line.by || t.target.channel === line.target.channel));
    if (!busy && !live.has(line.by)) speak(line.by, line.target, line.text);
    chatter = setTimeout(tick, 3500 + Math.random() * 4000);
  };
  chatter = setTimeout(tick, 2500);
  return () => { if (chatter) clearTimeout(chatter); chatter = null; };
}
