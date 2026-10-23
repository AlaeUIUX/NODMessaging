"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { canRunDay, clock, currentDay, onSite, pendingRequests, type DayStep } from "@/lib/chat/operation";
import { userById } from "@/lib/chat/store";
import { IconCheck, IconFlag, IconPause, IconPlay, IconUndo } from "../Icons";
import { Sheet, useChatUi, useNow } from "../ui";
import styles from "../chat.module.css";
import { useOp } from "./zones";
import p from "./pages.module.css";

const DAY = 86_400_000;

/**
 * The day, from the "Day 2/3" pill: where the Operation is in its days, and
 * (for Command and whoever runs the zones) finishing it, pausing it, or going
 * back a day when one was finished by mistake. Every step asks first, and
 * lands for everyone at once.
 */
export function DaySheet({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const ui = useChatUi();
  const now = useNow(30_000);
  const [ask, setAsk] = useState<{ step: DayStep; host: HTMLElement } | null>(null);
  if (!o) return null;
  const { op, live, info, me, group } = o;
  const day = currentDay(op, live, now);
  const runs = canRunDay(info, me);
  const shift = op.shifts.find((s) => s.id === live.shift);
  const last = day.n >= op.days;
  const pending = pendingRequests(live).length;
  const dateOf = (n: number) => new Date(op.startsAt + (n - 1) * DAY).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const stateText = day.state === "done" ? "Finished" : day.state === "paused" ? "Paused" : "Running";
  const since = day.by ? `${day.state === "paused" ? "Paused" : day.state === "done" ? "Finished" : "Changed"} by ${day.by === me ? "you" : userById(day.by).name} at ${clock(day.at)}` : null;

  // The question each step asks before it goes out to everyone.
  const copy: Record<DayStep, { title: string; body: string; yes: string; done: string; danger?: boolean }> = {
    finish: last
      ? { title: "Finish the Operation?", body: `Day ${day.n} is the last day: ${group.name} is marked finished for everyone. You can reopen it from here.`, yes: "Finish the Operation", done: `${group.name} finished` }
      : { title: `Finish Day ${day.n}?`, body: `Day ${day.n + 1} starts for everyone. If it was a mistake, you can go back to Day ${day.n}.`, yes: `Finish Day ${day.n}`, done: `Day ${day.n + 1} started` },
    pause: { title: `Pause Day ${day.n}?`, body: "Everyone sees the day as paused until you resume it. Chat and the radio keep working.", yes: "Pause the day", done: `Day ${day.n} paused` },
    resume: { title: `Resume Day ${day.n}?`, body: "The day carries on for everyone.", yes: "Resume", done: `Day ${day.n} resumed` },
    back: day.state === "done"
      ? { title: `Reopen Day ${day.n}?`, body: `${group.name} is running again for everyone, on Day ${day.n}.`, yes: `Reopen Day ${day.n}`, done: `Day ${day.n} reopened`, danger: true }
      : { title: `Go back to Day ${day.n - 1}?`, body: `Day ${day.n - 1} opens again for everyone, as if Day ${day.n} hadn’t started. Use it when a day was finished by mistake.`, yes: `Go back to Day ${day.n - 1}`, done: `Back on Day ${day.n - 1}`, danger: true },
  };

  const steps: { step: DayStep; icon: ReactNode; label: string; sub: string }[] = [];
  if (day.state !== "done") {
    steps.push(last
      ? { step: "finish", icon: <IconFlag size={18} />, label: "Finish the Operation", sub: "The last day: it ends for everyone" }
      : { step: "finish", icon: <IconCheck size={18} />, label: `Finish Day ${day.n}`, sub: `Day ${day.n + 1} starts for everyone` });
    steps.push(day.state === "paused"
      ? { step: "resume", icon: <IconPlay size={18} />, label: `Resume Day ${day.n}`, sub: "Carry on where it stopped" }
      : { step: "pause", icon: <IconPause size={18} />, label: `Pause Day ${day.n}`, sub: "Everyone sees it’s paused" });
  }
  if (day.state === "done") steps.push({ step: "back", icon: <IconUndo size={18} />, label: `Reopen Day ${day.n}`, sub: "If it was finished by mistake" });
  else if (day.n > 1) steps.push({ step: "back", icon: <IconUndo size={18} />, label: `Back to Day ${day.n - 1}`, sub: "If a day was finished by mistake" });

  const c = ask ? copy[ask.step] : null;
  return (
    <>
      <Sheet title="The day" onClose={onClose}>
        <div className={p.dayHead}>
          <span className={p.dayBig}>Day {day.n}<em>/{op.days}</em></span>
          <span className={`${p.dayState} ${p[`day_${day.state}`]}`}>
            {day.state === "paused" ? <IconPause size={12} /> : day.state === "done" ? <IconCheck size={12} /> : <i aria-hidden="true" />}
            {stateText}
          </span>
          <small>{[dateOf(day.n), day.state === "on" && shift ? `${shift.name} shift` : null].filter(Boolean).join(" · ")}</small>
          {since && <small>{since}</small>}
        </div>

        <ol className={p.dayList} aria-label="Days">
          {Array.from({ length: op.days }, (_, i) => i + 1).map((n) => {
            const done = n < day.n || (n === day.n && day.state === "done");
            const isToday = n === day.n && !done;
            return (
              <li key={n} className={`${p.dayRow} ${isToday ? p.dayRowOn : ""} ${done ? p.dayRowDone : ""}`} aria-current={isToday ? "step" : undefined}>
                <span className={p.dayNum}>{done ? <IconCheck size={14} /> : n}</span>
                <span className={p.dayMain}><b>Day {n}</b><small>{dateOf(n)}</small></span>
                <span className={p.dayEnd}>{done ? "Done" : isToday ? stateText : "Upcoming"}</span>
              </li>
            );
          })}
        </ol>

        <div className={p.dayStats}>
          <span><b>{onSite(live)}</b><small>on site</small></span>
          <span><b>{pending}</b><small>{pending === 1 ? "request" : "requests"} open</small></span>
          <span><b>{live.broadcasts.length}</b><small>broadcasts</small></span>
        </div>

        {runs ? (
          <div className={p.menu}>
            {steps.map((s) => (
              <button
                key={s.step}
                className={`${p.menuItem} ${s.step === "back" ? p.dayBack : ""}`}
                onClick={(e) => setAsk({ step: s.step, host: (e.currentTarget.closest('[role="dialog"]')?.parentElement ?? document.body) as HTMLElement })}
              >
                <span className={p.menuIcon}>{s.icon}</span>
                <span className={p.menuText}>{s.label}<small>{s.sub}</small></span>
              </button>
            ))}
          </div>
        ) : (
          <p className={p.hint}>Command runs the day: finishing it, pausing it, or going back a day.</p>
        )}
      </Sheet>

      {ask && c && createPortal(
        <div className={styles.alertScrim} role="alertdialog" aria-modal="true" aria-label={c.title}>
          <div className={`${styles.alert} ${styles.glassStrong}`}>
            <h4>{c.title}</h4>
            <p>{c.body}</p>
            <div className={styles.alertActions}>
              <button
                className={c.danger ? styles.alertDanger : undefined}
                onClick={() => { o.act.runDay(ask.step); ui.toast(c.done); setAsk(null); }}
              >
                {c.yes}
              </button>
              <button data-autofocus className={styles.alertDeny} onClick={() => setAsk(null)}>Cancel</button>
            </div>
          </div>
        </div>,
        ask.host,
      )}
    </>
  );
}
