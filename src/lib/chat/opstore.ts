"use client";

import { useSyncExternalStore } from "react";
import { emptyLive, reduceOp, type OpAction, type OpLive } from "./operation";
import { EWC_ID, ewcLive } from "./seed-ops";

/**
 * What happens live in each Operation (who is where, requests, broadcasts,
 * the radio), keyed by group id. Kept out of the chat state on purpose: it
 * changes by the second (every dictated word), and the chat state is saved
 * whole on every change.
 *
 * Every change is an OpAction (lib/chat/operation.ts). It's reduced here,
 * saved, and sent to the other tabs, which reduce it too; actions are
 * idempotent, so the order and repeats don't matter.
 */

const KEY = "nod.ops.v1";
const CHANNEL = "nod-ops";

interface Saved { version: 1; ops: Record<string, OpLive> }

let ops: Record<string, OpLive> | null = null;
const subscribers = new Set<() => void>();
const actionListeners = new Set<(groupId: string, action: OpAction, local: boolean) => void>();
let bus: BroadcastChannel | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function read(): Record<string, OpLive> {
  let out: Record<string, OpLive> = {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved) : null;
    if (parsed?.version === 1 && parsed.ops && typeof parsed.ops === "object") out = parsed.ops;
  } catch { /* private mode, bad JSON */ }
  // The demo Operation is live from the first visit.
  if (!out[EWC_ID]) out = { ...out, [EWC_ID]: ewcLive(Date.now()) };
  return settle(out);
}

/**
 * Whatever a closed tab left half done: requests still "Sending…" have
 * landed by now, and calls still on air were dropped (their words are kept).
 */
function settle(all: Record<string, OpLive>): Record<string, OpLive> {
  const now = Date.now();
  const out: Record<string, OpLive> = {};
  for (const [id, live] of Object.entries(all)) {
    const stuck = live.requests.some((r) => r.sending) || live.radio.tx.some((t) => t.live && now - t.at > 30_000);
    out[id] = !stuck ? live : {
      ...live,
      requests: live.requests.map((r) => (r.sending ? { ...r, sending: false } : r)),
      radio: {
        ...live.radio,
        tx: live.radio.tx
          .map((t) => (t.live && now - t.at > 30_000 ? { ...t, live: false, endedAt: t.at + 4000 } : t))
          .filter((t) => t.live || t.text),
      },
    };
  }
  return out;
}

/** Set by a reset: this page is about to reload, so nothing it still holds may be written back. */
let frozen = false;
/** This tab started the reset (it reloads; the others wait for its fresh save). */
let resetHere = false;

function save() {
  if (saveTimer || frozen) return;
  // Words stream in every ~200ms; one write per burst is plenty.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (frozen) return;
    try { window.localStorage.setItem(KEY, JSON.stringify({ version: 1, ops: ops ?? {} } satisfies Saved)); } catch { /* full */ }
  }, 250);
}

function ensure() {
  if (ops || typeof window === "undefined") return;
  ops = read();
  try {
    bus = new BroadcastChannel(CHANNEL);
    bus.onmessage = (e: MessageEvent<{ groupId?: string; action?: OpAction; reset?: true }>) => {
      if (e.data?.reset) { reseed(); return; }
      if (e.data?.groupId && e.data.action) apply(e.data.groupId, e.data.action, false);
    };
  } catch { bus = null; }
  // Without a BroadcastChannel, other tabs' saves are the only news: take them.
  // With one, actions already arrive one by one; a snapshot saved a moment
  // before one of ours would undo it, so only Operations this tab has never
  // seen are taken from storage.
  window.addEventListener("storage", (e) => {
    // Cleared (Reset demo data, or all storage): start again from the seed, and don't write the old state back.
    if (e.key === null || (e.key === KEY && !e.newValue)) { reseed(); return; }
    if (e.key !== KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as Saved;
      if (parsed?.version !== 1) return;
      // The tab that reset has written its fresh start: take all of it and save again.
      if (frozen && saveTimer === null && !resetHere) { ops = parsed.ops; frozen = false; emit(); return; }
      const mine = ops ?? {};
      const fresh = bus ? Object.fromEntries(Object.entries(parsed.ops).filter(([id]) => !mine[id])) : parsed.ops;
      if (Object.keys(fresh).length) { ops = { ...mine, ...fresh }; emit(); }
    } catch { /* ignore */ }
  });
}

function emit() { subscribers.forEach((fn) => fn()); }

function apply(groupId: string, action: OpAction, local: boolean) {
  ensure();
  if (!ops) return;
  // A new Operation starts empty the first time anything happens in it.
  const before = ops[groupId] ?? (action.t === "init" ? undefined : emptyLive());
  const after = reduceOp(before, action);
  if (after && after !== ops[groupId]) {
    ops = { ...ops, [groupId]: after };
    save();
    emit();
  }
  actionListeners.forEach((fn) => fn(groupId, action, local));
}

/** Applies a change here and in every other tab. Stamp ids and times before calling (in a handler). */
export function opDispatch(groupId: string, action: OpAction) {
  apply(groupId, action, true);
  try { bus?.postMessage({ groupId, action }); } catch { /* closed */ }
}

/** The current live state, for event handlers and timers (not for rendering). */
export function opLive(groupId: string): OpLive | undefined {
  ensure();
  return ops?.[groupId];
}

/** Starts an Operation's live state if it has none yet. */
export function ensureOpLive(groupId: string, make: () => OpLive = () => emptyLive()) {
  if (!opLive(groupId)) opDispatch(groupId, { t: "init", live: make() });
}

/** Every action applied in this tab (local ones and ones from other tabs), for the simulation. */
export function onOpAction(fn: (groupId: string, action: OpAction, local: boolean) => void) {
  actionListeners.add(fn);
  return () => { actionListeners.delete(fn); };
}

function subscribe(fn: () => void) {
  ensure();
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

const EMPTY: Record<string, OpLive> = {};
const snapshotAll = () => { ensure(); return ops ?? EMPTY; };

/** One Operation's live state; null until the page has mounted (the server has none). */
export function useOpLive(groupId: string | null | undefined): OpLive | null {
  const all = useSyncExternalStore(subscribe, snapshotAll, () => null);
  return all && groupId ? all[groupId] ?? null : null;
}

/** Every Operation's live state (the inbox and the notifications read them all). */
export function useAllOpLive(): Record<string, OpLive> | null {
  return useSyncExternalStore(subscribe, snapshotAll, () => null);
}

/** Another tab reset the demo: drop what this tab holds, take the seed, and stop saving until it reloads. */
function reseed() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  frozen = true;
  ops = { [EWC_ID]: ewcLive(Date.now()) };
  emit();
}

/**
 * Reset demo data: stop this tab saving (a pending write would put the old
 * state back before the reload) and tell the other tabs to do the same.
 * The caller removes the key and reloads.
 */
export function clearOps() {
  ensure();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  frozen = true;
  resetHere = true;
  try { bus?.postMessage({ reset: true }); } catch { /* closed */ }
}

/** Back to the demo's starting point (Reset demo data clears the key too). */
export function resetOps() {
  ensure();
  ops = { [EWC_ID]: ewcLive(Date.now()) };
  try { window.localStorage.setItem(KEY, JSON.stringify({ version: 1, ops: ops ?? {} } satisfies Saved)); } catch { /* full */ }
  emit();
}
