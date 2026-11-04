import type { Message } from "./types";

/**
 * Pinned messages, the way WhatsApp does them: up to three a chat, shown in a
 * bar under the header, each for a while (24 hours, 7 days or 30 days). A
 * fourth pin takes the oldest one's place.
 */

export const PIN_LIMIT = 3;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const PIN_FOR = [
  { id: "1d", label: "24 hours", ms: DAY },
  { id: "7d", label: "7 days", ms: 7 * DAY },
  { id: "30d", label: "30 days", ms: 30 * DAY },
] as const;
export type PinFor = (typeof PIN_FOR)[number]["id"];
export const PIN_FOR_DEFAULT: PinFor = "7d";
export const pinMs = (id: PinFor) => PIN_FOR.find((f) => f.id === id)!.ms;

/** Pinned and not run out. Pins made before pins ran out (no `pin`) last until unpinned. */
export const isPinned = (m: Message, now = Date.now()) => m.pinned && !m.deletedAt && (!m.pin || m.pin.until > now);

/** When it was pinned: those older pins count from the message itself. */
export const pinnedAt = (m: Message) => m.pin?.at ?? m.createdAt;

/** A chat's pins, newest pin first: the order the bar steps through them. */
export const activePins = (messages: Message[], now = Date.now()) =>
  messages.filter((m) => isPinned(m, now)).sort((a, b) => pinnedAt(b) - pinnedAt(a));

/** "6 days left", "5 hours left", "Under an hour left"; nothing for a pin that never runs out. */
export function pinLeft(m: Message, now = Date.now()) {
  if (!m.pin) return "";
  const left = m.pin.until - now;
  if (left >= DAY) { const d = Math.round(left / DAY); return `${d} ${d === 1 ? "day" : "days"} left`; }
  if (left >= HOUR) { const h = Math.round(left / HOUR); return `${h} ${h === 1 ? "hour" : "hours"} left`; }
  return "Under an hour left";
}
