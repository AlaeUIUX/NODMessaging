"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/chat/haptics";
import { placeNear, useCalendar, type CalendarPlace } from "./DatePicker";
import { useDialog } from "./ui";
import f from "./datepicker.module.css";
import t from "./timewheel.module.css";

/**
 * A time, the way iOS asks for one in a form: the time in a pill (UIDatePicker,
 * compact style) that pops the wheels up beside it (the .wheels style: hour,
 * minute and, where the region uses it, AM/PM). The wheels spin and snap like
 * the real ones, loop round, tick on every step, and set the time as they turn;
 * tapping outside closes them. Minutes go in steps of 5, as in Calendar
 * (minuteInterval = 5).
 *
 * This is a stand-in so the prototype shows the element to use; on iPhone it's
 * the system UIDatePicker, not a copy of it. Plans, events and Mind reminders
 * all use it, next to the calendar pill (DatePicker) for days.
 */

const ITEM = 34;
const ROWS = 7;
const POP_W = 260;
const FOOT = 48;
const popH = (clearable: boolean) => ITEM * ROWS + 20 + (clearable ? FOOT : 0);

/** True where the region writes "9:30 PM" rather than "21:30". */
export function uses12h() {
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
    return hc === "h11" || hc === "h12";
  } catch {
    return true;
  }
}

/** Minutes since midnight as the person's region writes a time: "9:30 AM", "21:30". */
export const timeText = (min: number) =>
  new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * One wheel. Its rows sit on a drum: each tilts away and fades the further it
 * is from the middle, where the band marks the choice. A looping wheel repeats
 * its rows and quietly jumps back to the middle copy once it rests, so it
 * never runs out.
 */
function Wheel({ count, initial, loop, text, label, onPick, autoFocus }: {
  count: number;
  initial: number;
  loop: boolean;
  text: (i: number) => string;
  label: string;
  onPick: (i: number) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reps = loop ? 5 : 1;
  const base = loop ? Math.floor(reps / 2) * count : 0;
  const row = useRef(base + initial);
  const at = useRef(initial);
  const [now, setNow] = useState(initial);
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paint = () => {
    const el = ref.current;
    if (!el) return;
    const pos = el.scrollTop / ITEM;
    const first = Math.max(0, Math.floor(pos) - 5);
    const last = Math.min(count * reps - 1, Math.ceil(pos) + 5);
    for (let i = first; i <= last; i++) {
      const k = el.children[i] as HTMLElement | undefined;
      if (!k) continue;
      const off = i - pos;
      k.style.transform = `rotateX(${(-off * 20).toFixed(2)}deg)`;
      k.style.opacity = String(Math.max(.12, 1 - Math.abs(off) * .26));
    }
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = row.current * ITEM;
    paint();
    if (autoFocus) el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (rest.current) clearTimeout(rest.current); }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    paint();
    const r = Math.round(el.scrollTop / ITEM);
    if (r !== row.current) {
      row.current = r;
      const i = ((r % count) + count) % count;
      if (i !== at.current) {
        at.current = i;
        setNow(i);
        haptic(4);
        onPick(i);
      }
    }
    if (rest.current) clearTimeout(rest.current);
    rest.current = setTimeout(() => {
      // Resting far from the middle copy: hop back to it, the same row on screen, so it can keep looping.
      if (!loop || !ref.current) return;
      const target = base + at.current;
      if (Math.abs(row.current - target) >= count) {
        ref.current.scrollTop += (target - row.current) * ITEM;
        row.current = target;
        paint();
      }
    }, 180);
  };

  const by = (n: number) => ref.current?.scrollBy({ top: n * ITEM, behavior: "smooth" });

  return (
    <div
      ref={ref}
      className={t.wheel}
      onScroll={onScroll}
      tabIndex={0}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={now}
      aria-valuetext={text(now)}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      onKeyDown={(e) => {
        const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
        if (!(e.key in steps)) return;
        e.preventDefault();
        by(steps[e.key]);
      }}
    >
      {Array.from({ length: count * reps }, (_, i) => (
        <div key={i} className={t.item} aria-hidden="true" onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: "smooth" })}>
          {text(i % count)}
        </div>
      ))}
    </div>
  );
}

function TimePopover({ place, value, step, clearable, empty, onPick, onClose }: {
  place: CalendarPlace;
  value: number;
  step: number;
  clearable: boolean;
  empty: string;
  onPick: (min: number | null) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const close = () => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    setTimeout(onClose, 160);
  };
  useDialog(rootRef, close);

  const twelve = uses12h();
  const perHour = 60 / step;
  const h = Math.floor(value / 60);
  // Where each wheel starts; `parts` then follows them as they turn.
  const [initial] = useState(() => ({ hour: twelve ? h % 12 : h, minute: Math.round((value % 60) / step) % perHour, pm: h >= 12 ? 1 : 0 }));
  const parts = useRef({ ...initial });
  const emit = () => {
    const p = parts.current;
    const hours = twelve ? (p.hour % 12) + (p.pm ? 12 : 0) : p.hour;
    onPick(hours * 60 + p.minute * step);
  };
  const ampm = [new Date(2000, 0, 1, 9).toLocaleTimeString(undefined, { hour: "numeric", hour12: true }), new Date(2000, 0, 1, 21).toLocaleTimeString(undefined, { hour: "numeric", hour12: true })]
    .map((s) => s.replace(/[\d\s ]/g, "") || "AM");

  return (
    <div ref={rootRef} className={`${f.calLayer} ${closing ? f.calClosing : ""}`} role="dialog" aria-modal="true" aria-label="Choose a time">
      <div className={f.calScrim} onClick={close} />
      <div className={`${f.cal} ${t.pop}`} style={{ top: place.top, left: place.left, ["--origin" as string]: place.origin }}>
        <div className={t.wheels} style={{ ["--item" as string]: `${ITEM}px`, ["--rows" as string]: ROWS }}>
          <span className={t.band} aria-hidden="true" />
          <Wheel
            count={twelve ? 12 : 24}
            initial={initial.hour}
            loop
            label="Hour"
            text={(i) => (twelve ? String(i === 0 ? 12 : i) : String(i).padStart(2, "0"))}
            onPick={(i) => { parts.current.hour = i; emit(); }}
            autoFocus
          />
          <Wheel
            count={perHour}
            initial={initial.minute}
            loop
            label="Minutes"
            text={(i) => String(i * step).padStart(2, "0")}
            onPick={(i) => { parts.current.minute = i; emit(); }}
          />
          {twelve && (
            <Wheel
              count={2}
              initial={initial.pm}
              loop={false}
              label="AM or PM"
              text={(i) => ampm[i]}
              onPick={(i) => { parts.current.pm = i; emit(); }}
            />
          )}
        </div>
        {clearable && (
          <button type="button" className={t.clear} onClick={() => { onPick(null); close(); }}>
            {empty}
          </button>
        )}
      </div>
    </div>
  );
}

/** The wheels, popping up from whatever was pressed: `show(button)` opens them there, `node` is the popover. */
export function useTimeWheel({ value, onPick, step = 5, clearable = false, empty = "Anytime", start = 12 * 60 }: {
  value: number | null;
  onPick: (min: number | null) => void;
  step?: number;
  /** Adds a button under the wheels that takes the time away (a plan stop's "Anytime"). */
  clearable?: boolean;
  empty?: string;
  /** Where the wheels start while there's no time yet. */
  start?: number;
}) {
  const [place, setPlace] = useState<CalendarPlace | null>(null);
  const current = value ?? start;
  return {
    open: !!place,
    show: (el: HTMLElement) => {
      setPlace(placeNear(el, POP_W, popH(clearable)));
      // Opening on an empty time sets the time the wheels show, as iOS does.
      if (value === null) onPick(current);
    },
    node: place ? createPortal(
      <TimePopover place={place} value={current} step={step} clearable={clearable} empty={empty} onPick={onPick} onClose={() => setPlace(null)} />,
      place.screen,
    ) : null,
  };
}

/** The time in a pill; tapping it opens the wheels. `null` shows `empty` ("Anytime"). */
export function TimePill({ value, onChange, label, empty = "Anytime", clearable = false, step, className }: {
  value: number | null;
  onChange: (min: number | null) => void;
  label: string;
  empty?: string;
  clearable?: boolean;
  step?: number;
  className?: string;
}) {
  const wheel = useTimeWheel({ value, onPick: onChange, step, clearable, empty });
  const shown = value === null ? empty : timeText(value);
  return (
    <>
      <button
        type="button"
        className={[f.datePill, wheel.open ? f.datePillOn : "", value === null ? f.datePillEmpty : "", className ?? ""].filter(Boolean).join(" ")}
        onClick={(e) => wheel.show(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={wheel.open}
        aria-label={`${label}, ${shown}`}
      >
        {shown}
      </button>
      {wheel.node}
    </>
  );
}

/** A form row: a label, then the time in its pill. */
export function TimeField({ label, ...pill }: Parameters<typeof TimePill>[0]) {
  return (
    <div className={f.dateRow}>
      <span>{label}</span>
      <TimePill label={label} {...pill} />
    </div>
  );
}

/**
 * A moment, the way Calendar asks for an event's start: one row, the day in
 * one pill (the calendar) and the time in another (the wheels).
 */
export function DateTimeField({ label, value, onChange, min }: { label: string; value: number; onChange: (ms: number) => void; min?: number }) {
  const cal = useCalendar({ value, min, onPick: onChange });
  const d = new Date(value);
  const minutes = d.getHours() * 60 + d.getMinutes();
  return (
    <div className={f.dateRow}>
      <span>{label}</span>
      <span className={t.pills}>
        <button
          type="button"
          className={`${f.datePill} ${cal.open ? f.datePillOn : ""}`}
          onClick={(e) => cal.show(e.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={cal.open}
          aria-label={`${label} day, ${d.toLocaleDateString(undefined, { dateStyle: "full" })}`}
        >
          {d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </button>
        <TimePill
          label={`${label} time`}
          value={minutes}
          onChange={(m) => {
            if (m === null) return;
            const next = new Date(value);
            next.setHours(Math.floor(m / 60), m % 60, 0, 0);
            onChange(next.getTime());
          }}
        />
        {cal.node}
      </span>
    </div>
  );
}
