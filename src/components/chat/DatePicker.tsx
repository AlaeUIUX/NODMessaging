"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBack, IconChevron } from "./Icons";
import { useDialog } from "./ui";
import f from "./datepicker.module.css";

/**
 * Picking a day the way iOS does it in a form: the date in a pill that pops a
 * calendar up beside it (the compact date picker). The month title opens a
 * month and year picker; arrow keys move between days. Mind, plans and task
 * due dates all use it.
 */

const CAL_W = 316;
const CAL_H = 356;
const today = () => new Date();
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** 0 for Sunday, 1 for Monday: the first column of the calendar, as the person's region has it. */
function firstWeekday() {
  if (typeof navigator === "undefined") return 1;
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const day = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay;
    if (day) return day % 7;
  } catch { /* older browsers */ }
  return /^(en-US|en-CA|ja|ko|zh-TW|he|pt-BR)/i.test(navigator.language) ? 0 : 1;
}

type CalendarPlace = { screen: HTMLElement; top: number; left: number; origin: string };

/** Where the calendar goes for what was pressed: under it if there's room, else above, over the whole screen. */
function placeNear(el: HTMLElement): CalendarPlace {
  // The screen the sheet sits on, not the sheet: a sheet scrolls and would clip it.
  const screen = (el.closest('[role="dialog"]')?.parentElement ?? document.body) as HTMLElement;
  const box = screen.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const w = Math.min(CAL_W, box.width - 24);
  const left = Math.max(12, Math.min(r.right - box.left - w, box.width - w - 12));
  const below = r.bottom - box.top + 8;
  const top = below + CAL_H <= box.height - 24 ? below : Math.max(56, r.top - box.top - 8 - CAL_H);
  return { screen, top, left, origin: `${r.left + r.width / 2 - box.left - left}px ${top === below ? 0 : CAL_H}px` };
}

/**
 * The calendar, popping up from whatever was pressed: `show(button)` opens
 * it there, and `node` (rendered anywhere) is the calendar itself. Picking a
 * day keeps the time of day `value` had. Days before `min` can't be picked.
 */
export function useCalendar({ value, onPick, min }: { value: number; onPick: (ts: number) => void; min?: number }) {
  const [place, setPlace] = useState<CalendarPlace | null>(null);
  return {
    open: !!place,
    show: (el: HTMLElement) => setPlace(placeNear(el)),
    node: place ? createPortal(<Calendar place={place} value={value} min={min} onPick={onPick} onClose={() => setPlace(null)} />, place.screen) : null,
  };
}

/**
 * A date, the way iOS asks for one in a form: a row with a label and the date
 * in a pill. Tapping the pill pops a calendar up beside it; picking a day sets
 * it and closes. With no date yet, the pill says so and the calendar opens on
 * `start` (today by default).
 */
export function DateField({ label, value, onChange, empty = "Choose", start, set }: {
  label: string;
  value: number | null;
  onChange: (ts: number) => void;
  /** What the pill says while there's no date. */
  empty?: string;
  /** The day the calendar opens on, and the time of day a pick gets, while there's no date. */
  start?: number;
  /** Ring the row: the date is one the person chose rather than a preset. */
  set?: boolean;
}) {
  const cal = useCalendar({ value: value ?? start ?? today().getTime(), onPick: onChange });
  const d = value === null ? null : new Date(value);
  return (
    <div className={`${f.dateRow} ${set ? f.dateRowSet : ""}`}>
      <span>{label}</span>
      <button
        type="button"
        className={`${f.datePill} ${cal.open ? f.datePillOn : ""} ${d ? "" : f.datePillEmpty}`}
        onClick={(e) => cal.show(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={cal.open}
        aria-label={`${label}, ${d ? d.toLocaleDateString(undefined, { dateStyle: "full" }) : "no date"}`}
      >
        {d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : empty}
      </button>
      {cal.node}
    </div>
  );
}

function Calendar({ place, value, min, onPick, onClose }: { place: CalendarPlace; value: number; min?: number; onPick: (ts: number) => void; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const picked = new Date(value);
  const [month, setMonth] = useState(() => new Date(picked.getFullYear(), picked.getMonth(), 1));
  const [view, setView] = useState<"days" | "months">("days");
  const [focus, setFocus] = useState(() => new Date(picked.getFullYear(), picked.getMonth(), picked.getDate()));
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const byKeys = useRef(false);

  const close = () => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    setTimeout(onClose, 160);
  };
  useDialog(rootRef, close);
  // The chosen day takes focus, so arrow keys work straight away.
  useEffect(() => { rootRef.current?.querySelector<HTMLElement>("[data-focus]")?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!byKeys.current) return;
    byKeys.current = false;
    rootRef.current?.querySelector<HTMLElement>("[data-focus]")?.focus({ preventScroll: true });
  }, [focus]);

  const y = month.getFullYear();
  const m = month.getMonth();
  const first = firstWeekday();
  const lead = (new Date(y, m, 1).getDay() - first + 7) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - lead + i));
  const now = today();
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((first + i) % 7)));
  const focusInMonth = focus.getFullYear() === y && focus.getMonth() === m;
  const floor = min === undefined ? null : new Date(new Date(min).getFullYear(), new Date(min).getMonth(), new Date(min).getDate()).getTime();
  const tooEarly = (d: Date) => floor !== null && d.getTime() < floor;

  const pick = (d: Date) => {
    onPick(new Date(d.getFullYear(), d.getMonth(), d.getDate(), picked.getHours(), picked.getMinutes()).getTime());
    close();
  };
  const move = (d: Date) => {
    byKeys.current = true;
    setFocus(d);
    if (d.getFullYear() !== y || d.getMonth() !== m) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const onKey = (e: React.KeyboardEvent, d: Date) => {
    const at = (days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    const steps: Record<string, () => Date> = {
      ArrowLeft: () => at(-1),
      ArrowRight: () => at(1),
      ArrowUp: () => at(-7),
      ArrowDown: () => at(7),
      PageUp: () => new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), 28)),
      PageDown: () => new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), 28)),
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    move(step());
  };

  return (
    <div ref={rootRef} className={`${f.calLayer} ${closing ? f.calClosing : ""}`} role="dialog" aria-modal="true" aria-label="Choose a date">
      <div className={f.calScrim} onClick={close} />
      <div className={f.cal} style={{ top: place.top, left: place.left, ["--origin" as string]: place.origin }}>
        <div className={f.calHead}>
          <button type="button" className={f.calTitle} onClick={() => setView((v) => (v === "days" ? "months" : "days"))} aria-expanded={view === "months"}>
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            <span className={view === "months" ? f.calTurned : undefined}><IconChevron size={14} /></span>
          </button>
          {view === "days" && (
            <span className={f.calNav}>
              <button type="button" onClick={() => setMonth(new Date(y, m - 1, 1))} disabled={floor !== null && new Date(y, m, 1).getTime() <= floor} aria-label="Previous month"><IconBack size={18} /></button>
              <button type="button" onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="Next month"><IconChevron size={18} /></button>
            </span>
          )}
        </div>

        {view === "days" ? (
          <>
            <div className={f.calWeek} aria-hidden="true">
              {weekdays.map((w) => <span key={w.getDay()}>{w.toLocaleDateString(undefined, { weekday: "narrow" })}</span>)}
            </div>
            <div className={f.calDays}>
              {cells.map((d) => {
                if (d.getMonth() !== m) return <span key={dayKey(d)} />;
                const on = sameDay(d, picked);
                const tabbable = focusInMonth ? sameDay(d, focus) : d.getDate() === 1;
                return (
                  <button
                    key={dayKey(d)}
                    type="button"
                    className={[f.day, sameDay(d, now) ? f.dayToday : "", on ? f.dayOn : ""].filter(Boolean).join(" ")}
                    tabIndex={tabbable ? 0 : -1}
                    data-focus={tabbable || undefined}
                    disabled={tooEarly(d)}
                    aria-pressed={on}
                    aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
                    onClick={() => pick(d)}
                    onKeyDown={(e) => onKey(e, d)}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className={f.calMonths}>
            <div className={f.calYear}>
              <button type="button" onClick={() => setMonth(new Date(y - 1, m, 1))} aria-label="Previous year"><IconBack size={18} /></button>
              <b>{y}</b>
              <button type="button" onClick={() => setMonth(new Date(y + 1, m, 1))} aria-label="Next year"><IconChevron size={18} /></button>
            </div>
            <div className={f.calMonthGrid}>
              {Array.from({ length: 12 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === m ? f.monthOn : undefined}
                  aria-pressed={i === m}
                  data-focus={i === m || undefined}
                  onClick={() => { setMonth(new Date(y, i, 1)); setView("days"); }}
                >
                  {new Date(2024, i, 1).toLocaleDateString(undefined, { month: "short" })}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
