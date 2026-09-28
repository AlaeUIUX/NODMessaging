import type { Message } from "./types";

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A seeded message with every field filled in; pass only what differs. */
export function msg(partial: Partial<Message> & Pick<Message, "id" | "chatId" | "authorId" | "body" | "createdAt">): Message {
  return {
    clientId: partial.id,
    kind: "text",
    status: partial.authorId === "me" ? "read" : "delivered",
    reactions: [],
    replyToId: null,
    editedAt: null,
    editHistory: [],
    pinned: false,
    deletedAt: null,
    attachments: [],
    ...partial,
  };
}

/** Local midnight of the day `offsetDays` from `now`, for plan days. */
export function dayStart(now: number, offsetDays = 0) {
  const d = new Date(now + offsetDays * DAY);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
