"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * What one person has done to their own chat list: pinned, archived, marked
 * unread, favourites and their own lists. It's theirs alone (nobody else
 * sees it), so it lives in this browser, one key per kind, and every screen
 * and tab reads the same copy.
 */

export interface ChatList {
  id: string;
  name: string;
  chatIds: string[];
}

export interface ChatFlags {
  pinned: string[];
  archived: string[];
  /** Marked unread by hand ("Mark as unread"); cleared once the chat is opened. */
  unread: string[];
  favourites: string[];
  lists: ChatList[];
}

type Kind = keyof ChatFlags;
const KINDS: Kind[] = ["pinned", "archived", "unread", "favourites", "lists"];

/** The Charles DM starts pinned, as it always has. */
const DEFAULTS: ChatFlags = { pinned: ["dm"], archived: [], unread: [], favourites: [], lists: [] };

const keyOf = (kind: Kind, userId: string) => `nod.chat.${kind}.${userId}`;

const isList = (v: unknown): v is ChatList =>
  !!v && typeof v === "object"
  && typeof (v as ChatList).id === "string"
  && typeof (v as ChatList).name === "string"
  && Array.isArray((v as ChatList).chatIds);

function load(userId: string): ChatFlags {
  const out = { ...DEFAULTS };
  for (const kind of KINDS) {
    try {
      const raw = localStorage.getItem(keyOf(kind, userId));
      if (raw === null) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      if (kind === "lists") out.lists = parsed.filter(isList).map((l) => ({ ...l, chatIds: l.chatIds.filter((x) => typeof x === "string") }));
      else out[kind] = parsed.filter((x): x is string => typeof x === "string");
    } catch { /* private mode or a damaged value: keep the default */ }
  }
  return out;
}

const cache = new Map<string, ChatFlags>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function read(userId: string) {
  let flags = cache.get(userId);
  if (!flags) {
    flags = load(userId);
    cache.set(userId, flags);
  }
  return flags;
}

function write(userId: string, next: ChatFlags) {
  const prev = read(userId);
  for (const kind of KINDS) {
    if (prev[kind] === next[kind]) continue;
    try { localStorage.setItem(keyOf(kind, userId), JSON.stringify(next[kind])); } catch { /* private mode */ }
  }
  cache.set(userId, next);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab signed in as the same person changed something: read it again.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || /^nod\.chat\.(pinned|archived|unread|favourites|lists)\./.test(e.key)) {
      cache.clear();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Adds or removes one id. */
export function withId(ids: string[], id: string, on: boolean) {
  const has = ids.includes(id);
  if (on === has) return ids;
  return on ? [...ids, id] : ids.filter((x) => x !== id);
}

/** Changes one person's flags from outside React (a chat opening clears its unread mark). */
export function updateChatFlags(userId: string, change: (f: ChatFlags) => ChatFlags) {
  write(userId, change(read(userId)));
}

export function clearUnreadMark(userId: string, chatId: string) {
  if (read(userId).unread.includes(chatId)) updateChatFlags(userId, (f) => ({ ...f, unread: withId(f.unread, chatId, false) }));
}

export function useChatFlags(userId: string) {
  // The server (and the first client render) use the defaults, like every other saved preference.
  const flags = useSyncExternalStore(subscribe, () => read(userId), () => DEFAULTS);
  const update = useCallback((change: (f: ChatFlags) => ChatFlags) => updateChatFlags(userId, change), [userId]);
  return { flags, update };
}
