"use client";

/**
 * Personal favourites — chats and messages, per-user, per-device. Same
 * reasoning as Inbox's own pin/mute lists: this is a private choice, not
 * shared chat state, so it lives in localStorage instead of ChatState.
 */

const key = (kind: "chat" | "message", userId: string) => `nod.fav.${kind}.${userId}`;
/** Messages are stored as "chatId:messageId" so a bare id is never ambiguous. */
const messageKey = (chatId: string, messageId: string) => `${chatId}:${messageId}`;

/** So a fresh profile isn't empty for the demo — only used the very first time, before anyone has touched their own favourites. */
const DEFAULT_FAVOURITE_CHATS: Record<string, string[]> = { me: ["general", "reema"] };

function read(kind: "chat" | "message", userId: string, fallback: string[] = []): Set<string> {
  try {
    const raw = localStorage.getItem(key(kind, userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : fallback);
  } catch {
    return new Set(fallback);
  }
}
function write(kind: "chat" | "message", userId: string, ids: Set<string>) {
  try { localStorage.setItem(key(kind, userId), JSON.stringify([...ids])); } catch { /* private mode */ }
  window.dispatchEvent(new Event("nod:favourites"));
}
function toggle(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function readFavouriteChats(me: string): Set<string> {
  return read("chat", me, DEFAULT_FAVOURITE_CHATS[me] ?? []);
}
export function readFavouriteMessages(me: string): Set<string> {
  return read("message", me);
}
export function isFavouriteChat(me: string, chatId: string): boolean {
  return read("chat", me, DEFAULT_FAVOURITE_CHATS[me] ?? []).has(chatId);
}
export function isFavouriteMessage(me: string, chatId: string, messageId: string): boolean {
  return read("message", me).has(messageKey(chatId, messageId));
}
export function toggleFavouriteChat(me: string, chatId: string): Set<string> {
  const next = toggle(read("chat", me, DEFAULT_FAVOURITE_CHATS[me] ?? []), chatId);
  write("chat", me, next);
  return next;
}
export function toggleFavouriteMessage(me: string, chatId: string, messageId: string): Set<string> {
  const next = toggle(read("message", me), messageKey(chatId, messageId));
  write("message", me, next);
  return next;
}
