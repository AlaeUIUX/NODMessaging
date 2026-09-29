"use client";

import { useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { sortStops } from "@/lib/chat/ops";
import { until } from "@/lib/chat/open";
import {
  addDays, allStops, atMinutes, canEditPlan, costPerPerson, dayLabel, euros, focusDayIndex, fromHhmm, fromIsoDate,
  hhmm, isoDate, midnight, minutesOf, parsePlanText, parseStopLine, planStatus, rangeLabel, timeLabel, timeParts, toStop,
  type ParsedStop,
} from "@/lib/chat/plan";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, CardOp, Message, PlanCard, PlanDay, PlanStop, Rsvp } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconCalendar, IconCheck, IconLock, IconPlus, IconRoute, IconTrash } from "./Icons";
import { Sheet, Toggle, uid, useChatUi, useNow } from "./ui";
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

const TEMPLATES: { id: string; label: string; title: string; lines: string }[] = [
  {
    id: "trip",
    label: "Trip day",
    title: "A day in Lisbon",
    lines: [
      "9:00 Pastéis de nata @ Manteigaria €3",
      "10:00 Tram 28 up to Alfama €3",
      "11:00 Castelo de São Jorge €15",
      "13:30 Lunch @ Time Out Market €20",
      "16:00 LX Factory and Ler Devagar",
      "19:00 Sunset @ Miradouro da Senhora do Monte",
      "20:30 Dinner @ Cervejaria Ramiro €35",
    ].join("\n"),
  },
  {
    id: "launch",
    label: "Launch day",
    title: "Launch day",
    lines: [
      "8:30 Final checks @ Office",
      "9:45 Stand-up: go or no-go",
      "10:00 Go live",
      "10:15 Announce on LinkedIn and the blog",
      "12:30 Team lunch @ Brasserie Lipp €25",
      "15:00 First numbers review",
      "18:30 Drinks @ The Roof €15",
    ].join("\n"),
  },
  {
    id: "offsite",
    label: "Team offsite",
    title: "Team offsite",
    lines: [
      "9:30 Coffee and kickoff @ Studio Loft",
      "10:00 H2 review: where we are",
      "12:30 Lunch @ Nour €22",
      "14:00 Workshop: next quarter's bets",
      "16:30 Walk by the river",
      "19:00 Dinner @ Maison Lune €45",
    ].join("\n"),
  },
  {
    id: "dinner",
    label: "Dinner night",
    title: "Dinner night",
    lines: [
      "Book a table for six",
      "19:00 Aperitivo @ Bar del Fico €12",
      "20:30 Dinner @ Da Enzo al 29 €35",
      "22:30 Gelato @ Fatamorgana €4",
    ].join("\n"),
  },
];

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

/** New plan: templates, one stop per line ("13:00 Lunch @ Figlmüller"), then send. */
export function PlanBuilder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const { me } = useChat();
  const [choices] = useState(() => dayChoices(Date.now()));
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(choices[0].date);
  const [text, setText] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [everyone, setEveryone] = useState(true);
  const parsed = parsePlanText(text);
  const count = parsed.reduce((n, d) => n + d.length, 0);
  const custom = !choices.some((c) => c.date === date);

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    // Keep a title the person typed; replace one that came from another template.
    if (!title.trim() || TEMPLATES.some((x) => x.title === title)) setTitle(t.title);
    setText(t.lines);
    setTemplate(id);
  };

  const send = () => {
    const days: PlanDay[] = parsed
      .map((stops, i) => {
        const day = addDays(date, i);
        return { id: uid(), date: day, stops: sortStops(stops.map((p) => toStop(p, day, uid()))) };
      })
      .filter((d) => d.stops.length);
    onSend(
      { type: "plan", title: title.trim(), days, rsvps: { [me]: "going" }, everyoneCanEdit: everyone, editors: [] },
      `Plan: ${title.trim()}`,
    );
  };

  return (
    <Sheet title="New plan" onClose={onClose} action={{ label: "Send", disabled: !title.trim() || !count, onClick: send }}>
      <input className={styles.bigInput} data-autofocus placeholder="What’s the plan?" aria-label="Plan title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <p className={styles.sheetLabel}>Start from</p>
      <div className={styles.chipGrid}>
        {TEMPLATES.map((t) => (
          <button key={t.id} className={`${styles.choice} ${template === t.id ? styles.choiceOn : ""}`} aria-pressed={template === t.id} onClick={() => applyTemplate(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <p className={styles.sheetLabel}>When</p>
      <div className={styles.chipGrid}>
        {choices.map((c) => (
          <button key={c.id} className={`${styles.choice} ${date === c.date ? styles.choiceOn : ""}`} aria-pressed={date === c.date} onClick={() => setDate(c.date)}>
            {c.label}
          </button>
        ))}
        <label className={`${styles.choice} ${s.dateChip} ${custom ? styles.choiceOn : ""}`}>
          <IconCalendar size={15} />
          <span>{custom ? dayLabel(date) : "Other day"}</span>
          <input
            type="date"
            aria-label="Pick a date"
            value={isoDate(date)}
            min={isoDate(choices[0].date)}
            onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* not allowed here; the field still works */ } }}
            onChange={(e) => { const d = fromIsoDate(e.target.value); if (d !== null) setDate(d); }}
          />
        </label>
      </div>

      <p className={styles.sheetLabel}>Stops</p>
      <textarea
        className={s.lines}
        rows={6}
        aria-label="One stop per line"
        placeholder={"One stop per line\n13:00 Lunch @ Figlmüller\nMuseum @ Belvedere €16\nDay 2"}
        value={text}
        onChange={(e) => { setText(e.target.value); setTemplate(null); }}
      />
      {count > 0 ? (
        <div className={s.preview} aria-live="polite">
          {parsed.map((stops, i) => (
            <div key={i} className={s.previewDay}>
              {parsed.length > 1 && <b>{dayLabel(addDays(date, i))}</b>}
              {stops.map((p, j) => (
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
      ) : (
        <p className={styles.sheetNote}>Start a line with a time (13:00, 9am), add a place after @ and a price with €. “Day 2” starts the next day.</p>
      )}

      <div className={styles.settingRows}>
        <label className={styles.settingRow}>
          <span><b>Everyone can edit</b><small>{everyone ? "Anyone here can tick, add and change stops." : "Only you change stops. Everyone can still say if they’re in."}</small></span>
          <Toggle on={everyone} onChange={setEveryone} label="Everyone can edit" />
        </label>
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

  return (
    <Sheet title="Plan" onClose={onClose} action={{ label: "Done", onClick: () => {} }}>
      <div className={s.intro}>
        <h2>{card.title}</h2>
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
            <input className={styles.plainInput} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
