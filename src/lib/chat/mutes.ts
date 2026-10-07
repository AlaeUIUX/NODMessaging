"use client";

import { useCallback, useEffect, useState } from "react";
import type { Chat } from "./types";

/**
 * Muting, kept simple: per chat (a DM, a group, or one channel), what still
 * notifies you (everything, only @mentions, or nothing), whether calls ring,
 * and for how long. A channel follows its group unless it has its own rule,
 * so "mute the group but keep #announcements" is one rule on each.
 *
 * Stored per person (nod.mutes.<me>); the old on/off list is read once.
 */

export type MessagesSetting = "all" | "mentions" | "none";

export interface MuteRule {
  /** Which messages still notify: all of them, only @mentions, or none. */
  messages: MessagesSetting;
  /** Calls don't ring. */
  calls: boolean;
  /** When it ends (ms); null until you change it. */
  until: number | null;
}

export type MuteFor = "1h" | "8h" | "tomorrow" | "week" | "always";
export const MUTE_FOR: { id: MuteFor; label: string }[] = [
  { id: "1h", label: "1 hour" },
  { id: "8h", label: "8 hours" },
  { id: "tomorrow", label: "Until tomorrow" },
  { id: "week", label: "1 week" },
  { id: "always", label: "Until I change it" },
];

export function untilFor(f: MuteFor, now = Date.now()): number | null {
  if (f === "1h") return now + 3_600_000;
  if (f === "8h") return now + 8 * 3_600_000;
  if (f === "week") return now + 7 * 86_400_000;
  if (f === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.getTime();
  }
  return null;
}

const key = (me: string) => `nod.mutes.${me}`;
const oldKey = (me: string) => `nod.chat.muted.${me}`;
export const MUTED_EVENT = "nod:muted";

export function readMutes(me: string): Record<string, MuteRule> {
  try {
    const raw = localStorage.getItem(key(me));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, MuteRule>;
    }
    // Before rules: a plain list of muted chats, each fully quiet.
    const old: unknown = JSON.parse(localStorage.getItem(oldKey(me)) ?? "[]");
    if (Array.isArray(old)) return Object.fromEntries(old.filter((x): x is string => typeof x === "string").map((id) => [id, { messages: "none", calls: true, until: null }]));
  } catch { /* storage blocked */ }
  return {};
}

export function writeMutes(me: string, rules: Record<string, MuteRule>) {
  try { localStorage.setItem(key(me), JSON.stringify(rules)); } catch { /* private mode */ }
  // Every view that shows a mute (the inbox, a chat, settings) reads it again.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MUTED_EVENT));
}

/** Set (or with null, clear) one chat's rule. */
export function setMute(me: string, chatId: string, rule: MuteRule | null) {
  const rules = { ...readMutes(me) };
  if (rule) rules[chatId] = rule; else delete rules[chatId];
  writeMutes(me, rules);
}

/** A chat's own rule, if it hasn't run out. */
export function ruleFor(rules: Record<string, MuteRule>, chatId: string, now: number): MuteRule | null {
  const r = rules[chatId];
  return r && (r.until === null || r.until > now) ? r : null;
}

/** What applies to a chat: its own rule, else (for a channel) its group's. */
export function effectiveRule(rules: Record<string, MuteRule>, chat: Chat, now: number): MuteRule | null {
  return ruleFor(rules, chat.id, now) ?? (chat.groupId ? ruleFor(rules, chat.groupId, now) : null);
}

/** Messages are quieter than usual (only mentions, or nothing). */
export const isQuiet = (r: MuteRule | null) => !!r && r.messages !== "all";

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
function untilText(r: MuteRule, now: number) {
  if (r.until === null) return "";
  const d = new Date(r.until);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return ` until ${clock(r.until)}`;
  const tomorrow = new Date(now + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return ` until tomorrow, ${clock(r.until)}`;
  return ` until ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`;
}

/** In a few words: "Muted until 18:00", "Only @mentions", "Calls muted", "On". */
export function describe(r: MuteRule | null, now: number) {
  if (!r) return "On";
  const what = r.messages === "none" ? "Muted" : r.messages === "mentions" ? "Only @mentions" : r.calls ? "Calls muted" : "On";
  return `${what}${r.messages === "all" && !r.calls ? "" : untilText(r, now)}`;
}

/** Everyone's rules for one person, kept in step across views and tabs. */
export function useMutes(me: string) {
  const [rules, setRules] = useState<Record<string, MuteRule>>({});
  useEffect(() => {
    const read = () => setRules(readMutes(me));
    read();
    window.addEventListener(MUTED_EVENT, read);
    const onStorage = (e: StorageEvent) => { if (e.key === key(me)) read(); };
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(MUTED_EVENT, read); window.removeEventListener("storage", onStorage); };
  }, [me]);
  const set = useCallback((chatId: string, rule: MuteRule | null) => setMute(me, chatId, rule), [me]);
  return { rules, set };
}

/** The one-tap mute (an inbox swipe, a bell): quiet except for @mentions, until changed. DMs go fully quiet. */
export const QUICK_MUTE = (dm: boolean): MuteRule => ({ messages: dm ? "none" : "mentions", calls: false, until: null });
