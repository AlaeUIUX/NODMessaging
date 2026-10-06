"use client";

/** Per-user order of the Analytics dashboard's sections — a personal layout choice, same storage pattern as Inbox's pinned/muted lists. */

export type SectionId = "hero" | "balances" | "needs" | "tasks" | "checklists" | "week" | "messages";

export const DEFAULT_SECTION_ORDER: SectionId[] = ["hero", "balances", "needs", "tasks", "checklists", "week", "messages"];

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Spent this month",
  balances: "Balances",
  needs: "Needs you",
  tasks: "Tasks",
  checklists: "Checklists",
  week: "This week",
  messages: "Messages",
};

const key = (me: string) => `nod.analytics.order.${me}`;

export function readSectionOrder(me: string): SectionId[] {
  try {
    const raw = localStorage.getItem(key(me));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return DEFAULT_SECTION_ORDER;
    const known = new Set(DEFAULT_SECTION_ORDER);
    const kept = parsed.filter((x): x is SectionId => typeof x === "string" && known.has(x as SectionId));
    const missing = DEFAULT_SECTION_ORDER.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
}

export function writeSectionOrder(me: string, order: SectionId[]) {
  try { localStorage.setItem(key(me), JSON.stringify(order)); } catch { /* private mode */ }
}
