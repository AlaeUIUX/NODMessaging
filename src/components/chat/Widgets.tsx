"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TONES } from "@/lib/chat/avatar";
import {
  CHART_LABEL, chartOf, chartsFor, layoutOf, newWidget, placeAt, SIZE_LABEL, WIDGET_GROUPS, WIDGETS,
  type Box, type ChartKind, type Widget, type WidgetKind, type WidgetSize,
} from "@/lib/chat/widgets";
import type { BoardSummary } from "./Analytics";
import {
  IconBack, IconBoard, IconCalendar, IconChart, IconCheck, IconChecklist, IconClock, IconDrag, IconInbox, IconMessage,
  IconMinus, IconPoll, IconRoute, IconSliders, IconTask, IconWallet,
} from "./Icons";
import { Segmented, Sheet } from "./ui";
import { WidgetIntro, INTRO_STEPS } from "./WidgetIntro";
import styles from "./chat.module.css";
import g from "./widgets.module.css";

/**
 * The widget board, the way a phone's home screen works: two small widgets
 * sit side by side, medium and large ones take the row. Tap a widget to dig
 * in; hold it for its menu, or hold and move to carry it somewhere else.
 *
 * While one is carried, the others glide out of its way, a blue slot shows
 * where it will land (with a line from the widget to it), faint guides show
 * the grid, and the page scrolls by itself near the top and bottom. Let go
 * and it flies into its slot. In edit mode everything wiggles and a widget
 * picks up straight away; its grip, sliders and minus are always there.
 */

export const KIND_ICON: Record<WidgetKind, (size: number) => ReactNode> = {
  spend: (n) => <IconChart size={n} />,
  balances: (n) => <IconWallet size={n} />,
  needs: (n) => <IconInbox size={n} />,
  tasks: (n) => <IconTask size={n} />,
  boards: (n) => <IconBoard size={n} />,
  checklists: (n) => <IconChecklist size={n} />,
  polls: (n) => <IconPoll size={n} />,
  plans: (n) => <IconRoute size={n} />,
  next: (n) => <IconClock size={n} />,
  week: (n) => <IconCalendar size={n} />,
  messages: (n) => <IconMessage size={n} />,
};

/** Each group's colour: the add sheet's tiles, and the icon in a widget's corner. */
const GROUP_TONE: Record<string, keyof typeof TONES> = { Money: "graphite", Work: "denim", Together: "sage", Time: "ochre" };
const groupOf = (k: WidgetKind) => WIDGET_GROUPS.find((x) => x.kinds.includes(k))!.title;
const toneOf = (k: WidgetKind) => (groupOf(k) === "Money" ? "var(--ink)" : TONES[GROUP_TONE[groupOf(k)]]);

/** A widget's name: its board's for a one-board widget, the side for a one-sided balance, else its kind's. */
export function widgetTitle(w: Widget, boards: BoardSummary[]) {
  if (w.kind === "boards" && w.board) return boards.find((b) => b.key === w.board)?.name ?? "Boards";
  if (w.kind === "balances" && w.view !== "both") return w.view === "owe" ? "You owe" : "Owed to you";
  return WIDGETS[w.kind].label;
}

/* ---------------------------------------------------------------------------
   One widget's container
--------------------------------------------------------------------------- */

function Frame({ w, title, editing, preview, children, tools, onTap }: {
  w: Widget;
  title: string;
  editing?: boolean;
  /** Drawn, not used: in a sheet, or the copy being carried. */
  preview?: boolean;
  children: ReactNode;
  tools?: ReactNode;
  onTap?: () => void;
}) {
  const view = WIDGETS[w.kind].views.length > 1 ? WIDGETS[w.kind].views.find((v) => v.id === w.view)?.label : null;
  return (
    <section
      data-widget={w.id}
      className={`${g.widget} ${g[w.size]} ${editing ? g.jiggle : ""} ${preview ? g.inPreview : ""}`}
      style={{ ["--tone" as string]: toneOf(w.kind) }}
      aria-label={title}
      onClick={onTap}
    >
      <header className={g.head}>
        <span className={g.icon}>{KIND_ICON[w.kind](14)}</span>
        <button className={g.title} tabIndex={preview ? -1 : 0} onClick={(e) => { e.stopPropagation(); onTap?.(); }}>{title}</button>
        {tools ?? (view && w.size !== "small" && <span className={g.view}>{view}</span>)}
      </header>
      <div className={g.body}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   The board
--------------------------------------------------------------------------- */

const GAP = 12;
/** Hold this long for the menu (and to pick it up, outside edit mode). */
const HOLD_MS = 380;
/** In edit mode a finger picks a widget up after a short press, so a quick swipe still scrolls. */
const EDIT_TOUCH_MS = 140;
/** Moved this far while held: it's a drag. Before it's held: it's a scroll. */
const MOVE_PX = 8;
const LAND_MS = 420;
/** A new slot has to be this much nearer than the current one, so it never flickers between two. */
const STICKY_PX = 16;

type Press = {
  id: string; cell: HTMLElement; pointerId: number;
  x0: number; y0: number; offX: number; offY: number; w: number; h: number;
  phase: "wait" | "held" | "drag"; timer: ReturnType<typeof setTimeout> | null;
  /** Its place in the list when it was picked up. */
  from: number;
};
/** The widget being carried: where it came from, where it would land, where the copy started. */
type Drag = { id: string; w: number; h: number; from: number; at: number; x0: number; y0: number; landing: boolean };

/** A box in pixels, for the board's width. */
function pixels(b: Box, width: number) {
  const step = (width + GAP) / 2;
  return { x: b.x * step, y: b.y * step, w: b.w * step - GAP, h: b.h * step - GAP };
}
const cellVars = (b: Box) => ({ ["--x" as string]: b.x, ["--y" as string]: b.y, ["--w" as string]: b.w, ["--h" as string]: b.h });

export function WidgetBoard({ widgets, editing, scroll, render, titleOf, fresh, onTap, onMenu, closeMenu, onPlace, onEdit, onRemove, onEditAll, onAdd }: {
  widgets: Widget[];
  editing: boolean;
  scroll: React.RefObject<HTMLElement | null>;
  render: (w: Widget) => ReactNode;
  titleOf: (w: Widget) => string;
  /** Just added: it pops in. */
  fresh: string | null;
  onTap: (w: Widget) => void;
  onMenu: (w: Widget, el: HTMLElement) => void;
  closeMenu: () => void;
  onPlace: (id: string, at: number) => void;
  onEdit: (w: Widget) => void;
  onRemove: (w: Widget) => void;
  onEditAll: () => void;
  onAdd: () => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const press = useRef<Press | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const raf = useRef(0);
  const suppress = useRef(false);
  const listeners = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; key: (e: KeyboardEvent) => void } | null>(null);
  const live = useRef({ widgets, onMenu, closeMenu, onPlace });
  useEffect(() => { live.current = { widgets, onMenu, closeMenu, onPlace }; });

  const [drag, setDragState] = useState<Drag | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  // Everything rises in once when the page opens; later reorders only glide.
  const [appear, setAppear] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAppear(false), 900);
    return () => clearTimeout(t);
  }, []);

  // The page's order of elements never changes, only where each one sits, so
  // every move (a drag, Move up, a removal) glides instead of jumping.
  const [seen, setSeen] = useState<string[]>([]);
  const unseen = widgets.filter((w) => !seen.includes(w.id));
  if (unseen.length) setSeen([...seen, ...unseen.map((w) => w.id)]);
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const order = seen.map((id) => byId.get(id)).filter((w): w is Widget => !!w);

  // A finger that has picked something up mustn't scroll the page instead.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (press.current && press.current.phase !== "wait" && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    const l = listeners.current;
    if (l) {
      window.removeEventListener("pointermove", l.move);
      window.removeEventListener("pointerup", l.up);
      window.removeEventListener("pointercancel", l.up);
      window.removeEventListener("keydown", l.key);
    }
  }, []);

  const shown = drag ? placeAt(widgets, drag.id, drag.at) : widgets;
  const { boxes, rows } = layoutOf(shown);

  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const slotFor = (id: string, at: number) => pixels(layoutOf(placeAt(live.current.widgets, id, at)).boxes.get(id)!, boardRef.current!.clientWidth);

  /** The slot nearest the carried widget's middle: wherever it would sit if dropped right now. */
  const nearest = (cx: number, cy: number, d: Drag) => {
    let best = d.at;
    let bestD = Infinity;
    let curD = Infinity;
    for (let k = 0; k < live.current.widgets.length; k++) {
      const r = slotFor(d.id, k);
      const dist = Math.hypot(cx - (r.x + r.w / 2), cy - (r.y + r.h / 2));
      if (k === d.at) curD = dist;
      if (dist < bestD) { bestD = dist; best = k; }
    }
    return bestD < curD - STICKY_PX ? best : d.at;
  };

  /** Near the top or bottom, the page scrolls by itself, faster the closer the finger gets. */
  const autoScroll = () => {
    const sc = scroll.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const y = pointer.current.y;
    // The tab bar floats over the last stretch of the page.
    const top = r.top + 64;
    const bottom = r.bottom - 150;
    const speed = (over: number) => 3 + 17 * Math.min(1, over / 90) ** 2;
    if (y < top) sc.scrollBy(0, -speed(top - y));
    else if (y > bottom) sc.scrollBy(0, speed(y - bottom));
  };

  /** Every frame while carrying: follow the finger, find the slot, draw the line to it. */
  const tick = () => {
    const p = press.current;
    const d = dragRef.current;
    const board = boardRef.current;
    if (!p || p.phase !== "drag" || !d || d.landing || !board) return;
    autoScroll();
    const b = board.getBoundingClientRect();
    const x = pointer.current.x - b.left - p.offX;
    const y = pointer.current.y - b.top - p.offY;
    if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.04)`;
    const cx = x + d.w / 2;
    const cy = y + d.h / 2;
    const at = nearest(cx, cy, d);
    if (at !== d.at) {
      navigator.vibrate?.(4);
      setDrag({ ...d, at });
    }
    // A curved guide from the widget to where it will land.
    const s = slotFor(d.id, at);
    const ex = s.x + s.w / 2;
    const ey = s.y + s.h / 2;
    const dist = Math.hypot(ex - cx, ey - cy);
    const bend = Math.min(60, dist * 0.22);
    const mx = (cx + ex) / 2 + ((ey - cy) / (dist || 1)) * bend;
    const my = (cy + ey) / 2 - ((ex - cx) / (dist || 1)) * bend;
    lineRef.current?.setAttribute("d", `M${cx},${cy} Q${mx},${my} ${ex},${ey}`);
    lineRef.current?.style.setProperty("opacity", dist > 40 ? "1" : "0");
    dotRef.current?.setAttribute("cx", String(ex));
    dotRef.current?.setAttribute("cy", String(ey));
    dotRef.current?.style.setProperty("opacity", dist > 40 ? "1" : "0");
    raf.current = requestAnimationFrame(tick);
  };

  const startDrag = (p: Press) => {
    p.phase = "drag";
    suppress.current = true;
    live.current.closeMenu();
    const b = p.cell.getBoundingClientRect();
    const board = boardRef.current!.getBoundingClientRect();
    setDrag({ id: p.id, w: p.w, h: p.h, from: p.from, at: p.from, x0: b.left - board.left, y0: b.top - board.top, landing: false });
    navigator.vibrate?.(10);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  };

  /** Let go: the copy flies into its slot (or back where it came from), then the real one takes over. */
  const land = (cancelled: boolean) => {
    cancelAnimationFrame(raf.current);
    const d = dragRef.current;
    if (!d) return;
    const at = cancelled ? d.from : d.at;
    const s = slotFor(d.id, at);
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.transition = `transform ${LAND_MS}ms cubic-bezier(.2, 1.18, .32, 1)`;
      ghost.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(1)`;
    }
    lineRef.current?.style.setProperty("opacity", "0");
    dotRef.current?.style.setProperty("opacity", "0");
    setDrag({ ...d, at, landing: true });
    if (at !== d.from) live.current.onPlace(d.id, at);
    navigator.vibrate?.(8);
    setTimeout(() => {
      setDrag(null);
      setLanded(d.id);
      setTimeout(() => setLanded((x) => (x === d.id ? null : x)), 700);
    }, LAND_MS);
  };

  const release = (cancelled: boolean) => {
    const p = press.current;
    press.current = null;
    const l = listeners.current;
    if (l) {
      window.removeEventListener("pointermove", l.move);
      window.removeEventListener("pointerup", l.up);
      window.removeEventListener("pointercancel", l.up);
      window.removeEventListener("keydown", l.key);
      listeners.current = null;
    }
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    // Swallow only the click this press ends with (it comes right after), never a later tap.
    if (suppress.current) setTimeout(() => { suppress.current = false; }, 0);
    if (p.phase === "drag") land(cancelled);
  };

  const onPointerDown = (w: Widget) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || press.current || dragRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-nodrag]")) return;
    const cell = e.currentTarget;
    const r = cell.getBoundingClientRect();
    const touch = e.pointerType !== "mouse";
    const grip = !!target.closest("[data-grip]");
    const p: Press = {
      id: w.id, cell, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top,
      w: r.width, h: r.height, phase: "wait", timer: null, from: live.current.widgets.findIndex((x) => x.id === w.id),
    };
    pointer.current = { x: e.clientX, y: e.clientY };
    if (editing && (!touch || grip)) p.phase = "held";
    else {
      p.timer = setTimeout(() => {
        if (press.current !== p) return;
        p.phase = "held";
        navigator.vibrate?.(8);
        if (!editing) {
          suppress.current = true;
          live.current.onMenu(w, cell.querySelector<HTMLElement>("[data-widget]") ?? cell);
        }
      }, editing ? EDIT_TOUCH_MS : HOLD_MS);
    }
    press.current = p;
    const move = (ev: PointerEvent) => {
      const cur = press.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;
      pointer.current = { x: ev.clientX, y: ev.clientY };
      const dist = Math.hypot(ev.clientX - cur.x0, ev.clientY - cur.y0);
      // Moving before it's held is a scroll or a swipe, not a pick-up.
      if (cur.phase === "wait") { if (dist > MOVE_PX) release(true); return; }
      if (cur.phase === "held" && dist > MOVE_PX) startDrag(cur);
    };
    const up = (ev: PointerEvent) => { if (press.current && ev.pointerId === press.current.pointerId) release(ev.type === "pointercancel"); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape" && press.current?.phase === "drag") { ev.preventDefault(); release(true); } };
    listeners.current = { move, up, key };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
  };

  const dragBox = drag ? boxes.get(drag.id) : undefined;
  const carried = drag ? byId.get(drag.id) : undefined;

  return (
    <div className={g.boardWrap}>
      <div ref={boardRef} className={`${g.board} ${drag ? g.carrying : ""} ${appear ? g.appear : ""}`} style={{ ["--rows" as string]: rows }}>
        {/* The grid, faintly, while something is carried. */}
        {drag && (
          <div className={g.guides} aria-hidden="true">
            {Array.from({ length: rows * 2 }, (_, i) => <i key={i} style={cellVars({ x: i % 2, y: Math.floor(i / 2), w: 1, h: 1 })} />)}
          </div>
        )}
        {drag && dragBox && (
          <div className={g.slot} style={cellVars(dragBox)} aria-hidden="true">
            <span key={drag.at} className={g.slotRipple} />
          </div>
        )}

        {order.map((w) => {
          const b = boxes.get(w.id);
          if (!b) return null;
          const i = widgets.indexOf(w);
          const title = titleOf(w);
          return (
            <div
              key={w.id}
              className={[g.cell, drag?.id === w.id ? g.carriedFrom : "", landed === w.id ? g.landed : "", fresh === w.id ? g.fresh : ""].filter(Boolean).join(" ")}
              style={{ ...cellVars(b), ["--i" as string]: i }}
              onPointerDown={onPointerDown(w)}
              onClickCapture={(e) => { if (suppress.current) { suppress.current = false; e.stopPropagation(); e.preventDefault(); } }}
              onContextMenu={(e) => { e.preventDefault(); if (!editing) onMenu(w, e.currentTarget.querySelector<HTMLElement>("[data-widget]") ?? e.currentTarget); }}
            >
              <Frame
                w={w}
                title={title}
                editing={editing}
                onTap={() => (editing ? onEdit(w) : onTap(w))}
                tools={editing ? (
                  <span className={g.tools}>
                    <button
                      className={`${g.tool} ${g.grip}`}
                      data-grip
                      aria-label={`Move ${title}. Arrow keys move it`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        const by = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
                        if (!by) return;
                        e.preventDefault();
                        if (i + by >= 0 && i + by < widgets.length) onPlace(w.id, i + by);
                      }}
                    >
                      <IconDrag size={15} />
                    </button>
                    <button className={g.tool} data-nodrag aria-label={`Edit ${title}`} onClick={(e) => { e.stopPropagation(); onEdit(w); }}><IconSliders size={15} /></button>
                    <button className={`${g.tool} ${g.toolRemove}`} data-nodrag aria-label={`Remove ${title}`} onClick={(e) => { e.stopPropagation(); onRemove(w); }}><IconMinus size={14} /></button>
                  </span>
                ) : undefined}
              >
                {render(w)}
              </Frame>
            </div>
          );
        })}

        {drag && (
          <svg className={g.guideLine} aria-hidden="true">
            <path ref={lineRef} />
            <circle ref={dotRef} r={5} />
          </svg>
        )}
        {drag && carried && (
          <div
            ref={ghostRef}
            className={`${g.ghost} ${drag.landing ? g.ghostLanding : ""}`}
            style={{ width: drag.w, height: drag.h, transform: `translate3d(${drag.x0}px, ${drag.y0}px, 0) scale(1.04)` }}
            aria-hidden="true"
          >
            <div className={g.ghostLift}>
              <Frame w={carried} title={titleOf(carried)} preview>{render(carried)}</Frame>
            </div>
          </div>
        )}
      </div>

      {editing ? (
        <button className={g.editAll} onClick={onAdd}>Add a widget</button>
      ) : (
        <button className={g.editAll} onClick={onEditAll}>Edit widgets</button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Adding, and changing one
--------------------------------------------------------------------------- */

/** The widget as it will look, at its real size. */
function Preview({ w, title, render }: { w: Widget; title: string; render: (w: Widget) => ReactNode }) {
  return (
    <div className={g.preview} aria-hidden="true">
      <div className={`${g.previewGrid} ${g[w.size]}`}>
        <Frame w={w} title={title} preview>{render(w)}</Frame>
      </div>
    </div>
  );
}

/** Size, what it shows, and (boards) which board: the same in Add and Edit. */
function Options({ w, boards, onChange }: { w: Widget; boards: BoardSummary[]; onChange: (patch: Partial<Widget>) => void }) {
  const spec = WIDGETS[w.kind];
  return (
    <>
      {spec.sizes.length > 1 && (
        <>
          <p className={styles.sheetLabel}>Size</p>
          <Segmented<WidgetSize> value={w.size} options={spec.sizes.map((id) => ({ id, label: SIZE_LABEL[id] }))} onChange={(size) => onChange({ size })} />
        </>
      )}
      {spec.views.length > 1 && (
        <>
          <p className={styles.sheetLabel}>Shows</p>
          <div className={styles.listGroup} role="radiogroup" aria-label="What it shows">
            {spec.views.map((v) => (
              <button key={v.id} role="radio" aria-checked={w.view === v.id} className={`${g.option} ${w.view === v.id ? g.optionOn : ""}`} onClick={() => onChange({ view: v.id })}>
                <span className={styles.contactText}><b>{v.label}</b><small>{v.sub}</small></span>
                <span className={`${styles.pickCircle} ${w.view === v.id ? styles.pickOn : ""}`}>{w.view === v.id && <IconCheck size={12} />}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {chartsFor(w.kind, w.view).length > 1 && (
        <>
          <p className={styles.sheetLabel}>Chart</p>
          <Segmented<ChartKind>
            value={chartOf(w)!}
            options={chartsFor(w.kind, w.view).map((id) => ({ id, label: CHART_LABEL[id] }))}
            onChange={(chart) => onChange({ chart })}
          />
        </>
      )}
      {w.kind === "boards" && boards.length > 1 && (
        <>
          <p className={styles.sheetLabel}>Boards</p>
          <div className={styles.chipGrid} role="radiogroup" aria-label="Which boards">
            {[{ key: undefined, name: "All boards" }, ...boards].map((b) => (
              <button key={b.key ?? "all"} role="radio" aria-checked={w.board === b.key} className={`${styles.choice} ${w.board === b.key ? styles.choiceOn : ""}`} onClick={() => onChange({ board: b.key })}>
                {b.name}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Like the chat's + sheet: pick a kind, see it, choose its size and view, add
 * it. On an empty dashboard it opens on a short intro to widgets first, then
 * helps you pick your first one.
 */
export function AddWidgetSheet({ render, boards, intro, onAdd, onStarter, onClose }: {
  render: (w: Widget) => ReactNode;
  boards: BoardSummary[];
  /** Start on the intro. */
  intro: boolean;
  onAdd: (w: Widget) => void;
  /** Fill the dashboard with the suggested set instead. */
  onStarter: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(intro ? 0 : INTRO_STEPS);
  const [draft, setDraft] = useState<Widget | null>(null);
  const learning = step < INTRO_STEPS;
  const title = learning ? "Your dashboard" : draft ? WIDGETS[draft.kind].label : intro ? "Your first widget" : "Add a widget";
  return (
    <Sheet title={title} onClose={onClose}>
      {(close) => learning ? (
        <WidgetIntro step={step} onStep={setStep} onDone={() => setStep(INTRO_STEPS)} />
      ) : draft ? (
        <>
          <button className={g.back} onClick={() => setDraft(null)}><IconBack size={16} />All widgets</button>
          <p className={g.blurb}>{WIDGETS[draft.kind].blurb}</p>
          <Preview w={draft} title={widgetTitle(draft, boards)} render={render} />
          <Options w={draft} boards={boards} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <button className={`${styles.primaryWide} ${g.addBtn}`} onClick={() => close(() => onAdd(draft))}>Add widget</button>
        </>
      ) : (
        <>
          {intro && <p className={g.blurb}>Start with the one thing you check most. You can add more, resize and move them anytime.</p>}
          {WIDGET_GROUPS.map((grp, gi) => (
            <div key={grp.title} className={styles.addGroup}>
              <p className={styles.sheetLabel}>{grp.title}</p>
              <div className={styles.addGrid}>
                {grp.kinds.map((k, i) => (
                  <button key={k} className={styles.addTile} style={{ ["--i" as string]: gi * 3 + i }} onClick={() => setDraft(newWidget(k))}>
                    <span className={styles.addIcon} style={{ background: TONES[GROUP_TONE[grp.title]] }}>{KIND_ICON[k](24)}</span>
                    {WIDGETS[k].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {intro && <button className={g.starter} onClick={() => close(onStarter)}>Or start with a suggested set</button>}
        </>
      )}
    </Sheet>
  );
}

/** One widget's settings: its size, what it shows, or a different widget in its place; and where it sits. */
export function EditWidgetSheet({ w, render, boards, index, count, onSave, onStep, onRemove, onClose }: {
  w: Widget;
  render: (w: Widget) => ReactNode;
  boards: BoardSummary[];
  index: number;
  count: number;
  onSave: (patch: Partial<Widget>) => void;
  onStep: (by: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(w);
  // A different kind keeps the size when it can; the view starts at the kind's first.
  const swap = (kind: WidgetKind) => {
    const spec = WIDGETS[kind];
    setDraft({ id: w.id, kind, view: spec.views[0].id, size: spec.sizes.includes(draft.size) ? draft.size : spec.sizes[spec.sizes.length - 1] });
  };
  return (
    <Sheet title="Edit widget" onClose={onClose} action={{ label: "Done", onClick: () => onSave({ kind: draft.kind, size: draft.size, view: draft.view, board: draft.board, chart: draft.chart }) }}>
      {(close) => (
        <>
          <Preview w={draft} title={widgetTitle(draft, boards)} render={render} />
          <Options w={draft} boards={boards} onChange={(patch) => setDraft({ ...draft, ...patch })} />

          <p className={styles.sheetLabel}>Swap for</p>
          <div className={g.swap}>
            {(Object.keys(WIDGETS) as WidgetKind[]).map((k) => (
              <button key={k} className={`${g.swapChip} ${draft.kind === k ? g.swapOn : ""}`} aria-pressed={draft.kind === k} onClick={() => swap(k)} style={{ ["--tone" as string]: toneOf(k) }}>
                {KIND_ICON[k](15)}
                {WIDGETS[k].label}
              </button>
            ))}
          </div>

          <p className={styles.sheetLabel}>Place</p>
          <div className={g.order}>
            <button disabled={index <= 0} onClick={() => onStep(-1)}>Move up</button>
            <button disabled={index >= count - 1} onClick={() => onStep(1)}>Move down</button>
          </div>

          <button className={`${styles.secondaryWide} ${g.danger}`} onClick={() => close(onRemove)}>Remove widget</button>
        </>
      )}
    </Sheet>
  );
}
