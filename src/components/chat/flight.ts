import { reducedMotion } from "./ui";

/** How long the trip takes: long enough to follow with the eye, short enough not to wait for. */
const TRIP_MS = 700;

const easeInOut = (t: number) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * A copy of `el` flies into `target`, the way a saved post drops into its
 * collection: it lifts a little, shrinks along an arc and lands, and the
 * target gives a small bump to take it. Only a picture of it: a clone drawn
 * on top of `host` (positioned in it, like a toast) and gone once it lands.
 * The target is found again every frame, so it can still be arriving itself.
 */
export function fly({ el, host, wrap, target }: {
  el: HTMLElement;
  host: HTMLElement;
  /** Classes for a wrapper around the copy: the styles `el` gets from its ancestors (a sent bubble's colour). */
  wrap?: string;
  target: () => HTMLElement | null | undefined;
}) {
  if (reducedMotion()) return;
  const h0 = host.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;

  const ghost = document.createElement("div");
  ghost.className = wrap ?? "";
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: "absolute", left: `${r.left - h0.left}px`, top: `${r.top - h0.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: "0", padding: "0", display: "block", zIndex: "60", pointerEvents: "none", animation: "none", transition: "none", willChange: "transform, opacity",
  });
  const copy = el.cloneNode(true) as HTMLElement;
  ["tabindex", "role", "aria-label", "id"].forEach((a) => copy.removeAttribute(a));
  Object.assign(copy.style, {
    opacity: "1", margin: "0", width: "100%", height: "100%", maxWidth: "none", maxHeight: "none",
    animation: "none", transition: "none", transform: "none", boxShadow: "var(--e3)",
  });
  ghost.append(copy);
  host.append(ghost);

  const from = { x: r.left - h0.left + r.width / 2, y: r.top - h0.top + r.height / 2 };
  const big = Math.max(r.width, r.height);
  // Where it goes if the target never shows: down towards the bottom, where Mind's toast would be.
  let to = { x: h0.width / 2, y: h0.height - 120, size: 28 };
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / TRIP_MS);
    const h = host.getBoundingClientRect();
    const box = target()?.getBoundingClientRect();
    if (box?.width) to = { x: box.left - h.left + box.width / 2, y: box.top - h.top + box.height / 2, size: Math.min(box.width, box.height) };
    // A short arc: up and a little away first, then down into the target.
    const p = easeInOut(t);
    const cx = from.x + (to.x - from.x) * .25;
    const cy = Math.min(from.y, to.y) - 70;
    const x = (1 - p) ** 2 * from.x + 2 * (1 - p) * p * cx + p * p * to.x;
    const y = (1 - p) ** 2 * from.y + 2 * (1 - p) * p * cy + p * p * to.y;
    // A small lift as it lets go, then it shrinks to the size of the target.
    const end = to.size / big;
    const s = t < .14 ? 1 + .05 * easeOut(t / .14) : 1.05 + (end - 1.05) * easeOut((t - .14) / .86);
    ghost.style.transform = `translate(${x - from.x}px, ${y - from.y}px) rotate(${-8 * Math.sin(Math.PI * p)}deg) scale(${s})`;
    ghost.style.opacity = String(t < .8 ? 1 : 1 - (t - .8) / .2);
    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }
    ghost.remove();
    target()?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.3) rotate(-6deg)" }, { transform: "scale(1)" }],
      { duration: 460, easing: "cubic-bezier(.34, 1.4, .64, 1)" },
    );
  };
  requestAnimationFrame(step);
}
