"use client";

/** Per-user, user-curated set and order of the Analytics dashboard's sections — starts blank; a personal layout choice, same storage pattern as Inbox's pinned/muted lists. */

export type SectionId = "hero" | "balances" | "needs" | "tasks" | "checklists" | "week" | "messages";

/** Every section that exists, in their canonical order — what "Add a section" offers, not what you start with. */
export const ALL_SECTIONS: SectionId[] = ["hero", "balances", "needs", "tasks", "checklists", "week", "messages"];

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
    if (!Array.isArray(parsed)) return [];
    const known = new Set(ALL_SECTIONS);
    return parsed.filter((x): x is SectionId => typeof x === "string" && known.has(x as SectionId));
  } catch {
    return [];
  }
}

export function writeSectionOrder(me: string, order: SectionId[]) {
  try { localStorage.setItem(key(me), JSON.stringify(order)); } catch { /* private mode */ }
}

/** How a section's chart is drawn — "default" is whatever that section natively renders. */
export type ChartStyle = "default" | "bar" | "line" | "circular";

/**
 * Every section is previewable this way, even ones with no alternate chart to switch
 * to — Checklists and This week just get a single "Default" entry, so opening their
 * style sheet is still possible (if a no-op beyond confirming what's already shown).
 * Balances has no shared header row to hang the button on (two separate tiles, not
 * one section with a title) so it's left out here.
 */
export const STYLE_OPTIONS: Partial<Record<SectionId, { style: ChartStyle; label: string }[]>> = {
  hero: [{ style: "default", label: "Line" }, { style: "bar", label: "Bar" }],
  needs: [{ style: "default", label: "Bar" }, { style: "circular", label: "Circular" }],
  tasks: [{ style: "default", label: "Circular" }, { style: "bar", label: "Bar" }],
  checklists: [{ style: "default", label: "Default" }],
  week: [{ style: "default", label: "Default" }],
  messages: [{ style: "default", label: "Bar" }, { style: "line", label: "Line" }],
};

const styleKey = (me: string) => `nod.analytics.chartStyle.${me}`;
const KNOWN_STYLES = new Set<ChartStyle>(["default", "bar", "line", "circular"]);

export function readChartStyles(me: string): Partial<Record<SectionId, ChartStyle>> {
  try {
    const raw = localStorage.getItem(styleKey(me));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const known = new Set(ALL_SECTIONS);
    const out: Partial<Record<SectionId, ChartStyle>> = {};
    for (const [id, style] of Object.entries(parsed as Record<string, unknown>)) {
      if (known.has(id as SectionId) && typeof style === "string" && KNOWN_STYLES.has(style as ChartStyle)) {
        out[id as SectionId] = style as ChartStyle;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function writeChartStyle(me: string, id: SectionId, style: ChartStyle) {
  const current = readChartStyles(me);
  // "default" needs no entry — keeps storage minimal and matches "nothing chosen yet" exactly.
  if (style === "default") delete current[id]; else current[id] = style;
  try { localStorage.setItem(styleKey(me), JSON.stringify(current)); } catch { /* private mode */ }
}
