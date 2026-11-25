"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { sortStops } from "@/lib/chat/ops";
import { until } from "@/lib/chat/open";
import {
  addDays, allStops, atMinutes, canEditPlan, costPerPerson, dayLabel, euros, focusDayIndex, fromHhmm,
  hhmm, midnight, minutesOf, parseStopLine, planStatus, rangeLabel, timeLabel, timeParts, toStop,
  type ParsedStop,
} from "@/lib/chat/plan";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, CardOp, Message, PlanCard, PlanDay, PlanStop, Rsvp } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { useCalendar } from "./DatePicker";
import { TimePill } from "./TimeWheel";
import { IconCalendar, IconCheck, IconClose, IconEdit, IconLock, IconPlus, IconRoute, IconTrash } from "./Icons";
import { Sheet, Toggle, uid, useChatUi, useNow, useOptionalChatUi } from "./ui";
import styles from "./chat.module.css";
import s from "./plans.module.css";

type Send = (card: Card, summary: string) => void;

/** How many stops the card shows before "+N more". */
const CARD_STOPS = 5;

const RSVPS: { id: Rsvp; label: string }[] = [
  { id: "going", label: "I’m in" },
  { id: "maybe", label: "Maybe" },
  { id: "no", label: "Can’t" },
];

function Faces({ ids, size = 16 }: { ids: string[]; size?: number }) {
  if (!ids.length) return null;
  return (
    <span className={`${styles.faces} ${s.faces}`}>
      {ids.slice(0, 3).map((id) => {
        const u = userById(id);
        return <Avatar key={id} glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={size} shape="circle" />;
      })}
      {ids.length > 3 && <em>+{ids.length - 3}</em>}
    </span>
  );
}

/** The time column: tabular numerals, am/pm tucked underneath, or "Anytime". */
function Time({ at }: { at: number | null }) {
  if (at === null) return <span className={`${s.time} ${s.anytime}`}>Anytime</span>;
  const t = timeParts(at);
  return <span className={s.time}>{t.main}{t.period && <small>{t.period}</small>}</span>;
}

/** How a line was read: "13:00 · Lunch · Figlmüller · €16". */
function readLine(p: ParsedStop, day: number) {
  return [p.minutes === null ? "Anytime" : timeLabel(atMinutes(day, p.minutes)), p.title, p.place, p.cost ? euros(p.cost) : ""]
    .filter(Boolean).join(" · ");
}

/* ---------------------------------------------------------------------------
   Builder
--------------------------------------------------------------------------- */

/** Today, tomorrow and the coming Saturday (the one after, if that's already today or tomorrow). */
function dayChoices(now: number) {
  const today = midnight(now);
  const tomorrow = addDays(today, 1);
  let sat = addDays(today, (6 - new Date(today).getDay() + 7) % 7);
  if (sat <= tomorrow) sat = addDays(sat, 7);
  return [
    { id: "today", label: "Today", date: today },
    { id: "tomorrow", label: "Tomorrow", date: tomorrow },
    { id: "sat", label: dayLabel(sat), date: sat },
  ];
}

/** One stop as it's being written: separate fields, no syntax to learn. An empty time is "Anytime". */
type DraftStop = { id: string; time: string; title: string; place: string; cost: string };
type DraftDay = { id: string; stops: DraftStop[] };

const blankStop = (): DraftStop => ({ id: uid(), time: "", title: "", place: "", cost: "" });
const blankDay = (): DraftDay => ({ id: uid(), stops: [blankStop()] });
const toParsed = (d: DraftStop): ParsedStop | null => {
  const title = d.title.trim();
  if (!title) return null;
  const price = Number(d.cost.replace(",", "."));
  const p: ParsedStop = { minutes: d.time ? fromHhmm(d.time) : null, title };
  if (d.place.trim()) p.place = d.place.trim();
  if (Number.isFinite(price) && price > 0) p.cost = Math.round(price * 100) / 100;
  return p;
};

const PLAN_STEPS = ["New plan", "When", "Stops", "Review"] as const;

/**
 * New plan, one step at a time: what it's called, the day it starts, the stops
 * (each with its own time, place and price fields), then a look at the whole thing before it's sent.
 */
export function PlanBuilder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const { me } = useChat();
  const [choices] = useState(() => dayChoices(Date.now()));
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(choices[0].date);
  const [days, setDays] = useState<DraftDay[]>(() => [blankDay()]);
  const [everyone, setEveryone] = useState(true);
  /** The stop whose "what" field should take the cursor next (a new row). */
  const focusId = useRef<string | null>(null);
  const custom = !choices.some((c) => c.date === date);
  // Any other day comes from the calendar, from today on.
  const calendar = useCalendar({ value: date, min: choices[0].date, onPick: setDate });

  const parsed = days.map((d) => d.stops.map(toParsed).filter((p): p is ParsedStop => !!p));
  const count = parsed.reduce((n, d) => n + d.length, 0);
  const perPerson = parsed.flat().reduce((n, p) => n + (p.cost ?? 0), 0);

  // After a row is added, the cursor goes to it.
  useEffect(() => {
    if (!focusId.current) return;
    document.querySelector<HTMLInputElement>(`[data-stop-title="${focusId.current}"]`)?.focus();
    focusId.current = null;
  });

  const setStop = (dayId: string, stopId: string, patch: Partial<DraftStop>) => {
    setDays((ds) => ds.map((d) => (d.id !== dayId ? d : { ...d, stops: d.stops.map((x) => (x.id === stopId ? { ...x, ...patch } : x)) })));
  };
  const addStop = (dayId: string, after?: string) => {
    const fresh = blankStop();
    setDays((ds) => ds.map((d) => {
      if (d.id !== dayId) return d;
      const i = after ? d.stops.findIndex((x) => x.id === after) + 1 : d.stops.length;
      return { ...d, stops: [...d.stops.slice(0, i), fresh, ...d.stops.slice(i)] };
    }));
    focusId.current = fresh.id;
  };
  const removeStop = (dayId: string, stopId: string) =>
    setDays((ds) => ds.map((d) => (d.id !== dayId ? d : { ...d, stops: d.stops.length > 1 ? d.stops.filter((x) => x.id !== stopId) : [blankStop()] })));
  const addDay = () => {
    const day = blankDay();
    setDays((ds) => [...ds, day]);
    focusId.current = day.stops[0].id;
  };
  const removeDay = (dayId: string) => setDays((ds) => ds.filter((d) => d.id !== dayId));

  const send = () => {
    const out: PlanDay[] = parsed
      .map((stops, i) => {
        const day = addDays(date, i);
        return { id: uid(), date: day, stops: sortStops(stops.map((p) => toStop(p, day, uid()))) };
      })
      .filter((d) => d.stops.length);
    onSend(
      { type: "plan", title: title.trim(), days: out, rsvps: { [me]: "going" }, everyoneCanEdit: everyone, editors: [] },
      `Plan: ${title.trim()}`,
    );
  };

  const next = () => setStep((n) => n + 1);
  const action = step === 0 ? { label: "Next", disabled: !title.trim(), onClick: next, keepOpen: true }
    : step === 1 ? { label: "Next", onClick: next, keepOpen: true }
      : step === 2 ? { label: "Next", disabled: !count, onClick: next, keepOpen: true }
        : { label: "Send", disabled: !title.trim() || !count, onClick: send };

  return (
    <Sheet
      title={PLAN_STEPS[step]}
      solid
      onClose={onClose}
      onStepBack={step > 0 ? () => setStep((n) => n - 1) : undefined}
      action={action}
    >
      <div className={s.planProgress} role="progressbar" aria-label="New plan" aria-valuemin={1} aria-valuemax={PLAN_STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${PLAN_STEPS.length}`}>
        {PLAN_STEPS.map((name, i) => <i key={name} className={i <= step ? s.planProgressOn : ""} />)}
        <span>Step {step + 1} of {PLAN_STEPS.length}</span>
      </div>
      <div key={step} className={s.planStep}>
        {step === 0 && (
          <>
            <input
              className={styles.bigInput}
              data-autofocus
              placeholder="What’s the plan?"
              aria-label="Plan title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) next(); }}
              enterKeyHint="next"
            />
            <p className={s.planLede}>Give it a name people will recognise, like “Saturday in Vienna”. Next you pick the day, then add the stops one by one.</p>
          </>
        )}

        {step === 1 && (
          <>
            <p className={s.planAsk}>When does it start?</p>
            <div className={styles.chipGrid}>
              {choices.map((c) => (
                <button key={c.id} className={`${styles.choice} ${date === c.date ? styles.choiceOn : ""}`} aria-pressed={date === c.date} onClick={() => setDate(c.date)}>
                  {c.label}
                </button>
              ))}
              <button
                className={`${styles.choice} ${s.dateChip} ${custom ? styles.choiceOn : ""}`}
                aria-pressed={custom}
                aria-haspopup="dialog"
                aria-expanded={calendar.open}
                onClick={(e) => calendar.show(e.currentTarget)}
              >
                <IconCalendar size={15} />
                <span>{custom ? dayLabel(date) : "Other day"}</span>
              </button>
              {calendar.node}
            </div>
            <p className={s.planLede}>{dayLabel(date)}. A plan can run over more days; you add them with its stops.</p>
          </>
        )}

        {step === 2 && (
          <>
            <p className={s.planAsk}>What happens, in order?</p>
            <p className={s.planLede}>Only the name is needed. A stop without a time is “Anytime”.</p>
            {days.map((d, di) => (
              <section key={d.id} className={s.draftDay} aria-label={dayLabel(addDays(date, di))}>
                {days.length > 1 && (
                  <header className={s.draftDayHead}>
                    <b>{dayLabel(addDays(date, di))}</b>
                    {di > 0 && <button type="button" onClick={() => removeDay(d.id)} aria-label={`Remove ${dayLabel(addDays(date, di))}`}><IconTrash size={15} /></button>}
                  </header>
                )}
                <ol className={s.draftStops}>
                  {d.stops.map((x, i) => (
                    <li key={x.id} className={s.draftStop}>
                      <TimePill
                        className={s.draftTime}
                        value={x.time ? fromHhmm(x.time) : null}
                        onChange={(m) => setStop(d.id, x.id, { time: m === null ? "" : hhmm(m) })}
                        label={`Time of stop ${i + 1}`}
                        clearable
                      />
                      <input
                          data-stop-title={x.id}
                          className={s.draftTitle}
                          placeholder={i === 0 ? "e.g. Lunch" : "Next stop"}
                          value={x.title}
                          onChange={(e) => setStop(d.id, x.id, { title: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter" && x.title.trim()) { e.preventDefault(); addStop(d.id, x.id); } }}
                          aria-label={`Stop ${i + 1}`}
                          enterKeyHint="next"
                        />
                      <button type="button" className={s.draftRemove} onClick={() => removeStop(d.id, x.id)} aria-label={`Remove stop ${i + 1}`}><IconClose size={14} /></button>
                      <div className={s.draftMore}>
                        <input placeholder="Where (optional)" value={x.place} onChange={(e) => setStop(d.id, x.id, { place: e.target.value })} aria-label={`Where stop ${i + 1} is`} />
                        <label className={s.draftCost}>
                          <span aria-hidden="true">€</span>
                          <input inputMode="decimal" placeholder="Cost" value={x.cost} onChange={(e) => setStop(d.id, x.id, { cost: e.target.value.replace(/[^\d.,]/g, "") })} aria-label={`Cost per person of stop ${i + 1}`} />
                        </label>
                      </div>
                    </li>
                  ))}
                </ol>
                <button type="button" className={styles.addRow} onClick={() => addStop(d.id)}><IconPlus size={16} /> Add a stop</button>
              </section>
            ))}
            <button type="button" className={`${styles.addRow} ${s.draftAddDay}`} onClick={addDay}><IconCalendar size={16} /> Add {dayLabel(addDays(date, days.length))}</button>
          </>
        )}

        {step === 3 && (
          <>
            <div className={s.reviewHead}>
              <b>{title.trim()}</b>
              <small>
                {[
                  parsed.filter((p) => p.length).length > 1 ? `${dayLabel(date)} – ${dayLabel(addDays(date, parsed.length - 1))}` : dayLabel(date),
                  `${count} ${count === 1 ? "stop" : "stops"}`,
                  perPerson > 0 ? `≈ ${euros(perPerson)} per person` : "",
                ].filter(Boolean).join(" · ")}
              </small>
            </div>
            <div className={s.preview}>
              {parsed.map((stops, i) => stops.length > 0 && (
                <div key={i} className={s.previewDay}>
                  {parsed.length > 1 && <b>{dayLabel(addDays(date, i))}</b>}
                  {[...stops].sort((a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999)).map((p, j) => (
                    <p key={j} className={s.previewRow}>
                      <span className={s.previewTime}>{p.minutes === null ? "Anytime" : timeLabel(atMinutes(date, p.minutes))}</span>
                      <span className={s.previewText}>
                        {p.title}
                        {p.place && <em> · {p.place}</em>}
                        {p.cost ? <i> · {euros(p.cost)}</i> : null}
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className={styles.settingRows}>
              <label className={styles.settingRow}>
                <span><b>Everyone can edit</b><small>{everyone ? "Anyone here can tick, add and change stops." : "Only you change stops. Everyone can still say if they’re in."}</small></span>
                <Toggle on={everyone} onChange={setEveryone} label="Everyone can edit" />
              </label>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Card in the thread
--------------------------------------------------------------------------- */

/** The plan as it sits in the thread; opens the full day in a sheet. */
export function PlanCardView({ message, card, interactive }: { message: Message; card: PlanCard; interactive: boolean }) {
  const { me, cardOp } = useChat();
  const ui = useChatUi();
  const now = useNow(30_000);
  const author = userById(message.authorId);
  const canEdit = canEditPlan(card, message.authorId, me);
  const stops = allStops(card);
  const done = stops.filter((x) => x.doneBy).length;
  const cost = costPerPerson(card);
  const { nowId, next } = planStatus(card, now);

  // From the day that matters now, a window of stops around the first open one.
  const rows = card.days.slice(focusDayIndex(card, now)).flatMap((day) => day.stops.map((stop) => ({ stop, day })));
  const firstOpen = rows.findIndex((r) => !r.stop.doneBy);
  const start = Math.max(0, Math.min(firstOpen < 0 ? 0 : firstOpen - 1, rows.length - CARD_STOPS));
  const shown = rows.slice(start, start + CARD_STOPS);
  const hidden = stops.length - shown.length;

  const open = () => ui.openSheet(<PlanSheet message={message} onClose={ui.closeSheet} />);
  const tick = (stop: PlanStop) => {
    if (!interactive) return;
    if (!canEdit) { ui.toast(`Only ${author.name} can change this plan`); return; }
    cardOp(message, { kind: "plan.tick", stopId: stop.id, by: stop.doneBy ? null : me });
  };
  const answer = (value: Rsvp) => cardOp(message, { kind: "plan.rsvp", userId: me, value: card.rsvps[me] === value ? null : value });
  const who = (r: Rsvp) => Object.keys(card.rsvps).filter((id) => card.rsvps[id] === r);
  const going = who("going");
  const maybe = who("maybe").length;
  const answerLine = [
    going.length ? `${going.length} in` : "",
    maybe ? `${maybe} maybe` : "",
  ].filter(Boolean).join(" · ") || (canEdit ? "Say if you’re in" : `Only ${author.name} can edit`);

  return (
    <div className={styles.card}>
      <p className={styles.cardKicker}>
        <span><IconRoute size={14} /> Plan</span>
        <span>{rangeLabel(card.days)}</span>
      </p>
      <h4 className={styles.cardTitle}>{card.title}</h4>
      {cost > 0 && <p className={styles.cardSub}>≈ {euros(cost)} per person</p>}
      <div className={s.progressRow}>
        <div className={styles.progress} role="progressbar" aria-label="Stops done" aria-valuemin={0} aria-valuemax={stops.length} aria-valuenow={done}>
          <span style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }} />
        </div>
        <span>{done} of {stops.length}</span>
      </div>

      {shown.length ? (
        <ul className={s.stops}>
          {shown.map(({ stop, day }, i) => {
            const isDone = !!stop.doneBy;
            const isNow = stop.id === nowId;
            const isNext = stop.id === next?.id;
            const newDay = card.days.length > 1 && (i === 0 || shown[i - 1].day.id !== day.id);
            return (
              <li key={stop.id} className={s.stopItem}>
                {newDay && <p className={s.dayMark}>{dayLabel(day.date)}</p>}
                <div className={`${s.stop} ${isDone ? s.done : ""} ${isNow || isNext ? s.live : ""}`}>
                  <button
                    className={s.check}
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={stop.title}
                    disabled={!interactive}
                    onClick={() => tick(stop)}
                  >
                    <span className={s.box}>{isDone && <IconCheck size={12} />}</span>
                  </button>
                  <Time at={stop.at} />
                  <span className={s.body}>
                    <span className={s.title}>{stop.title}</span>
                    {(stop.place || isNow || isNext || (stop.owner === me && !isDone)) && (
                      <span className={s.meta}>
                        {isNow && <b className={s.flagNow}><i />Now</b>}
                        {isNext && !isNow && <b className={s.flag}>Next · {until(stop.at! - now)}</b>}
                        {stop.owner === me && !isDone && <b className={s.flagYours}>Yours</b>}
                        {stop.place && <span className={s.metaPlace}>{stop.place}</span>}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.cardSub}>No stops yet.</p>
      )}
      {hidden > 0 && (
        interactive
          ? <button className={s.more} onClick={open}>+{hidden} more</button>
          : <p className={s.moreText}>+{hidden} more</p>
      )}

      <div className={styles.rsvp} role="group" aria-label="Are you in?">
        {RSVPS.map((c) => {
          const on = card.rsvps[me] === c.id;
          return (
            <button key={c.id} className={`${s.rsvpBtn} ${on ? styles.rsvpOn : ""}`} aria-pressed={on} disabled={!interactive} onClick={() => answer(c.id)}>
              {c.label}<em>{who(c.id).length || ""}</em>
            </button>
          );
        })}
      </div>

      <div className={styles.cardFoot}>
        {going.length > 0 && <Faces ids={going} size={18} />}
        <span>{answerLine}</span>
        {interactive && <button className={styles.cardLink} onClick={open}>Open plan</button>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Full plan in a sheet — reads the live card so other tabs' ticks show up
--------------------------------------------------------------------------- */

function PlanSheet({ message, onClose }: { message: Message; onClose: () => void }) {
  const { state, me, cardOp } = useChat();
  const now = useNow(30_000);
  const [editing, setEditing] = useState<string | null>(null);
  const ui = useOptionalChatUi();
  const live = state.data.messages[message.chatId]?.find((m) => m.id === message.id);
  const card = live && !live.deletedAt && live.card?.type === "plan" ? live.card : null;

  if (!card) {
    return (
      <Sheet title="Plan" onClose={onClose}>
        <p className={styles.sheetNote}>This plan was deleted.</p>
      </Sheet>
    );
  }

  const author = userById(message.authorId);
  const canEdit = canEditPlan(card, message.authorId, me);
  const stops = allStops(card);
  const done = stops.filter((x) => x.doneBy).length;
  const cost = costPerPerson(card);
  const status = planStatus(card, now);
  const op = (o: CardOp) => cardOp(message, o);
  const addDay = () => {
    const last = card.days[card.days.length - 1];
    op({ kind: "plan.addDay", day: { id: uid(), date: last ? addDays(last.date, 1) : midnight(now), stops: [] } });
  };
  // A day goes with its stops, no confirm: Undo on the toast brings the day back as it was.
  const removeDay = (day: PlanDay) => {
    op({ kind: "plan.removeDay", dayId: day.id });
    const n = day.stops.length;
    const what = n ? `${dayLabel(day.date)} and its ${n === 1 ? "stop" : `${n} stops`}` : dayLabel(day.date);
    if (ui) ui.toast(`Removed ${what}`, [{ label: "Undo", run: () => op({ kind: "plan.addDay", day }) }]);
  };

  return (
    <Sheet title="Plan" onClose={onClose} action={{ label: "Done", onClick: () => {} }}>
      <div className={s.intro}>
        <PlanTitle title={card.title} canEdit={canEdit} onRename={(title) => op({ kind: "plan.rename", title })} />
        <p>
          {rangeLabel(card.days)} · {done} of {stops.length} done
          {cost > 0 && <> · ≈ {euros(cost)} per person</>}
        </p>
        {!canEdit && <p className={s.introNote}><IconLock size={12} /> Only {author.name} can change stops. You can still say if you’re in.</p>}
      </div>

      {card.days.map((day, i) => (
        <section key={day.id} className={s.day} aria-label={dayLabel(day.date)}>
          <header className={s.dayHead}>
            <b>{midnight(now) === day.date ? "Today" : dayLabel(day.date)}</b>
            {card.days.length > 1 && <span>Day {i + 1}</span>}
            <em>{day.stops.filter((x) => x.doneBy).length} of {day.stops.length}</em>
            {canEdit && card.days.length > 1 && (
              <button type="button" className={s.dayRemove} onClick={() => removeDay(day)} aria-label={`Remove ${dayLabel(day.date)}`}>
                <IconTrash size={16} />
              </button>
            )}
          </header>
          {day.stops.length > 0 && (
            <ul className={s.group}>
              {day.stops.map((stop) => (
                editing === stop.id && canEdit ? (
                  <StopEditor
                    key={stop.id}
                    stop={stop}
                    day={day}
                    onCancel={() => setEditing(null)}
                    onSave={(patch) => { if (Object.keys(patch).length) op({ kind: "plan.editStop", stopId: stop.id, patch }); setEditing(null); }}
                    onRemove={() => { op({ kind: "plan.removeStop", stopId: stop.id }); setEditing(null); }}
                  />
                ) : (
                  <SheetStop
                    key={stop.id}
                    stop={stop}
                    me={me}
                    now={now}
                    isNow={stop.id === status.nowId}
                    isNext={stop.id === status.next?.id}
                    canEdit={canEdit}
                    onTick={() => op({ kind: "plan.tick", stopId: stop.id, by: stop.doneBy ? null : me })}
                    onEdit={() => setEditing(stop.id)}
                  />
                )
              ))}
            </ul>
          )}
          {canEdit && <AddStop day={day} onAdd={(stop) => op({ kind: "plan.addStop", dayId: day.id, stop })} />}
          {!canEdit && !day.stops.length && <p className={styles.sheetNote}>Nothing planned yet.</p>}
        </section>
      ))}

      {canEdit && (
        <button className={styles.addRow} onClick={addDay}>
          <IconPlus size={16} /> Add a day
        </button>
      )}
    </Sheet>
  );
}

/** The plan's name, changed in place by whoever can change its stops. Escape puts back what it was. */
function PlanTitle({ title, canEdit, onRename }: { title: string; canEdit: boolean; onRename: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!canEdit) return <h2>{title}</h2>;
  if (draft === null) {
    return (
      <h2>
        <button type="button" className={s.titleBtn} onClick={() => setDraft(title)} aria-label={`Rename “${title}”`}>
          {title}
          <IconEdit size={16} />
        </button>
      </h2>
    );
  }
  const save = () => {
    const next = draft.trim();
    setDraft(null);
    if (next && next !== title) onRename(next);
  };
  return (
    <input
      className={s.titleInput}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
      }}
      aria-label="Plan name"
      enterKeyHint="done"
      maxLength={80}
    />
  );
}

function SheetStop({ stop, me, now, isNow, isNext, canEdit, onTick, onEdit }: {
  stop: PlanStop;
  me: string;
  now: number;
  isNow: boolean;
  isNext: boolean;
  canEdit: boolean;
  onTick: () => void;
  onEdit: () => void;
}) {
  const isDone = !!stop.doneBy;
  const owner = stop.owner ? userById(stop.owner) : null;
  const body = (
    <>
      <span className={s.title}>{stop.title}</span>
      {stop.place && <span className={s.place}>{stop.place}</span>}
      {stop.note && <span className={s.note}>{stop.note}</span>}
      {(isNow || isNext || owner || stop.cost || stop.doneBy) && (
        <span className={s.facts}>
          {isNow && <b className={s.flagNow}><i />Now</b>}
          {isNext && !isNow && <b className={s.flag}>Next · {until(stop.at! - now)}</b>}
          {stop.cost ? <span>{euros(stop.cost)} each</span> : null}
          {owner && (
            <span className={s.owner}>
              <Avatar glyph={initials(owner.fullName)} tone={owner.tone} photo={owner.photo} size={16} shape="circle" />
              {stop.owner === me ? "You’re on it" : owner.name}
            </span>
          )}
          {stop.doneBy && <span>Done by {stop.doneBy === me ? "you" : userById(stop.doneBy).name}</span>}
        </span>
      )}
    </>
  );
  return (
    <li className={`${s.stop} ${s.sheetStop} ${isDone ? s.done : ""} ${isNow || isNext ? s.live : ""}`}>
      <button className={s.check} role="checkbox" aria-checked={isDone} aria-label={stop.title} disabled={!canEdit} onClick={onTick}>
        <span className={s.box}>{isDone && <IconCheck size={12} />}</span>
      </button>
      <Time at={stop.at} />
      {canEdit ? (
        <button className={`${s.body} ${s.bodyBtn}`} onClick={onEdit} aria-label={`Edit ${stop.title}`}>{body}</button>
      ) : (
        <span className={s.body}>{body}</span>
      )}
    </li>
  );
}

function StopEditor({ stop, day, onSave, onCancel, onRemove }: {
  stop: PlanStop;
  day: PlanDay;
  onSave: (patch: Partial<Omit<PlanStop, "id" | "doneBy">>) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const { me } = useChat();
  const ui = useChatUi();
  const [title, setTitle] = useState(stop.title);
  const [time, setTime] = useState(stop.at === null ? "" : hhmm(minutesOf(stop.at)));
  const [place, setPlace] = useState(stop.place ?? "");
  const [note, setNote] = useState(stop.note ?? "");
  const [cost, setCost] = useState(stop.cost ? String(stop.cost) : "");
  const [owner, setOwner] = useState<string | null>(stop.owner ?? null);
  const people = [me, ...ui.members.map((u) => u.id).filter((id) => id !== me)];
  if (owner && !people.includes(owner)) people.push(owner);

  const save = () => {
    const minutes = fromHhmm(time);
    const at = minutes === null ? null : atMinutes(day.date, minutes);
    const price = Number(cost.replace(",", "."));
    // Cleared fields are sent as empty values, never undefined, so the clear syncs.
    const next = {
      title: title.trim() || stop.title,
      at,
      place: place.trim(),
      note: note.trim(),
      cost: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 0,
      owner,
    };
    const patch: Partial<Omit<PlanStop, "id" | "doneBy">> = {};
    if (next.title !== stop.title) patch.title = next.title;
    if (next.at !== stop.at) patch.at = next.at;
    if (next.place !== (stop.place ?? "")) patch.place = next.place;
    if (next.note !== (stop.note ?? "")) patch.note = next.note;
    if (next.cost !== (stop.cost ?? 0)) patch.cost = next.cost;
    if (next.owner !== (stop.owner ?? null)) patch.owner = next.owner;
    onSave(patch);
  };

  return (
    <li className={s.editor}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className={s.field}>
          <span>Stop</span>
          <input className={styles.plainInput} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className={s.fieldPair}>
          <label className={s.field}>
            <span>Time</span>
            <TimePill
              className={s.editorTime}
              value={time ? fromHhmm(time) : null}
              onChange={(m) => setTime(m === null ? "" : hhmm(m))}
              label="Time"
              clearable
            />
          </label>
          <label className={s.field}>
            <span>€ per person</span>
            <input className={styles.plainInput} inputMode="decimal" placeholder="Free" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ""))} />
          </label>
        </div>
        <label className={s.field}>
          <span>Place</span>
          <input className={styles.plainInput} placeholder="Where" value={place} onChange={(e) => setPlace(e.target.value)} />
        </label>
        <label className={s.field}>
          <span>Note</span>
          <input className={styles.plainInput} placeholder="Tickets, booking name, what to bring" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className={s.field} role="group" aria-label="Who’s on it">
          <span>Who’s on it</span>
          <div className={s.owners}>
            {[null, ...people].map((id) => {
              const u = id ? userById(id) : null;
              const on = owner === id;
              return (
                <button key={id ?? "none"} type="button" className={`${styles.choice} ${s.ownerChip} ${on ? styles.choiceOn : ""}`} aria-pressed={on} onClick={() => setOwner(id)}>
                  {u && <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={20} shape="circle" />}
                  {id === null ? "Nobody" : id === me ? "You" : u!.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className={s.editActions}>
          <button type="button" className={s.removeBtn} onClick={onRemove}><IconTrash size={16} /> Remove</button>
          <button type="button" className={s.btn} onClick={onCancel}>Cancel</button>
          <button type="submit" className={`${s.btn} ${s.btnPrimary}`}>Save</button>
        </div>
      </form>
    </li>
  );
}

function AddStop({ day, onAdd }: { day: PlanDay; onAdd: (stop: PlanStop) => void }) {
  const [draft, setDraft] = useState("");
  const parsed = parseStopLine(draft);
  const add = () => {
    if (!parsed) return;
    onAdd(toStop(parsed, day.date, uid()));
    setDraft("");
  };
  return (
    <form className={s.addStop} onSubmit={(e) => { e.preventDefault(); add(); }}>
      <div className={s.addField}>
        <IconPlus size={16} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="15:30 Coffee @ Café Central"
          aria-label={`Add a stop on ${dayLabel(day.date)}`}
          enterKeyHint="done"
        />
        {parsed && <button type="submit" className={s.addBtn}>Add</button>}
      </div>
      {parsed && <p className={s.addPreview}>{readLine(parsed, day.date)}</p>}
    </form>
  );
}
