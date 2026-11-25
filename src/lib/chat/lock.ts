"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the demo phone is locked (Developer › Lock the phone). While it is,
 * the app is "closed": anything that would show an in-app banner lands on the
 * lock screen as a notification instead, the way a push does. Not kept: a
 * reload unlocks.
 */

let locked = false;
const subscribers = new Set<() => void>();

export function setLocked(value: boolean) {
  if (locked === value) return;
  locked = value;
  subscribers.forEach((fn) => fn());
}

export const isLocked = () => locked;

export function useLocked() {
  return useSyncExternalStore(
    (fn) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    () => locked,
    () => false,
  );
}
