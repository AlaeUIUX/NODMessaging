"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { IconArrowRight, IconBack, IconClose } from "@/components/chat/Icons";
import PlayInView from "@/components/updates/PlayInView";
import { animateSpring, SPRINGS, VelocityTracker } from "@/lib/chat/motion";
import { People, Stage } from "./parts";
import { WEEKS, weekRange, type Week } from "./weeks";
import s from "./changelog.module.css";

/** A flick this fast (px/s), or a drag past half the sheet, lets it go (the case studies' numbers). */
const FLICK = 500;
const LET_GO = 0.5;
const RISE = { response: .5, damping: 1 };

/**
 * One week, on a sheet that rises from the bottom over the list, which stays
 * where it was under a dim. It stops short of the top and scrolls on its own.
 * Its top bar is the handle: drag it down (or flick it) to close, or use the
 * cross or Escape. Older and newer weeks are at the end.
 */
export default function WeekSheet({ week, section, leaving, onClosed, onGo }: {
  week: Week;
  section?: string;
  leaving: boolean;
  onClosed: () => void;
  onGo: (slug: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => { x: number; v: number }) | null>(null);
  const y = useRef(0);
  const gone = useRef(false);
  const opener = useRef<Element | null>(null);

  const place = useCallback((v: number) => {
    y.current = v;
    const h = panel.current?.offsetHeight || window.innerHeight;
    if (panel.current) panel.current.style.transform = `translate3d(0, ${v}px, 0)`;
    if (dim.current) dim.current.style.opacity = String(Math.max(0, 1 - v / h));
  }, []);

  const close = useCallback((velocity = 0) => {
    if (gone.current) return;
    gone.current = true;
    stop.current?.();
    const h = panel.current?.offsetHeight || window.innerHeight;
    stop.current = animateSpring({
      from: y.current, to: h, velocity, spring: SPRINGS.exit, onFrame: place,
      onDone: () => {
        (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
        onClosed();
      },
    });
  }, [onClosed, place]);

  // Rise from below, keep the page still behind it, and start at the section asked for.
  useLayoutEffect(() => {
    opener.current = document.activeElement;
    const h = panel.current?.offsetHeight || window.innerHeight;
    place(h);
    stop.current = animateSpring({ from: h, to: 0, spring: RISE, onFrame: place });
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    if (section) {
      const el = scroller.current?.querySelector<HTMLElement>(`#s-${section}`);
      if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 72;
    }
    return () => {
      stop.current?.();
      root.style.overflow = was;
    };
  }, [place, section]);

  useEffect(() => { if (leaving) close(); }, [leaving, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Dragging the bar: the sheet follows the finger 1:1 downwards, resists going up.
  const drag = useRef<{ id: number; y0: number; from: number; track: VelocityTracker } | null>(null);
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button") || gone.current) return;
    const from = stop.current?.().x ?? y.current;
    const track = new VelocityTracker();
    track.reset(e.timeStamp, e.clientY);
    drag.current = { id: e.pointerId, y0: e.clientY, from, track };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.track.add(e.timeStamp, e.clientY);
    const raw = d.from + e.clientY - d.y0;
    place(raw < 0 ? raw * .2 : raw);
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const v = d.track.velocity();
    const h = panel.current?.offsetHeight || window.innerHeight;
    if (v > FLICK || y.current > h * LET_GO) close(v);
    else stop.current = animateSpring({ from: y.current, to: 0, velocity: v, spring: SPRINGS.settle, onFrame: place });
  };

  const i = WEEKS.findIndex((w) => w.slug === week.slug);
  const newer = WEEKS[i - 1];
  const older = WEEKS[i + 1];

  return (
    <div className={s.sheetRoot} role="presentation">
      <div ref={dim} className={s.dim} onClick={() => close()} aria-hidden="true" />
      <div
        ref={panel}
        className={s.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
      >
        <div ref={scroller} className={s.scroller}>
          <div className={s.bar} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <span className={s.handle} aria-hidden="true" />
            <button type="button" className={s.close} onClick={() => close()} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>

          <PlayInView key={week.slug} className={s.story}>
            <header className={s.storyHead}>
              <span className={s.weekNo}>Week {week.n} · {weekRange(week)}{week.open && <span className={s.now}>This week</span>}</span>
              <h1 id="sheet-title">{week.title}</h1>
              {week.summary.map((p, n) => <p key={n} className={s.storyLede}>{p}</p>)}
              <People names={week.people} />
            </header>

            {week.sections.map((x) => (
              <section key={x.id} id={`s-${x.id}`} className={s.part} aria-labelledby={`h-${x.id}`}>
                <h2 id={`h-${x.id}`}>{x.title}{x.tag && <span className={s.tag}>{x.tag}</span>}</h2>
                {x.text.map((p, n) => <p key={n}>{p}</p>)}
                {x.try && <p className={s.try}><b>Try it:</b> {x.try}</p>}
                {x.media && <figure className={s.figure}><Stage media={x.media} week={week} big />{x.media.length === 1 && <figcaption>{x.media[0].alt}</figcaption>}</figure>}
              </section>
            ))}

            <nav className={s.pager} aria-label="Other weeks">
              {older ? (
                <button type="button" onClick={() => { onGo(older.slug); scroller.current?.scrollTo({ top: 0 }); }}>
                  <small><IconBack size={14} /> Week {older.n}</small>{older.title}
                </button>
              ) : <span />}
              {newer && (
                <button type="button" className={s.pagerNext} onClick={() => { onGo(newer.slug); scroller.current?.scrollTo({ top: 0 }); }}>
                  <small>Week {newer.n} <IconArrowRight size={14} /></small>{newer.title}
                </button>
              )}
            </nav>
          </PlayInView>
        </div>
      </div>
    </div>
  );
}
