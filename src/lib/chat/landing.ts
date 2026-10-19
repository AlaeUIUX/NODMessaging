/**
 * What just arrived in Mind: added, saved from a chat, copied, or sorted into
 * a collection. Whatever shows it next plays a short landing (see Landing):
 * the first time it's on screen, for a moment, and never again. Something
 * saved from a chat lands when Mind is next opened, if that's soon.
 */

const SHOW_MS = 1600;
const WAIT_MS = 10 * 60_000;
const pending = new Map<string, { at: number; shown?: number }>();

/** Marks things as just arrived. Call it before the change that adds them. */
export function land(...ids: (string | null | undefined)[]) {
  const at = Date.now();
  ids.forEach((id) => { if (id) pending.set(id, { at }); });
}

/**
 * Whether to play the landing on this thing now. The first look starts its
 * moment; every look within that moment says yes (so a re-render, or the same
 * thing shown twice, agrees), and after it, no.
 */
export function isLanding(id: string) {
  const p = pending.get(id);
  if (!p) return false;
  const now = Date.now();
  if (!p.shown) {
    if (now - p.at > WAIT_MS) { pending.delete(id); return false; }
    p.shown = now;
    return true;
  }
  if (now - p.shown < SHOW_MS) return true;
  pending.delete(id);
  return false;
}
