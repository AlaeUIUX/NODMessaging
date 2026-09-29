"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Accounts signed in on this device (a browser, here), and each person's
 * own preferences. Both live in localStorage: accounts belong to the device,
 * preferences travel with the person — other tabs read them too, which is how
 * "hide my online status" or "no read receipts" reach the people you talk to.
 */

const ACCOUNTS_KEY = "nod.accounts";
const PREFS_KEY = (id: string) => `nod.settings.${id}`;

const listeners = new Set<() => void>();
let watching = false;
function subscribe(l: () => void) {
  listeners.add(l);
  if (!watching && typeof window !== "undefined") {
    watching = true;
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === ACCOUNTS_KEY || e.key.startsWith("nod.settings.")) { cache.clear(); listeners.forEach((x) => x()); }
    });
  }
  return () => { listeners.delete(l); };
}
const notify = () => { cache.clear(); listeners.forEach((l) => l()); };

/** Parsed values, keyed by storage key, so snapshots stay referentially stable between changes. */
const cache = new Map<string, { raw: string | null; value: unknown }>();
function readJson<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* storage blocked */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  try { if (raw) value = JSON.parse(raw); } catch { /* keep fallback */ }
  cache.set(key, { raw, value });
  return value;
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
  notify();
}

/* ---------------------------------------------------------------------------
   Accounts
--------------------------------------------------------------------------- */

const EMPTY: string[] = [];
export const accountIds = (): string[] => readJson<string[]>(ACCOUNTS_KEY, EMPTY);

/**
 * People who used the demo before accounts existed are already "signed in":
 * keep them in, rather than sending them through onboarding.
 */
export function initAccounts(currentMe: string | null) {
  try {
    if (localStorage.getItem(ACCOUNTS_KEY) !== null) return;
    if (localStorage.getItem("nod.chat.state") !== null) writeJson(ACCOUNTS_KEY, [currentMe || "me"]);
  } catch { /* storage blocked */ }
}
export function addAccount(id: string) {
  const ids = accountIds();
  if (!ids.includes(id)) writeJson(ACCOUNTS_KEY, [...ids, id]);
}
export function removeAccount(id: string) {
  writeJson(ACCOUNTS_KEY, accountIds().filter((x) => x !== id));
}
/** Null until mounted (the server can't know who's signed in). */
export function useAccounts(): string[] | null {
  return useSyncExternalStore(subscribe, accountIds, () => null);
}

/* ---------------------------------------------------------------------------
   Preferences
--------------------------------------------------------------------------- */

export interface Prefs {
  /** Whether others see you online. */
  lastSeen: "everyone" | "nobody";
  /** Whether people see when you've read their messages. */
  readReceipts: boolean;
  /** Whether people see you typing. */
  typing: boolean;
  /** Who can add you to a Space. */
  spaceInvites: "everyone" | "nobody";
  notifyReminders: boolean;
  notifyPlans: boolean;
  notifyTasks: boolean;
  /** Banners show what the reminder or task says; off, they just say something's due. */
  previews: boolean;
  /** Return sends on a keyboard (Shift+Return for a new line); off, Return is a new line. */
  enterToSend: boolean;
  language: string;
  /** Phone numbers you've invited. */
  invited: string[];
}

export const DEFAULT_PREFS: Prefs = {
  lastSeen: "everyone",
  readReceipts: true,
  typing: true,
  spaceInvites: "everyone",
  notifyReminders: true,
  notifyPlans: true,
  notifyTasks: true,
  previews: true,
  enterToSend: true,
  language: "en",
  invited: [],
};

const prefsCache = new Map<string, { base: unknown; merged: Prefs }>();
export function getPrefs(id: string): Prefs {
  const stored = readJson<Partial<Prefs> | null>(PREFS_KEY(id), null);
  const hit = prefsCache.get(id);
  if (hit && hit.base === stored) return hit.merged;
  const merged = { ...DEFAULT_PREFS, ...(stored ?? {}) };
  prefsCache.set(id, { base: stored, merged });
  return merged;
}
export function setPrefs(id: string, patch: Partial<Prefs>) {
  writeJson(PREFS_KEY(id), { ...getPrefs(id), ...patch });
}
export function usePrefs(id: string) {
  const prefs = useSyncExternalStore(subscribe, () => getPrefs(id), () => DEFAULT_PREFS);
  const set = useCallback((patch: Partial<Prefs>) => setPrefs(id, patch), [id]);
  return [prefs, set] as const;
}

export const LANGUAGES = [
  { id: "en", name: "English", native: "English" },
  { id: "de", name: "German", native: "Deutsch" },
  { id: "fr", name: "French", native: "Français" },
  { id: "es", name: "Spanish", native: "Español" },
  { id: "it", name: "Italian", native: "Italiano" },
  { id: "ar", name: "Arabic", native: "العربية" },
];

/* ---------------------------------------------------------------------------
   Appearance: the page owns the theme; Settings asks it to change.
--------------------------------------------------------------------------- */

export type ThemePref = "light" | "dark" | "system";
export const THEME_EVENT = "nod:theme";
export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem("nod.theme");
    return v === "dark" || v === "system" ? v : "light";
  } catch { return "light"; }
}
export function requestTheme(t: ThemePref) {
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: t }));
}

/* ---------------------------------------------------------------------------
   Starting over
--------------------------------------------------------------------------- */

/** Everything NOD keeps in this browser (chats, Mind, people, accounts, settings, answers to permission prompts), then a reload. */
export async function resetDemoData() {
  const { clearMedia } = await import("./media");
  try {
    Object.keys(localStorage)
      .filter((k) => /^nod\.(chat|perm|mind|people|accounts|settings)/.test(k))
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem("nod.chat.me");
  } catch { /* private mode */ }
  await clearMedia();
  location.reload();
}
