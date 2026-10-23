"use client";

import { useEffect, useRef, useState } from "react";
import { close as closeMic, levels, open as openMic } from "@/lib/chat/mic";
import { userById } from "@/lib/chat/store";
import { IconWalkie } from "../Icons";
import { Av } from "./kit";
import a from "./onair.module.css";

/**
 * A call on air, the way the Dynamic Island shows one: the speaker's picture,
 * a wave that moves with the voice, and the words as they're spoken on a
 * layer of their own underneath, never squeezed onto one line.
 */

/**
 * A voice wave. Your own call (`mic`) moves with the real microphone; anyone
 * else's moves with their words: a swell as each one arrives, settling in
 * the pauses. Drawn straight onto the bars every frame, so React stays out.
 */
export function LiveWave({ bars = 24, mic = false, words = "", className }: {
  bars?: number;
  mic?: boolean;
  /** The words so far: each change is a syllable's worth of sound. */
  words?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const spoke = useRef(0);
  useEffect(() => { spoke.current = performance.now(); }, [words]);
  useEffect(() => {
    if (!mic) return;
    void openMic();
    return closeMic;
  }, [mic]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const n = items.length;
    const band = new Float32Array(Math.ceil(n / 2));
    const cur = new Float32Array(n);
    // Taller in the middle, like a voice print.
    const shape = (i: number) => 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / n);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((b, i) => { b.style.transform = `scaleY(${0.25 + 0.5 * shape(i)})`; });
      return;
    }
    let raf = 0;
    const tick = (t: number) => {
      const real = mic && levels(band);
      // Mirrored around the middle, low sounds in the centre.
      const mid = (n - 1) / 2;
      const swell = 0.3 + 0.7 * Math.exp(-(t - spoke.current) / 650);
      for (let i = 0; i < n; i++) {
        let v: number;
        if (real) {
          v = band[Math.min(band.length - 1, Math.round(Math.abs(i - mid)))] * (0.7 + 0.3 * shape(i));
        } else {
          const wobble = 0.5 + 0.5 * Math.sin(t / 110 + i * 0.9) * Math.sin(t / 290 + i * 0.37);
          v = swell * (0.3 + 0.7 * wobble) * shape(i);
        }
        cur[i] += (v - cur[i]) * 0.35;
        items[i].style.transform = `scaleY(${(0.1 + 0.9 * cur[i]).toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mic, bars]);
  return (
    <span ref={ref} className={`${a.wave} ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} />)}
    </span>
  );
}

/**
 * The island at the top of an Operation's chat while someone you hear is on
 * air. Compact: picture, name, wave, and the words under them. Tap it and it
 * opens up (where they are, more of what they said, and the radio); tap
 * again and it tucks back.
 */
export function OnAirIsland({ by, where, text, onOpen }: {
  by: string;
  /** "A2 · Player Lounge", or the channel it came through. */
  where: string | null;
  text: string;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const u = userById(by);
  return (
    <div className={`${a.island} ${open ? a.open : ""}`} role="status" aria-live="polite" aria-label={`${u.name} is on air`}>
      <button className={a.top} onClick={() => setOpen((x) => !x)} aria-expanded={open} aria-label={`${u.fullName} is on air${where ? `, ${where}` : ""}. ${open ? "Tuck away" : "Show more"}`}>
        <span className={a.av}><Av id={by} size={open ? 40 : 30} /></span>
        <span className={a.who}>
          <b>{open ? u.fullName : u.name}</b>
          <small>{where ?? "On air"}</small>
        </span>
        <LiveWave bars={open ? 22 : 14} words={text} />
      </button>
      <p className={a.words}>
        <span>{text || <em>Listening…</em>}</span>
      </p>
      {open && (
        <button className={a.radio} onClick={onOpen}>
          <IconWalkie size={16} />Open the radio
        </button>
      )}
    </div>
  );
}
