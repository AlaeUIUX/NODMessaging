"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Chat, Message, User } from "@/lib/chat/types";
import { IconBell, IconCamera, IconImage, IconLocation, IconUserGroup } from "./Icons";
import styles from "./chat.module.css";

/* ---------------------------------------------------------------------------
   Screen-level UI host: cards live deep inside the scrolling thread, but their
   sheets and alerts must cover the whole phone screen.
--------------------------------------------------------------------------- */

export interface ChatUi {
  chat: Chat;
  members: User[];
  openSheet: (node: ReactNode) => void;
  closeSheet: () => void;
  toast: (text: string) => void;
  /** Resolves true when the permission is (or becomes) granted. */
  ask: (kind: PermissionKind) => Promise<boolean>;
  /** Opens a photo full screen, or a collection's grid ("all"). */
  openMedia: (message: Message, index: number | "all") => void;
  /** Opens a board full screen: the one given, else the last one viewed here, else offers to start one. */
  openBoard: (messageId?: string) => void;
  /** Adds a task to this chat's board, starting the board if there isn't one yet. */
  addTask: (fields: { title: string; assignee: string | null; due: number | null; fromMessageId?: string }) => void;
  /** Scrolls the thread to a message and flashes it. */
  jumpTo: (messageId: string) => void;
}

const Ctx = createContext<ChatUi | null>(null);
export const ChatUiProvider = Ctx.Provider;
export function useChatUi() {
  const ui = useContext(Ctx);
  if (!ui) throw new Error("useChatUi must be used inside ChatView");
  return ui;
}

/* ---------------------------------------------------------------------------
   Dialog focus: Tab stays inside the top-most dialog, Escape closes only that
   one, and focus goes back to where it was when the dialog closes.
--------------------------------------------------------------------------- */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const dialogs: HTMLElement[] = [];
const isTop = (el: HTMLElement) => dialogs[dialogs.length - 1] === el;

/** Registers a dialog; `onEscape` runs only while it is the top-most one. */
export function useDialog(ref: React.RefObject<HTMLElement | null>, onEscape?: () => void) {
  const escape = useRef(onEscape);
  useEffect(() => { escape.current = onEscape; }, [onEscape]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const before = document.activeElement as HTMLElement | null;
    dialogs.push(root);
    const onKey = (e: KeyboardEvent) => {
      if (!isTop(root)) return;
      // A field that handled Escape itself (a tag input, a mention list) keeps the dialog open.
      if (e.key === "Escape" && !e.defaultPrevented) { escape.current?.(); return; }
      if (e.key !== "Tab") return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); root.focus({ preventScroll: true }); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !root.contains(active))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      dialogs.splice(dialogs.indexOf(root), 1);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref]);
}

/* ---------------------------------------------------------------------------
   Permissions — remembered per browser, like the OS would.
--------------------------------------------------------------------------- */

export type PermissionKind = "notifications" | "location" | "camera" | "photos" | "contacts";
export type PermissionState = "prompt" | "granted" | "denied";

const KEY = (k: PermissionKind) => `nod.perm.${k}`;

export function getPermission(kind: PermissionKind): PermissionState {
  try {
    const v = localStorage.getItem(KEY(kind));
    return v === "granted" || v === "denied" ? v : "prompt";
  } catch {
    return "prompt";
  }
}
export function setPermission(kind: PermissionKind, state: PermissionState) {
  try {
    if (state === "prompt") localStorage.removeItem(KEY(kind));
    else localStorage.setItem(KEY(kind), state);
  } catch { /* private mode */ }
}

const COPY: Record<PermissionKind, { title: string; body: string; allow: string[]; icon: ReactNode }> = {
  notifications: {
    title: "“NOD” Would Like to Send You Notifications",
    body: "Reminders, mentions and replies arrive even when NOD is closed. You can change this any time in Settings.",
    allow: ["Allow"],
    icon: <IconBell size={26} />,
  },
  location: {
    title: "Allow “NOD” to use your location?",
    body: "Your location is only shared when you send it, and live sharing always ends on its own.",
    allow: ["Allow Once", "Allow While Using App"],
    icon: <IconLocation size={26} />,
  },
  camera: {
    title: "“NOD” Would Like to Access the Camera",
    body: "Take photos and share them straight into a conversation.",
    allow: ["OK"],
    icon: <IconCamera size={26} />,
  },
  contacts: {
    title: "“NOD” Would Like to Access Your Contacts",
    body: "NOD checks which of your contacts are here, so you can message them. Numbers stay private and nobody is told.",
    allow: ["OK"],
    icon: <IconUserGroup size={26} />,
  },
  photos: {
    title: "“NOD” Would Like to Access Your Photos",
    body: "Pick photos to share. NOD never uploads anything you don’t send.",
    allow: ["Allow Full Access", "Select Photos…"],
    icon: <IconImage size={26} />,
  },
};

/** An iOS-style system alert, rendered inside the phone. */
export function PermissionAlert({ kind, onResolve }: { kind: PermissionKind; onResolve: (granted: boolean) => void }) {
  const c = COPY[kind];
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const answered = useRef(false);
  const done = (granted: boolean) => {
    if (answered.current) return;
    answered.current = true;
    setClosing(true);
    setTimeout(() => onResolve(granted), 180);
  };
  useDialog(ref, () => done(false));
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} className={`${styles.alertScrim} ${closing ? styles.alertClosing : ""}`} role="alertdialog" aria-modal="true" aria-label={c.title}>
      <div className={`${styles.alert} ${styles.glassStrong}`}>
        <div className={styles.alertIcon} aria-hidden="true">{c.icon}</div>
        <h4>{c.title}</h4>
        <p>{c.body}</p>
        <div className={styles.alertActions}>
          {c.allow.map((label) => (
            <button key={label} onClick={() => done(true)}>{label}</button>
          ))}
          <button className={styles.alertDeny} onClick={() => done(false)}>Don’t Allow</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Bottom sheet with an iOS header: Cancel · Title · Action
--------------------------------------------------------------------------- */

export function Sheet({
  title, onClose, onClosing, action, children, footer,
}: {
  title: string;
  onClose: () => void;
  /** Runs the moment the sheet starts closing (Cancel, scrim, Escape), before the exit animation. */
  onClosing?: () => void;
  /** The top-right action closes the sheet, then runs; `keepOpen` runs it in place (a step that moves on). */
  action?: { label: string; disabled?: boolean; onClick: () => void; href?: string; keepOpen?: boolean };
  /** A function child receives `close(after)`, which animates out, then runs `after`. */
  children: ReactNode | ((close: (after?: () => void) => void) => ReactNode);
  footer?: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const sheetRef = useRef<HTMLElement>(null);
  // Focus the sheet's first field without scrolling anything behind it (a
  // plain autoFocus scrolls the whole page to bring the field into view), or
  // the sheet itself, so focus never stays behind the scrim. Keyed on the
  // title: a sheet that changes step (New group) focuses the new step's field.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const sheet = sheetRef.current;
      const target = sheet?.querySelector<HTMLElement>("[data-autofocus]") ?? sheet;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [title]);
  // Once, however fast the taps: a double-tap on Send must not send twice.
  const close = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClosing?.();
    setClosing(true);
    // Unmount first, then run the follow-up, so a follow-up that opens the
    // next sheet isn't immediately cleared by this one's onClose.
    setTimeout(() => { onClose(); after?.(); }, 220);
  };
  useDialog(sheetRef, () => close());
  return (
    <>
      <div className={`${styles.bsheetScrim} ${closing ? styles.bsheetClosing : ""}`} onClick={() => close()} />
      <section
        ref={sheetRef}
        className={`${styles.bsheet} ${styles.glassStrong} ${closing ? styles.bsheetClosing : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className={styles.grabber} />
        <header className={styles.bsheetHead}>
          <button onClick={() => close()}>Cancel</button>
          <h3>{title}</h3>
          {action?.href && !action.disabled ? (
            <a className={styles.bsheetAction} href={action.href} target="_blank" rel="noopener noreferrer" onClick={() => close(action.onClick)}>
              {action.label}
            </a>
          ) : action ? (
            <button
              className={styles.bsheetAction}
              disabled={action.disabled}
              onClick={() => (action.keepOpen ? action.onClick() : close(action.onClick))}
            >
              {action.label}
            </button>
          ) : <span />}
        </header>
        {/* `close` reads its ref only when called from an event handler, never while rendering. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        <div className={styles.bsheetBody}>{typeof children === "function" ? children(close) : children}</div>
        {footer}
      </section>
    </>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={styles.toggle} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className={styles.segmented} style={{ ["--n" as string]: options.length }}>
      <span className={styles.segmentedLens} style={{ transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? styles.segOn : undefined} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A clock that re-renders on an interval, for countdowns. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function relative(ms: number) {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * A screen stacked on the chat (contact page, board) gets its own history
 * entry, so the phone's Back closes it rather than the chat underneath.
 */
export function useBackLayer(key: string, open: boolean, onBack: () => void) {
  const back = useRef(onBack);
  useEffect(() => { back.current = onBack; }, [onBack]);
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...window.history.state, [key]: true }, "");
    const onPop = () => { if (!window.history.state?.[key]) back.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed from the page itself: drop the entry so Back doesn't land on it.
      if (window.history.state?.[key]) window.history.back();
    };
  }, [key, open]);
}

/** For motion driven from script (Web Animations, smooth scrolling), which the CSS reduced-motion rule can't reach. */
export const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const smooth = (): ScrollBehavior => (reducedMotion() ? "auto" : "smooth");
