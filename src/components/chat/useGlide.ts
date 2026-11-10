"use client";

import { useEffect, type RefObject } from "react";

/*
 * A sideways row that moves like a real carousel: the physics of the Catalyst
 * Design Lab site's TileCarousel, which took them value for value from Blossom
 * Carousel (sachahaouzi.com). Dragged with a mouse, the row takes FOLLOW of the
 * way to the hand each frame. Let go, it throws the hand's speed and coasts:
 * the speed keeps FOLLOW of itself each frame and the row takes SETTLE of the
 * way to where that carries it, so it eases in on its stop. Past either end it
 * gives a fifth of the drag and springs back. A row of cards (`snap`) picks the
 * card nearest to where the throw would carry it and coasts exactly there, as
 * Blossom does; the browser's own snapping takes the last pixels at rest.
 * A mouse wheel feeds the same glide (`wheel`), so it never steps. Touch and
 * trackpads keep the browser's own scrolling, which already has momentum.
 */
const FOLLOW = 0.72;
const SETTLE = 0.12;
/* Blossom throws at 2, then snaps to the next card, which adds travel. A free row has no snap,
   so it throws harder to coast as far (a quick 90px flick carries ~100px on). */
const THROW_FREE = 3.5;
const THROW_SNAP = 2;
const RUBBER = 0.2;
const START_PX = 6;

/** Takes `k` of the way from `a` to `b` per 60th of a second, at any frame rate. */
const ease = (a: number, b: number, k: number, ms: number) => a + (b - a) * (1 - Math.exp(Math.log(1 - k) * (ms / (1000 / 60))));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface GlideOptions {
  /**
   * Turn a mouse wheel's up/down into sideways gliding. Right for a row nothing scrolls
   * around (the inbox's chips, a toolbar); inside a page that scrolls, leave it off so the
   * wheel keeps scrolling the page.
   */
  wheel?: boolean;
  /** A row of cards: a throw lands on a card. */
  snap?: boolean;
}

export function useGlide(ref: RefObject<HTMLElement | null>, deps: unknown[] = [], { wheel = true, snap = false }: GlideOptions = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const p = { pos: 0, target: 0, vel: 0, rubber: 0, raf: 0, last: 0, running: false, dragging: false, x: 0, travel: 0, aimed: false };
    const max = () => Math.max(0, el.scrollWidth - el.clientWidth);
    const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    /** Each card's resting scroll position, for a row of cards. */
    const stops = () => {
      const cards = [...el.children] as HTMLElement[];
      const pad = cards[0]?.offsetLeft ?? 0;
      return cards.map((c) => clamp(c.offsetLeft - pad, 0, max()));
    };
    const nearest = (x: number, s: number[]) => s.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), s[0] ?? 0);

    const frame = (now: number) => {
      p.raf = requestAnimationFrame(frame);
      const ms = Math.max(0, now - p.last);
      p.last = now;
      p.vel *= FOLLOW;
      if (p.dragging) p.pos = ease(p.pos, p.target, FOLLOW, ms);
      else {
        // Coasting: carried by its speed (aimed at a card, or free and never past either end).
        p.target = p.aimed ? p.target + p.vel : clamp(p.target + p.vel, 0, max());
        p.pos = ease(p.pos, p.target, SETTLE, ms);
      }
      el.scrollLeft = p.pos;
      // Past either end: a fifth of the drag, eased back once let go.
      const end = max();
      const over = p.dragging ? (p.pos < 0 ? p.pos : p.pos > end ? p.pos - end : 0) * -RUBBER : 0;
      p.rubber = ease(p.rubber, over, p.dragging ? 0.8 : SETTLE, ms);
      if (Math.abs(p.rubber) > 0.01) el.style.transform = `translateX(${p.rubber.toFixed(3)}px)`;
      else if (p.rubber) { el.style.transform = ""; p.rubber = 0; }
      if (p.dragging) return;
      if (Math.abs(p.pos - p.target) < 0.3 && Math.abs(p.vel) < 0.01 && !p.rubber) halt();
    };
    const run = () => {
      if (p.running) return;
      p.running = true;
      p.pos = p.target = el.scrollLeft;
      p.last = performance.now();
      // The browser's snapping would fight the glide: off while it moves, back on at rest.
      el.style.scrollSnapType = "none";
      el.style.scrollBehavior = "auto";
      p.raf = requestAnimationFrame(frame);
    };
    function halt() {
      cancelAnimationFrame(p.raf);
      p.running = false;
      p.aimed = false;
      el!.style.transform = "";
      el!.style.scrollSnapType = "";
      el!.style.scrollBehavior = "";
      p.rubber = 0;
    }

    // A drag after the first few px swallows the click that ends it (nothing picked by accident).
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener("click", swallow, true);
    };
    const move = (e: PointerEvent) => {
      const dx = p.x - e.clientX;
      p.x = e.clientX;
      p.travel += Math.abs(dx);
      if (p.travel < START_PX) return;
      e.preventDefault();
      p.target += dx;
      p.vel += dx;
      run();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      p.dragging = false;
      if (p.travel < START_PX) return;
      window.addEventListener("click", swallow, true);
      window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      if (still()) { p.vel = 0; p.target = clamp(snap ? nearest(p.target, stops()) : p.target, 0, max()); return; }
      if (snap) {
        // Where the throw would carry it, then the card nearest that, reached exactly (Blossom's aim).
        p.vel *= THROW_SNAP;
        const to = nearest(p.target + p.vel / (1 - FOLLOW), stops());
        p.vel = ((to - p.target) * (1 - FOLLOW)) / FOLLOW;
        p.aimed = true;
      } else p.vel *= THROW_FREE;
    };
    const press = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0 || max() <= 0) return;
      // Caught while it glides: it stops under the hand.
      if (p.running) { p.target = p.pos; p.aimed = false; }
      p.vel = 0;
      p.x = e.clientX;
      p.travel = 0;
      p.dragging = true;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    // A mouse wheel's up/down glides the row sideways. At either end the wheel goes back to the
    // page, so the row never traps it; a trackpad's sideways swipe scrolls it natively.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
        if (p.running && !p.dragging) halt();
        return;
      }
      if (!wheel) return;
      const m = max();
      if (m <= 0) return;
      const at = p.running ? p.target : el.scrollLeft;
      if ((e.deltaY > 0 && at >= m - 1) || (e.deltaY < 0 && at <= 0)) return;
      e.preventDefault();
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (still()) { el.scrollLeft = clamp(el.scrollLeft + step, 0, m); return; }
      run();
      p.aimed = false;
      p.target = clamp(p.target + step, 0, m);
    };

    // Capture: things inside (a held Mind item) may stop the pointer going further, and the row must still see it.
    el.addEventListener("pointerdown", press, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(p.raf);
      el.removeEventListener("pointerdown", press, true);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("click", swallow, true);
      el.style.transform = "";
      el.style.scrollSnapType = "";
      el.style.scrollBehavior = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, wheel, snap]);
}
