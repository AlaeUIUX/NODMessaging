"use client";

/*
 * Motion the way UIKit does it, for the gestures that follow a finger (swipe a
 * row, pull a sheet down, swipe back, flick between photos). While the finger
 * is down the thing is exactly under it. On release a spring takes over,
 * starting from the finger's own speed, and where it comes to rest is chosen
 * from where the flick was heading, not only where it stopped.
 *
 * Springs are given as UIKit gives them: a response (roughly how long one
 * swing takes, in seconds) and a damping ratio (1 = settles with no bounce).
 */

export interface Spring { response: number; damping: number }

export const SPRINGS = {
  /** Things that come to rest in place: a row, a bubble, a sheet back up. A breath of bounce. */
  settle: { response: .38, damping: .86 },
  /** Things that leave (a sheet dismissed, a screen swiped away): no bounce past the edge. */
  exit: { response: .32, damping: 1 },
  /** Paging between photos. */
  page: { response: .42, damping: .92 },
} satisfies Record<string, Spring>;

/** One step of a damped spring (semi-implicit Euler: stable at any frame rate). */
export function springStep(x: number, v: number, target: number, s: Spring, dt: number) {
  const k = (2 * Math.PI / s.response) ** 2;
  const c = 2 * s.damping * Math.sqrt(k);
  const nv = v + (-k * (x - target) - c * v) * dt;
  return { x: x + nv * dt, v: nv };
}

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Springs a value from `from` to `to`, starting at `velocity` (units/s), and
 * calls `onFrame` with each value. Returns a stop function that halts it where
 * it is and gives back the current value and speed (a finger caught it).
 */
export function animateSpring({ from, to, velocity = 0, spring = SPRINGS.settle, onFrame, onDone }: {
  from: number;
  to: number;
  velocity?: number;
  spring?: Spring;
  onFrame: (x: number) => void;
  onDone?: () => void;
}) {
  let x = from;
  let v = velocity;
  let last = 0;
  let raf = 0;
  if (reduced()) {
    onFrame(to);
    onDone?.();
    return () => ({ x: to, v: 0 });
  }
  const tick = (now: number) => {
    const dt = last ? Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000)) : 1 / 60;
    last = now;
    ({ x, v } = springStep(x, v, to, spring, dt));
    const scale = Math.max(1, Math.abs(to - from));
    if (Math.abs(x - to) < scale * .001 + .2 && Math.abs(v) < scale * .01 + 4) {
      onFrame(to);
      raf = 0;
      onDone?.();
      return;
    }
    onFrame(x);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    return { x, v };
  };
}

/** The finger's speed over its last ~80 ms, in px/s (the way UIKit's pan gesture reports it). */
export class VelocityTracker {
  private samples: { t: number; x: number }[] = [];
  reset(t: number, x: number) { this.samples = [{ t, x }]; }
  add(t: number, x: number) {
    this.samples.push({ t, x });
    if (this.samples.length > 10) this.samples.shift();
  }
  velocity() {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1];
    const first = s.find((p) => last.t - p.t <= 80) ?? s[0];
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  }
}

/** Where a flick at `velocity` would carry `x` (UIScrollView's normal deceleration, roughly). */
export const project = (x: number, velocity: number, seconds = .2) => x + velocity * seconds;
