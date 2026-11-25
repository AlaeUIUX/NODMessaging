"use client";

import { useRef, useState } from "react";
import { emojify } from "@/lib/chat/emoji";
import { IconCamera, IconLock } from "./Icons";
import Logo from "./Logo";
import StatusBar from "./StatusBar";
import { useNow } from "./ui";
import styles from "./chat.module.css";
import l from "./lockscreen.module.css";

/** One notification on the lock screen: what the in-app banner would have said. */
export interface LockNote { id: number; title: string; body: string; at: number }

/**
 * The iPhone's lock screen, for showing what NOD sends while the app is
 * closed: the date and time, then NOD's notifications at the bottom, newest
 * on top. Several stack the way iOS groups one app's notifications; tapping
 * the stack fans them out. Tapping one unlocks and opens what it's about
 * (here, the request to answer). Swipe up (or tap the bar) to open the app.
 *
 * On iPhone this is the system's; what NOD decides is the notification's
 * title ("Reema wants to edit") and body ("🇩🇪 German · Tap to answer"), and
 * where a tap lands.
 */
export default function LockScreen({ notes, onOpen, onUnlock }: {
  notes: LockNote[];
  onOpen: (note: LockNote) => void;
  onUnlock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const nowMs = useNow(30_000);
  const now = new Date(nowMs);

  const unlock = (then: () => void) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(then, 320);
  };

  const shown = open ? notes.slice(0, 6) : notes.slice(0, 1);
  const ago = (at: number) => {
    const min = Math.round((nowMs - at) / 60_000);
    return min < 1 ? "now" : min < 60 ? `${min}m ago` : `${Math.round(min / 60)}h ago`;
  };

  return (
    <div
      ref={rootRef}
      className={`${l.lock} ${leaving ? l.leaving : ""}`}
      role="dialog"
      aria-label="Lock screen"
      // Swipe up from anywhere to open, as on iPhone: the screen follows the finger, then goes or comes back.
      onPointerDown={(e) => { drag.current = { y: e.clientY, moved: false }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !rootRef.current) return;
        const dy = Math.min(0, e.clientY - d.y);
        if (dy < -6) d.moved = true;
        rootRef.current.style.transform = dy ? `translateY(${dy}px)` : "";
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || !rootRef.current) return;
        const dy = e.clientY - d.y;
        rootRef.current.style.transform = "";
        if (dy < -90) unlock(onUnlock);
      }}
      onPointerCancel={() => { drag.current = null; if (rootRef.current) rootRef.current.style.transform = ""; }}
    >
      <div className={styles.island} />
      <StatusBar left="" />
      <span className={l.padlock} aria-hidden="true"><IconLock size={18} /></span>
      <p className={l.date}>{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
      <p className={l.time}>9:41</p>

      <div className={l.notes}>
        {open && notes.length > 1 && (
          <div className={l.notesHead}>
            <b>Notification Centre</b>
            <button type="button" onClick={() => setOpen(false)}>Show less</button>
          </div>
        )}
        {shown.map((n, i) => (
          <button
            key={n.id}
            type="button"
            className={`${l.note} ${!open && notes.length > 1 ? l.stacked : ""}`}
            style={{ ["--i" as string]: i }}
            data-more={!open && notes.length > 1 ? Math.min(notes.length - 1, 2) : undefined}
            onClick={() => (!open && notes.length > 1 ? setOpen(true) : unlock(() => onOpen(n)))}
          >
            <span className={l.appIcon}><Logo size={22} /></span>
            <span className={l.noteText}>
              <span className={l.noteHead}><b>{n.title}</b><small>{ago(n.at)}</small></span>
              <span className={l.noteBody}>{emojify(n.body)}</span>
              {!open && notes.length > 1 && <span className={l.noteMore}>{notes.length - 1} more notification{notes.length > 2 ? "s" : ""}</span>}
            </span>
          </button>
        ))}
      </div>

      <div className={l.foot}>
        <span className={l.round} aria-hidden="true">
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M4 1h10v4l-2 4v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9L4 5V1z" />
            <path d="M4 5h10M9 12v3" strokeLinecap="round" />
          </svg>
        </span>
        <span className={l.round} aria-hidden="true"><IconCamera size={20} /></span>
      </div>
      <button type="button" className={l.swipe} onClick={() => unlock(onUnlock)}>
        <span>Swipe up to open</span>
        <i aria-hidden="true" />
      </button>
    </div>
  );
}
