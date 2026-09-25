"use client";

import { useEffect, useRef } from "react";
import styles from "./chat.module.css";

/**
 * The "conversation field" behind the phone: a grid of dots that breathes in a
 * slow wave. Every tap sends a ripple out from where you touched — even taps on
 * the phone, so the page answers what you do inside the app. Sending a message
 * fires a signal out to one of the feature cards; replies travel back in.
 */

interface Ripple { x: number; y: number; t0: number; power: number }
interface Packet { ax: number; ay: number; cx: number; cy: number; bx: number; by: number; t0: number; dur: number; loud: boolean }

const GAP = 22;
const RIPPLE_SPEED = 0.46; // px per ms
const RIPPLE_LIFE = 1900; // ms

export default function StageField({ dark }: { dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const darkRef = useRef(dark);
  useEffect(() => { darkRef.current = dark; }, [dark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !stage || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let dots: number[] = [];
    const ripples: Ripple[] = [];
    const packets: Packet[] = [];
    let mouse: { x: number; y: number } | null = null;
    let raf = 0;
    let visible = true;
    let nextAmbient = 0;

    const resize = () => {
      const r = stage.getBoundingClientRect();
      w = r.width;
      h = r.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      dots = [];
      const ox = (w % GAP) / 2;
      const oy = (h % GAP) / 2;
      for (let y = oy; y <= h; y += GAP) for (let x = ox; x <= w; x += GAP) dots.push(x, y);
      if (reduce) draw(performance.now());
    };

    const local = (cx: number, cy: number) => {
      const r = stage.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const rectOf = (el: Element) => {
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
    };

    /** A curved flight between the phone and one of the feature cards. */
    const launch = (dir: "out" | "in", loud: boolean) => {
      const phone = stage.querySelector("[data-device]");
      const cards = [...stage.querySelectorAll("[data-float]")].filter((c) => (c as HTMLElement).offsetParent !== null);
      if (!phone || !cards.length) return;
      const p = rectOf(phone);
      const c = rectOf(cards[Math.floor(Math.random() * cards.length)]);
      const cardCx = c.x + c.w / 2;
      const cardCy = c.y + c.h / 2;
      const leftSide = cardCx < p.x + p.w / 2;
      // Leave from the phone's edge facing the card, and land on the card's near edge.
      const px = leftSide ? p.x + 8 : p.x + p.w - 8;
      const py = Math.min(Math.max(cardCy + (Math.random() - 0.5) * 120, p.y + 80), p.y + p.h - 80);
      const cx = leftSide ? c.x + c.w - 6 : c.x + 6;
      const [ax, ay, bx, by] = dir === "out" ? [px, py, cx, cardCy] : [cx, cardCy, px, py];
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const bend = (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 60);
      packets.push({ ax, ay, bx, by, cx: mx, cy: my + bend, t0: performance.now(), dur: loud ? 1100 : 1700, loud });
      if (packets.length > 12) packets.shift();
    };

    const onDown = (e: PointerEvent) => {
      const p = local(e.clientX, e.clientY);
      ripples.push({ ...p, t0: performance.now(), power: 1 });
      if (ripples.length > 8) ripples.shift();
    };
    const onMove = (e: PointerEvent) => { mouse = local(e.clientX, e.clientY); };
    const onLeave = () => { mouse = null; };
    const onActivity = (e: Event) => {
      const dir = (e as CustomEvent<{ dir: "out" | "in" }>).detail?.dir ?? "out";
      launch(dir, true);
    };

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const bez = (q: Packet, t: number) => {
      const u = 1 - t;
      return [u * u * q.ax + 2 * u * t * q.cx + t * t * q.bx, u * u * q.ay + 2 * u * t * q.cy + t * t * q.by];
    };

    function draw(now: number) {
      if (!ctx) return;
      const isDark = darkRef.current;
      const ink = isDark ? "255, 255, 255" : "28, 25, 23";
      const glowInk = isDark ? "150, 180, 255" : "0, 53, 158";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;

      // Packet heads, so dots near a flying signal light up as it passes.
      const heads: number[] = [];
      for (let i = packets.length - 1; i >= 0; i--) {
        const q = packets[i];
        const p = (now - q.t0) / q.dur;
        if (p >= 1) {
          ripples.push({ x: q.bx, y: q.by, t0: now, power: q.loud ? 0.55 : 0.3 });
          packets.splice(i, 1);
          continue;
        }
        const [hx, hy] = bez(q, ease(p));
        heads.push(hx, hy, q.loud ? 1 : 0.5);
      }

      // The dot field.
      for (let i = 0; i < dots.length; i += 2) {
        const x0 = dots[i];
        const y0 = dots[i + 1];
        const wave = Math.sin(x0 * 0.011 + y0 * 0.006 - t * 0.8) * Math.sin(y0 * 0.009 - t * 0.45 + x0 * 0.003);
        let alpha = 0.13 + 0.08 * wave;
        let glow = 0;
        let dx = 0;
        let dy = wave * 1.2;

        for (const r of ripples) {
          const age = now - r.t0;
          if (age > RIPPLE_LIFE) continue;
          const radius = age * RIPPLE_SPEED;
          const ddx = x0 - r.x;
          const ddy = y0 - r.y;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          const band = Math.abs(dist - radius);
          if (band > 64) continue;
          const k = (1 - band / 64) * (1 - age / RIPPLE_LIFE) * r.power;
          dx += (ddx / dist) * k * 8;
          dy += (ddy / dist) * k * 8;
          glow += k * 0.7;
        }
        if (mouse) {
          const ddx = x0 - mouse.x;
          const ddy = y0 - mouse.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < 130 * 130) {
            const dist = Math.sqrt(d2) || 1;
            const k = (1 - dist / 130) ** 2;
            dx += (ddx / dist) * k * 5;
            dy += (ddy / dist) * k * 5;
            glow += k * 0.3;
          }
        }
        let signal = 0;
        for (let j = 0; j < heads.length; j += 3) {
          const ddx = x0 - heads[j];
          const ddy = y0 - heads[j + 1];
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < 46 * 46) signal = Math.max(signal, (1 - Math.sqrt(d2) / 46) * heads[j + 2]);
        }

        alpha = Math.min(0.85, alpha + glow + signal * 0.5);
        const size = 1.15 + glow * 1.8 + signal * 1.6;
        ctx.fillStyle = signal > 0.05 ? `rgba(${glowInk}, ${alpha})` : `rgba(${ink}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x0 + dx, y0 + dy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Signals: a soft trail behind a bright head.
      for (const q of packets) {
        const p = ease(Math.min(1, (now - q.t0) / q.dur));
        for (let k = 14; k >= 0; k--) {
          const tp = p - k * 0.018;
          if (tp <= 0) continue;
          const [x, y] = bez(q, tp);
          const fade = 1 - k / 15;
          ctx.fillStyle = `rgba(${glowInk}, ${(q.loud ? 0.55 : 0.28) * fade})`;
          ctx.beginPath();
          ctx.arc(x, y, (q.loud ? 3.2 : 2.2) * fade + 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Drop finished ripples.
      for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].t0 > RIPPLE_LIFE) ripples.splice(i, 1);
    }

    const frame = (now: number) => {
      if (now > nextAmbient) {
        // A quiet signal every few seconds, so the page is never completely still.
        launch(Math.random() > 0.5 ? "out" : "in", false);
        nextAmbient = now + 2600 + Math.random() * 2200;
      }
      draw(now);
      raf = visible ? requestAnimationFrame(frame) : 0;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    stage.addEventListener("pointerdown", onDown, true);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    window.addEventListener("nod:activity", onActivity);

    let io: IntersectionObserver | null = null;
    if (!reduce) {
      nextAmbient = performance.now() + 1200;
      io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(frame);
      });
      io.observe(stage);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      stage.removeEventListener("pointerdown", onDown, true);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("nod:activity", onActivity);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.stageField} aria-hidden="true" />;
}
