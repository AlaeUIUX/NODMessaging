"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Chat, Message, User } from "@/lib/chat/types";
import { IconBell, IconCamera, IconImage, IconLocation } from "./Icons";
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
}

const Ctx = createContext<ChatUi | null>(null);
export const ChatUiProvider = Ctx.Provider;
export function useChatUi() {
  const ui = useContext(Ctx);
  if (!ui) throw new Error("useChatUi must be used inside ChatView");
  return ui;
}

/* ---------------------------------------------------------------------------
   Permissions — remembered per browser, like the OS would.
--------------------------------------------------------------------------- */

export type PermissionKind = "notifications" | "location" | "camera" | "photos";
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
  const done = (granted: boolean) => {
    setClosing(true);
    setTimeout(() => onResolve(granted), 180);
  };
  return (
    <div className={`${styles.alertScrim} ${closing ? styles.alertClosing : ""}`} role="alertdialog" aria-label={c.title}>
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
  title, onClose, action, children, footer,
}: {
  title: string;
  onClose: () => void;
  action?: { label: string; disabled?: boolean; onClick: () => void };
  /** A function child receives `close(after)`, which animates out, then runs `after`. */
  children: ReactNode | ((close: (after?: () => void) => void) => ReactNode);
  footer?: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const close = (after?: () => void) => {
    setClosing(true);
    // Unmount first, then run the follow-up, so a follow-up that opens the
    // next sheet isn't immediately cleared by this one's onClose.
    setTimeout(() => { onClose(); after?.(); }, 220);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className={`${styles.bsheetScrim} ${closing ? styles.bsheetClosing : ""}`} onClick={() => close()} />
      <section className={`${styles.bsheet} ${styles.glassStrong} ${closing ? styles.bsheetClosing : ""}`} role="dialog" aria-label={title}>
        <div className={styles.grabber} />
        <header className={styles.bsheetHead}>
          <button onClick={() => close()}>Cancel</button>
          <h3>{title}</h3>
          {action ? (
            <button
              className={styles.bsheetAction}
              disabled={action.disabled}
              onClick={() => close(action.onClick)}
            >
              {action.label}
            </button>
          ) : <span />}
        </header>
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
