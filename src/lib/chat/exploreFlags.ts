"use client";

import { useSyncExternalStore } from "react";

/**
 * What one person has told Explore: the people they follow, and the topics
 * they picked the first time they came (null until they've been asked). It's
 * theirs alone, so it lives in this browser, read by every screen and tab.
 *
 * Also the hand-off from Mind: "Related on Explore" asks for a collection,
 * the tab bar switches to Explore, and Explore opens it.
 */

export interface ExploreFlags {
  follows: string[];
  /** Topics picked on the first visit; null: not asked yet; [] : skipped. */
  topics: string[] | null;
}

const EMPTY: ExploreFlags = { follows: [], topics: null };
const keyOf = (userId: string) => `nod.explore.${userId}`;

function load(userId: string): ExploreFlags {
  try {
    const raw = localStorage.getItem(keyOf(userId));
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<ExploreFlags>;
    return {
      follows: Array.isArray(v.follows) ? v.follows.filter((x): x is string => typeof x === "string") : [],
      topics: Array.isArray(v.topics) ? v.topics.filter((x): x is string => typeof x === "string") : null,
    };
  } catch { return EMPTY; }
}

const cache = new Map<string, ExploreFlags>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const read = (userId: string) => {
  let f = cache.get(userId);
  if (!f) { f = load(userId); cache.set(userId, f); }
  return f;
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (!e.key?.startsWith("nod.explore.")) return;
    cache.clear();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function useExploreFlags(userId: string): ExploreFlags {
  return useSyncExternalStore(subscribe, () => read(userId), () => EMPTY);
}

export function updateExploreFlags(userId: string, fn: (f: ExploreFlags) => ExploreFlags) {
  const next = fn(read(userId));
  try { localStorage.setItem(keyOf(userId), JSON.stringify(next)); } catch { /* private mode: lasts this visit */ }
  cache.set(userId, next);
  notify();
}

export const toggleFollow = (userId: string, who: string) =>
  updateExploreFlags(userId, (f) => ({ ...f, follows: f.follows.includes(who) ? f.follows.filter((x) => x !== who) : [...f.follows, who] }));

/* ---- Mind asks Explore to open a collection ---- */

export const OPEN_EXPLORE = "nod:open-explore";
let pending: string | null = null;
/** Opens Explore (the tab bar listens) on this public collection. */
export function openOnExplore(collectionId: string) {
  pending = collectionId;
  window.dispatchEvent(new CustomEvent(OPEN_EXPLORE, { detail: collectionId }));
}
/** The collection asked for, once: Explore takes it when it opens. */
export function takePendingExplore() {
  const id = pending;
  pending = null;
  return id;
}
