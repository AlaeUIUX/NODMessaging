"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDialog } from "./ui";
import styles from "./chat.module.css";

/**
 * Hold anything in Mind (a collection, a stack, an item). Holding still lifts
 * it and opens its menu, the way a message does in a chat; moving while still
 * holding closes the menu and drags it instead. Right-click opens the menu too.
 */

export type HoldSrc = { kind: "item" | "stack" | "collection" | "section"; id: string };
/** What to spread on something that can be held. */
export type HoldBind = {
  "data-hold": string;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
};

const HOLD_MS = 380;
const DRAG_AFTER = 10;

interface Opts<T> {
  root: React.RefObject<HTMLElement | null>;
  scroll?: React.RefObject<HTMLElement | null>;
  /** What's under the finger: a drop target, or nothing. */
  find: (x: number, y: number, src: HoldSrc) => T | null;
  drop: (src: HoldSrc, target: T) => void;
  menu: (src: HoldSrc, el: HTMLElement) => void;
  closeMenu: () => void;
}

type Press = {
  src: HoldSrc; el: HTMLElement; pointerId: number;
  x0: number; y0: number; offX: number; offY: number; w: number; h: number;
  phase: "wait" | "held" | "drag"; timer: ReturnType<typeof setTimeout>;
};

export function useHold<T>(opts: Opts<T>) {
  const o = useRef(opts);
  useEffect(() => { o.current = opts; });
  const press = useRef<Press | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<T | null>(null);
  const suppress = useRef(false);
  const [dragging, setDragging] = useState<{ src: HoldSrc; w: number; h: number; el: HTMLElement } | null>(null);
  const [target, setTarget] = useState<T | null>(null);

  // React's touch listeners are passive: once something is held, a native one
  // stops the page scrolling under the finger (which would cancel the drag).
  useEffect(() => {
    const el = opts.root.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (press.current && press.current.phase !== "wait" && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveGhost = (x: number, y: number) => {
    const root = o.current.root.current?.getBoundingClientRect();
    const p = press.current;
    if (!root || !p || !ghostRef.current) return;
    ghostRef.current.style.transform = `translate(${x - root.left - p.offX}px, ${y - root.top - p.offY}px) rotate(-1.5deg) scale(1.04)`;
  };
  const reset = () => {
    targetRef.current = null;
    setTarget(null);
    setDragging(null);
  };

  const bind = (src: HoldSrc): HoldBind => ({
    "data-hold": `${src.kind}:${src.id}`,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || press.current) return;
      // Nested holdables (an item inside a stack's peek): the innermost wins.
      e.stopPropagation();
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const pointerId = e.pointerId;
      press.current = {
        src, el, pointerId, x0: e.clientX, y0: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height, phase: "wait",
        timer: setTimeout(() => {
          const p = press.current;
          if (!p) return;
          p.phase = "held";
          suppress.current = true;
          try { el.setPointerCapture(pointerId); } catch { /* pointer gone */ }
          navigator.vibrate?.(8);
          o.current.menu(src, el);
        }, HOLD_MS),
      };
    },
    onClickCapture: (e: React.MouseEvent) => {
      // The click a long press ends with isn't a tap.
      if (suppress.current) { suppress.current = false; e.stopPropagation(); e.preventDefault(); }
    },
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      // A touch long press also fires this; the timer has it covered.
      if (press.current) return;
      o.current.menu(src, e.currentTarget);
    },
  });

  /** Spread on the screen's root: follows the finger once something is held. */
  const rootHandlers = {
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (!p) return;
      const d = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
      if (p.phase === "wait") {
        if (d > 8) { clearTimeout(p.timer); press.current = null; }
        return;
      }
      if (p.phase === "held") {
        if (d < DRAG_AFTER) return;
        p.phase = "drag";
        o.current.closeMenu();
        setDragging({ src: p.src, w: p.w, h: p.h, el: p.el });
        requestAnimationFrame(() => moveGhost(e.clientX, e.clientY));
      }
      e.preventDefault();
      moveGhost(e.clientX, e.clientY);
      const t = o.current.find(e.clientX, e.clientY, p.src);
      if (JSON.stringify(t) !== JSON.stringify(targetRef.current)) { targetRef.current = t; setTarget(t); }
      const s = o.current.scroll?.current;
      const box = s?.getBoundingClientRect();
      if (s && box) {
        if (e.clientY < box.top + 70) s.scrollBy(0, -10);
        else if (e.clientY > box.bottom - 70) s.scrollBy(0, 10);
      }
    },
    onPointerUp: () => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.timer);
      // Swallow only the click this press ends with (it comes right after), never a later tap.
      if (p.phase !== "wait") setTimeout(() => { suppress.current = false; }, 0);
      if (p.phase !== "drag") return; // held still: the menu stays open
      const t = targetRef.current;
      reset();
      if (t) o.current.drop(p.src, t);
    },
    onPointerCancel: () => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (p.phase === "drag") { suppress.current = false; reset(); }
    },
  };

  const isDragging = (kind: HoldSrc["kind"], id: string) => dragging?.src.kind === kind && dragging.src.id === id;

  /** The lifted copy that follows the finger. */
  const ghost = dragging && <Ghost ref={ghostRef} from={dragging.el} w={dragging.w} h={dragging.h} />;

  return { bind, rootHandlers, target, dragging, isDragging, ghost };
}

/** A live copy of what's being dragged, cloned from the page so it looks exactly the same. */
function Ghost({ ref, from, w, h }: { ref: React.RefObject<HTMLDivElement | null>; from: HTMLElement; w: number; h: number }) {
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = inner.current;
    if (!box) return;
    box.replaceChildren(copyOf(from));
  }, [from]);
  return (
    <div ref={ref} className={styles.mindGhost} style={{ width: w, height: h }} aria-hidden="true">
      <div ref={inner} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function copyOf(el: HTMLElement) {
  const c = el.cloneNode(true) as HTMLElement;
  const tone = getComputedStyle(el).getPropertyValue("--tone");
  c.style.setProperty("--tone", tone);
  c.style.width = "100%";
  c.style.height = "100%";
  c.style.margin = "0";
  c.style.animation = "none";
  c.style.opacity = "1";
  c.removeAttribute("id");
  c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  return c;
}

/* ===========================================================================
   The menu a hold opens
   =========================================================================== */

export type HoldAction = { id: string; label: string; icon: React.ReactNode; danger?: boolean; run: () => void } | "sep";

const TOP_SAFE = 58;
const BOTTOM_SAFE = 30;
const GAP = 10;
const MENU_W = 236;
const CLOSE_MS = 220;

export function HoldMenu({ anchor, title, actions, onClose }: { anchor: HTMLElement; title?: React.ReactNode; actions: HoldAction[]; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; height: number; menuTop: number; menuLeft: number; fromY: number; maxH: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const canDismiss = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => { canDismiss.current = true; }, 450);
    return () => clearTimeout(t);
  }, []);

  const items = actions.filter((a) => a !== "sep").length;
  const menuH = 12 + items * 44 + (actions.length - items) * 11 + (title ? 30 : 0);

  useLayoutEffect(() => {
    const host = rootRef.current?.getBoundingClientRect();
    if (!host) return;
    const r = anchor.getBoundingClientRect();
    const rect = { top: r.top - host.top, left: r.left - host.left, width: r.width, height: r.height };
    // Stay where it was when there's room; nudge up just enough for the menu below.
    const maxBottom = host.height - BOTTOM_SAFE - menuH - GAP;
    const maxH = Math.max(60, maxBottom - TOP_SAFE);
    const h = Math.min(rect.height, maxH);
    const top = Math.max(TOP_SAFE, Math.min(rect.top, maxBottom - h));
    const right = rect.left + rect.width / 2 > host.width / 2;
    const menuLeft = Math.max(8, Math.min(right ? rect.left + rect.width - MENU_W : rect.left, host.width - MENU_W - 8));
    setPlace({ top, left: rect.left, width: rect.width, height: h, menuTop: top + h * 1.03 + GAP, menuLeft, fromY: rect.top - top, maxH: h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
  // The lifted copy goes in once its box exists (after the first measure).
  const placed = !!place;
  useLayoutEffect(() => {
    if (placed) focusRef.current?.replaceChildren(copyOf(anchor));
  }, [placed, anchor]);

  useEffect(() => { firstRef.current?.focus({ preventScroll: true }); }, [place]);

  const close = (after?: () => void) => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    setTimeout(() => { onClose(); after?.(); }, CLOSE_MS);
  };
  const dismiss = () => { if (canDismiss.current) close(); };
  useDialog(rootRef, dismiss);

  const firstIdx = actions.findIndex((a) => a !== "sep");
  return (
    <div ref={rootRef} className={`${styles.overlay} ${closing ? styles.closing : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Actions"}>
      <div className={styles.scrim} onClick={dismiss} />
      {place && (
        <>
          <div
            ref={focusRef}
            className={`${styles.focus} ${styles.mindHoldFocus}`}
            style={{ top: place.top, left: place.left, width: place.width, height: place.height, ["--from-y" as string]: `${place.fromY}px` }}
            onClick={dismiss}
          />
          <div className={`${styles.menu} ${styles.glassStrong}`} style={{ top: place.menuTop, left: place.menuLeft, transformOrigin: "top left" }} role="menu">
            {title && <p className={styles.mindHoldTitle}>{title}</p>}
            {actions.map((a, i) => {
              if (a === "sep") return <div key={`sep-${i}`} className={styles.menuSep} />;
              return (
                <button key={a.id} ref={i === firstIdx ? firstRef : undefined} role="menuitem" className={`${styles.menuItem} ${a.danger ? styles.danger : ""}`} onClick={() => close(a.run)}>
                  {a.label}
                  {a.icon}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
