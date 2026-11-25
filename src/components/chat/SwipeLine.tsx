"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { haptic } from "@/lib/chat/haptics";
import { IconTrash } from "./Icons";
import { ARM_AT, DISARM_AT, PROJECT_S, SPRING_ARM, SPRING_ROW, step } from "./InboxRow";
import styles from "./chat.module.css";

/** How far Delete rests open after a short swipe. */
const REVEAL = 84;

/**
 * A line in a list you can swipe left to delete. The line itself stays where
 * it is (checkbox and words don't move); Delete grows in from the trailing
 * edge under the finger. A short swipe leaves it open; past the same line as
 * the chat list's swipes (InboxRow: 60% in, back under 50% to let go) it takes
 * over the whole line with the same spring and a tick, and letting go deletes.
 *
 * iOS: the tick is the selection haptic when the action arms (on the web,
 * lib/chat/haptics). The line then folds away and `onDelete` runs; Undo lives
 * on the toast.
 */
export function SwipeLine({ children, label, open, onOpenChange, onDelete }: {
  children: ReactNode;
  /** What's being deleted, for the button's name ("Delete “Type scale”"). */
  label: string;
  /** Only one line stays open: the list closes the others. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const actRef = useRef<HTMLButtonElement>(null);
  // A drag still ends in a click: it must not tick the line.
  const swallow = useRef(false);
  const drag = useRef<{ x: number; y: number; base: number; active: boolean; samples: { t: number; x: number }[] } | null>(null);
  /** `x`: how far Delete is pulled in (≤ 0). `arm`: 0 → 1 as it takes over the whole line. */
  const m = useRef({ x: 0, v: 0, target: 0, following: false, arm: 0, armV: 0, armed: false, gone: false, raf: 0, last: 0 });
  const deleteRef = useRef(onDelete);
  useEffect(() => { deleteRef.current = onDelete; }, [onDelete]);

  const width = () => wrapRef.current?.offsetWidth ?? 320;

  const paint = () => {
    const s = m.current;
    const room = Math.max(0, -s.x);
    const w = room + (width() - room) * s.arm;
    if (actRef.current) actRef.current.style.width = `${w}px`;
    wrapRef.current?.style.setProperty("--p", String(Math.min(1, w / REVEAL)));
  };

  /** Delete has covered the line: the gap closes, then the line is really gone. */
  const collapse = () => {
    const w = wrapRef.current;
    if (!w) { deleteRef.current(); return; }
    w.style.height = `${w.offsetHeight}px`;
    void w.offsetHeight;
    w.dataset.collapsing = "";
    w.style.height = "0px";
    setTimeout(() => deleteRef.current(), 220);
  };

  const tick = (now: number) => {
    const s = m.current;
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - (s.last || now - 16)) / 1000));
    s.last = now;
    if (!s.following) ({ x: s.x, v: s.v } = step(s.x, s.v, s.target, SPRING_ROW, dt));
    const armTo = s.armed ? 1 : 0;
    ({ x: s.arm, v: s.armV } = step(s.arm, s.armV, armTo, SPRING_ARM, dt));
    paint();
    const rowDone = s.following || (Math.abs(s.x - s.target) < .4 && Math.abs(s.v) < 8);
    const armDone = Math.abs(s.arm - armTo) < .004 && Math.abs(s.armV) < .05;
    if (rowDone && armDone && !s.following) {
      s.x = s.target; s.v = 0; s.arm = armTo; s.armV = 0;
      paint();
      s.raf = 0; s.last = 0;
      if (s.gone) collapse();
      return;
    }
    s.raf = requestAnimationFrame(tick);
  };
  const run = () => { if (!m.current.raf) m.current.raf = requestAnimationFrame(tick); };

  const settle = (target: number, velocity = m.current.v) => {
    const s = m.current;
    s.following = false;
    s.target = target;
    s.v = velocity;
    if (!s.gone) onOpenChange(target !== 0);
    run();
  };

  const setArmed = (on: boolean) => {
    const s = m.current;
    if (s.armed === on) return;
    s.armed = on;
    if (wrapRef.current) {
      if (on) wrapRef.current.dataset.armed = "";
      else delete wrapRef.current.dataset.armed;
    }
    if (on) haptic(10);
    run();
  };

  /** Delete takes the whole line (the arm spring), then it folds away. */
  const remove = () => {
    const s = m.current;
    if (s.gone) return;
    s.gone = true;
    setArmed(true);
    onOpenChange(false);
    settle(Math.min(s.x, -REVEAL), 0);
  };

  // Another line opened: close this one.
  useEffect(() => {
    if (!open && m.current.target !== 0 && !m.current.gone) { setArmed(false); settle(0, 0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => cancelAnimationFrame(m.current.raf), []);

  const velocity = () => {
    const d = drag.current;
    if (!d || d.samples.length < 2) return 0;
    const lastS = d.samples[d.samples.length - 1];
    const first = d.samples.find((p) => lastS.t - p.t <= 80) ?? d.samples[0];
    const dt = (lastS.t - first.t) / 1000;
    return dt > 0 ? (lastS.x - first.x) / dt : 0;
  };

  return (
    <div
      ref={wrapRef}
      className={styles.swipeLine}
      // The bubble around the card swipes to reply and holds for its menu: a line's own swipe stays here.
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0 || m.current.gone) return;
        swallow.current = false;
        drag.current = { x: e.clientX, y: e.clientY, base: m.current.x, active: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.active) {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
          if (Math.abs(dx) < 6) return;
          d.active = true;
          swallow.current = true;
          const s = m.current;
          s.following = true;
          s.v = 0;
          d.base = s.x - dx;
          wrapRef.current?.setPointerCapture(e.pointerId);
        }
        d.samples.push({ t: e.timeStamp, x: e.clientX });
        if (d.samples.length > 8) d.samples.shift();
        const w = width();
        let x = Math.min(0, d.base + dx);
        // Free almost to the far edge, then it resists.
        const limit = w * .92;
        if (-x > limit) x = -(limit + (-x - limit) * .18);
        m.current.x = x;
        const far = -x / w;
        setArmed(far > ARM_AT || (far > DISARM_AT && m.current.armed));
        run();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const d = drag.current;
        const v = velocity();
        drag.current = null;
        if (!d?.active) return;
        const s = m.current;
        if (s.armed) { remove(); return; }
        const projected = s.x + v * PROJECT_S;
        settle(projected < -REVEAL / 2 ? -REVEAL : 0, v);
      }}
      onPointerCancel={() => { drag.current = null; setArmed(false); settle(m.current.target, 0); }}
      onClickCapture={(e) => {
        if (actRef.current?.contains(e.target as Node)) return;
        // The click that ends a drag, or a tap on an open line (which closes it), never ticks it.
        if (swallow.current) {
          swallow.current = false;
          e.preventDefault();
          e.stopPropagation();
        } else if (m.current.target !== 0) {
          e.preventDefault();
          e.stopPropagation();
          if (!m.current.gone) settle(0, 0);
        }
      }}
    >
      {children}
      <button
        ref={actRef}
        type="button"
        className={styles.swipeLineAct}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={`Delete “${label}”`}
        onClick={() => remove()}
      >
        <span className={styles.swipeLineActInner}>
          <IconTrash size={20} />
          <span>Delete</span>
        </span>
      </button>
    </div>
  );
}
