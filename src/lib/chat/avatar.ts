import type { AvatarTone, Chat, User } from "./types";

/**
 * Muted, pigment-like tones: saturated enough to tell people apart at a
 * glance, quiet enough to sit next to a neutral UI without shouting.
 */
export const TONES: Record<AvatarTone, string> = {
  clay: "#C4573F",
  sage: "#5B8A6B",
  ochre: "#C99432",
  denim: "#3E67A6",
  plum: "#86507A",
  graphite: "#2E2D2B",
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** DMs borrow the other member's identity; groups carry their own tone. */
export function chatIdentity(chat: Chat, me: string, users: (id: string) => User) {
  if (chat.kind === "dm") {
    const other = users(chat.memberIds.find((id) => id !== me) ?? chat.memberIds[0]);
    return { label: other.fullName, tone: other.tone, glyph: initials(other.fullName) };
  }
  return { label: chat.name, tone: chat.tone ?? "graphite", glyph: initials(chat.name) };
}
