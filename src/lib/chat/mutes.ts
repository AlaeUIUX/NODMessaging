/**
 * Muted chats are the inbox's list (nod.chat.muted.<me>): one list, read by
 * the inbox, the contact page and group settings. Writing tells the others.
 */

const key = (me: string) => `nod.chat.muted.${me}`;
export const MUTED_EVENT = "nod:muted";

export function readMuted(me: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(me)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeMuted(me: string, ids: string[]) {
  try { localStorage.setItem(key(me), JSON.stringify(ids)); } catch { /* private mode */ }
  // The inbox keeps its own copy of the list; tell it to read the new one.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MUTED_EVENT));
}

export function setMutedChat(me: string, chatId: string, on: boolean) {
  const list = readMuted(me).filter((id) => id !== chatId);
  writeMuted(me, on ? [...list, chatId] : list);
}
