"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { stripFormatting } from "@/lib/chat/markdown";
import { emojify } from "@/lib/chat/emoji";
import { haptic } from "@/lib/chat/haptics";
import { userById } from "@/lib/chat/store";
import type { Card, Chat, DeliveryStatus, Message } from "@/lib/chat/types";
import {
  IconAlert, IconBell, IconBoard, IconBookmark, IconBrush, IconCalendar, IconChecklist, IconClock, IconFile, IconGame,
  IconImage, IconLocation, IconMegaphone, IconMic, IconMoneyReceive, IconMoneySend, IconPoll, IconReceipt, IconRoute, IconWheel,
} from "./Icons";
import styles from "./chat.module.css";
import inbox from "./inbox.module.css";

/** One row of the chat list, worked out by the inbox. */
export interface RowData {
  chat: Chat;
  /** The chat itself, or a group's channels you can see. */
  threads: string[];
  last?: Message;
  unread: number;
  /** What would notify: a muted channel adds nothing, "only @mentions" adds its mentions. */
  alert: number;
  mentioned: boolean;
  /** Which channel the newest message is in, when a group has several. */
  channel?: string;
  quiet: boolean;
  /** An unsent draft in this chat (or one of its channels). */
  draft: { text: string; at: number } | null;
  /** Marked unread by hand. */
  marked: boolean;
  /** What the list sorts by: the newest message, or a newer draft. */
  sortAt: number;
}

/* ---------------------------------------------------------------------------
   What the row says
--------------------------------------------------------------------------- */

const size = 14;
function cardIcon(card: Card): ReactNode {
  switch (card.type) {
    case "poll": return <IconPoll size={size} />;
    case "checklist": return <IconChecklist size={size} />;
    case "reminder": return <IconBell size={size} />;
    case "location": return <IconLocation size={size} />;
    case "event": return <IconCalendar size={size} />;
    case "payment": return card.mode === "sent" ? <IconMoneySend size={size} /> : <IconMoneyReceive size={size} />;
    case "plan": return <IconRoute size={size} />;
    case "bill": return <IconReceipt size={size} />;
    case "project": return <IconBoard size={size} />;
    case "sketch": return <IconBrush size={size} />;
    case "tictactoe": return <IconGame size={size} />;
    case "wheel": return <IconWheel size={size} />;
    case "mind": return <IconBookmark size={size} />;
    case "opRef": return <IconMegaphone size={size} />;
    default: return null;
  }
}

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export interface PreviewParts {
  /** Your own message: its ticks instead of "You:". */
  ticks?: DeliveryStatus;
  /** Someone else's, in a group: who wrote it. */
  who?: string;
  icon?: ReactNode;
  text: string;
  quiet?: boolean;
}

/** What a message looks like in one line: who, what kind, the words. */
export function previewParts(message: Message | undefined, chat: Chat, me: string): PreviewParts {
  if (!message) return { text: "No messages yet", quiet: true };
  const mine = message.authorId === me;
  const base: PreviewParts = {
    ticks: mine ? message.status : undefined,
    who: !mine && chat.kind === "group" ? userById(message.authorId).name : undefined,
    text: "",
  };
  if (message.deletedAt) return { ...base, ticks: undefined, text: "Message deleted", quiet: true };
  const body = stripFormatting(message.body).trim();
  if (message.kind === "voice") {
    return { ...base, icon: <IconMic size={size} />, text: message.durationMs ? `Voice message (${clock(message.durationMs)})` : "Voice message" };
  }
  if (message.card) return { ...base, icon: cardIcon(message.card), text: body || "Card" };
  if (message.attachments.length) {
    const photos = message.attachments.filter((a) => a.kind === "image").length;
    if (photos) return { ...base, icon: <IconImage size={size} />, text: body || (photos > 1 ? `${photos} photos` : "Photo") };
    return { ...base, icon: <IconFile size={size} />, text: body || message.attachments[0].name };
  }
  return { ...base, text: body };
}

/** Delivery ticks, as in a bubble: one when sent, two when delivered, two in colour once read. */
export function Ticks({ status }: { status: DeliveryStatus }) {
  if (status === "pending") return <span className={inbox.tickIcon} aria-label="Sending"><IconClock size={12} /></span>;
  if (status === "failed") return <span className={`${inbox.tickIcon} ${inbox.tickFailed}`} aria-label="Not delivered"><IconAlert size={12} /></span>;
  const double = status !== "sent";
  return (
    <svg
      className={`${inbox.ticks} ${status === "read" ? inbox.ticksRead : ""}`}
      width={double ? 16 : 11}
      height={11}
      viewBox={`0 0 ${double ? 16 : 11} 11`}
      role="img"
      aria-label={status === "read" ? "Read" : status === "delivered" ? "Delivered" : "Sent"}
    >
      <path d="M1.2 5.8 4 8.6 9.8 2" />
      {double && <path d="M7.6 8.3l.3.3L13.8 2" />}
    </svg>
  );
}

/** The preview line: typing beats a draft, a draft beats the last message. */
export function RowPreview({ row, me, typing, typingChannel }: {
  row: RowData;
  me: string;
  typing: ReactNode | null;
  typingChannel?: string;
}) {
  if (typing) return <span className={styles.typingText}>{typingChannel && `#${typingChannel} · `}{typing}</span>;
  if (row.draft) {
    return (
      <>
        <span className={inbox.draftLabel}>Draft:</span> {emojify(stripFormatting(row.draft.text))}
      </>
    );
  }
  const p = previewParts(row.last, row.chat, me);
  return (
    <>
      {row.channel && `#${row.channel} · `}
      {p.ticks && <Ticks status={p.ticks} />}
      {p.who && <span className={inbox.who}>{p.who}: </span>}
      {p.icon && <span className={inbox.kindIcon}>{p.icon}</span>}
      <span className={p.quiet ? inbox.quietText : undefined}>{emojify(p.text)}</span>
    </>
  );
}

/* ---------------------------------------------------------------------------
   A row you can swipe both ways and hold
--------------------------------------------------------------------------- */

export interface SwipeAction {
  id: string;
  label: string;
  icon: ReactNode;
  tone: "accent" | "ink" | "grey";
  /** Takes the chat out of this list (Archive, Unarchive): the row slides all the way off. */
  removes?: boolean;
  run: () => void;
}

/** Each action's width once the row rests open. */
const SLOT = 76;
const HOLD_MS = 380;
/** A finger that stays down this long starts to press the row in, before the hold. */
const PRESS_MS = 110;

/*
 * Motion, the way UIKit does it: while the finger is down the row is exactly
 * under it; on release a spring takes over from the finger's own speed, and
 * the resting place is chosen from where the flick was heading, not just
 * where it stopped. Springs are given as UIKit gives them: a response (how
 * long one swing takes) and a damping ratio (1 = no bounce).
 */
const SPRING_ROW = { response: .38, damping: .86 };
/** The outermost action taking over (or giving back) the others' room. */
const SPRING_ARM = { response: .3, damping: 1 };
/** How far ahead a flick is projected (UIScrollView's normal deceleration). */
const PROJECT_S = .2;
/** Past this share of the width the outermost action takes over; back under the lower one and it lets go. */
const ARM_AT = .6;
const DISARM_AT = .5;

type Side = "" | "l" | "r";
interface Spring { response: number; damping: number }

/** One step of a damped spring (semi-implicit Euler: stable at any frame rate). */
function step(x: number, v: number, target: number, s: Spring, dt: number) {
  const k = (2 * Math.PI / s.response) ** 2;
  const c = 2 * s.damping * Math.sqrt(k);
  const a = -k * (x - target) - c * v;
  const nv = v + a * dt;
  return { x: x + nv * dt, v: nv };
}

/**
 * Swipe right for the leading actions (Read, Pin), left for the trailing ones
 * (More, Archive), the way WhatsApp's chat list works on iPhone. The actions
 * grow out of the edge into the space the row leaves, full height. Swipe far
 * and the outermost action glides over the others, with a tick; let go and it
 * runs. Holding still presses the row in, then opens the chat's menu.
 */
export function SwipeRow({ children, onTap, onHold, leading, trailing, open, onOpenChange }: {
  children: ReactNode;
  onTap: () => void;
  onHold: (el: HTMLElement) => void;
  /** Revealed by swiping right; the first is the outermost (at the left edge). */
  leading: SwipeAction[];
  /** Revealed by swiping left; the last is the outermost (at the right edge). */
  trailing: SwipeAction[];
  /** Only one row stays open: the list closes the others. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A drag or a hold still ends in a click: it must not open the chat.
  const swallow = useRef(false);
  const [shown, setShown] = useState<Side>("");

  /** The pointer, while it's down. */
  const drag = useRef<{ x: number; y: number; base: number; active: boolean; width: number; samples: { t: number; x: number }[] } | null>(null);
  /** Where everything is right now, where it's going, and the frame loop driving it. */
  const m = useRef({ x: 0, v: 0, target: 0, arm: 0, armV: 0, armSide: "" as Side, armed: "" as Side, following: false, raf: 0, last: 0 });

  const revealL = leading.length * SLOT;
  const revealR = trailing.length * SLOT;

  /** Draws one frame: the row where it is, each side's actions sized to the room it leaves. */
  const paint = () => {
    const s = m.current;
    const x = s.x;
    if (rowRef.current) rowRef.current.style.transform = Math.abs(x) < .01 ? "" : `translate3d(${x}px,0,0)`;
    const sides: [HTMLDivElement | null, number, number, "l" | "r"][] = [
      [leftRef.current, Math.max(0, x), leading.length, "l"],
      [rightRef.current, Math.max(0, -x), trailing.length, "r"],
    ];
    for (const [el, room, n, side] of sides) {
      if (!el || !n) continue;
      el.style.width = `${room}px`;
      const buttons = el.children as HTMLCollectionOf<HTMLElement>;
      // Shared evenly, until the outermost takes over: then it grows into all of it.
      const arm = s.armSide === side ? s.arm : 0;
      const even = room / n;
      const outerW = even + (room - even) * arm;
      const otherW = n > 1 ? (room - outerW) / (n - 1) : 0;
      const outer = side === "l" ? 0 : n - 1;
      for (let i = 0; i < buttons.length; i++) buttons[i].style.width = `${i === outer ? outerW : otherW}px`;
    }
    const w = wrapRef.current;
    if (w) {
      w.style.setProperty("--p-l", String(revealL ? Math.min(1, Math.max(0, x) / revealL) : 0));
      w.style.setProperty("--p-r", String(revealR ? Math.min(1, Math.max(0, -x) / revealR) : 0));
    }
  };

  const tick = (now: number) => {
    const s = m.current;
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - (s.last || now - 16)) / 1000));
    s.last = now;
    if (!s.following) ({ x: s.x, v: s.v } = step(s.x, s.v, s.target, SPRING_ROW, dt));
    const armTo = s.armed ? 1 : 0;
    ({ x: s.arm, v: s.armV } = step(s.arm, s.armV, armTo, SPRING_ARM, dt));
    if (!s.armed && s.arm < .001) s.armSide = "";
    paint();
    const rowDone = s.following || (Math.abs(s.x - s.target) < .4 && Math.abs(s.v) < 8);
    const armDone = Math.abs(s.arm - armTo) < .002 && Math.abs(s.armV) < .02;
    if (rowDone && armDone && !s.following) {
      s.x = s.target; s.v = 0; s.arm = armTo; s.armV = 0;
      paint();
      s.raf = 0;
      s.last = 0;
      return;
    }
    s.raf = requestAnimationFrame(tick);
  };
  const run = () => {
    if (!m.current.raf) m.current.raf = requestAnimationFrame(tick);
  };

  /** Springs to a resting place (shut, open, or off the edge), carrying the speed it already has. */
  const settle = (target: number, velocity = m.current.v) => {
    const s = m.current;
    s.following = false;
    s.target = target;
    s.v = velocity;
    setShown(target > 0 ? "l" : target < 0 ? "r" : "");
    onOpenChange(target !== 0);
    run();
  };

  const setArmed = (side: Side) => {
    const s = m.current;
    if (s.armed === side) return;
    s.armed = side;
    if (side) {
      s.armSide = side;
      haptic(10);
    }
    run();
  };

  // Another row opened (or the list scrolled): close this one.
  useEffect(() => {
    if (!open && m.current.target !== 0) { setArmed(""); settle(0, 0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clearTimers = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    holdTimer.current = null;
    pressTimer.current = null;
  };
  /** Lets go of a press: the row eases back to its size. */
  const release = () => {
    const w = wrapRef.current;
    if (!w || !("pressing" in w.dataset)) return;
    delete w.dataset.pressing;
    w.dataset.unpressing = "";
    if (pressEnd.current) clearTimeout(pressEnd.current);
    pressEnd.current = setTimeout(() => { delete w.dataset.unpressing; }, 300);
  };
  useEffect(() => () => {
    clearTimers();
    if (pressEnd.current) clearTimeout(pressEnd.current);
    cancelAnimationFrame(m.current.raf);
  }, []);

  /** Runs an action: Archive and Unarchive carry the row off the edge; everything else closes it. */
  const fire = (a: SwipeAction, velocity = 0) => {
    const width = rowRef.current?.offsetWidth ?? 400;
    if (a.removes) settle(leading.includes(a) ? width : -width, velocity);
    else { setArmed(""); settle(0, velocity); }
    a.run();
  };

  const actions = (list: SwipeAction[], side: "l" | "r") => list.map((a, i) => (
    <button
      key={a.id}
      className={inbox.act}
      data-tone={a.tone}
      data-outer={(side === "l" ? i === 0 : i === list.length - 1) || undefined}
      tabIndex={shown === side ? 0 : -1}
      aria-hidden={shown !== side}
      onClick={() => fire(a)}
    >
      <span className={inbox.actInner}>
        <span className={inbox.actIcon}>{a.icon}</span>
        <span className={inbox.actLabel}>{a.label}</span>
      </span>
    </button>
  ));

  /** The finger's speed over its last ~80 ms, in px/s. */
  const velocity = () => {
    const d = drag.current;
    if (!d || d.samples.length < 2) return 0;
    const lastS = d.samples[d.samples.length - 1];
    const first = d.samples.find((p) => lastS.t - p.t <= 80) ?? d.samples[0];
    const dt = (lastS.t - first.t) / 1000;
    return dt > 0 ? (lastS.x - first.x) / dt : 0;
  };

  return (
    <div className={`${styles.inboxRowWrap} ${inbox.swipeWrap}`} ref={wrapRef}>
      {leading.length > 0 && <div ref={leftRef} className={`${inbox.acts} ${inbox.actsL}`}>{actions(leading, "l")}</div>}
      {trailing.length > 0 && <div ref={rightRef} className={`${inbox.acts} ${inbox.actsR}`}>{actions(trailing, "r")}</div>}
      <button
        ref={rowRef}
        className={`${styles.inboxRow} ${inbox.swipeRow}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          swallow.current = false;
          clearTimers();
          const s = m.current;
          drag.current = { x: e.clientX, y: e.clientY, base: s.x, active: false, width: rowRef.current?.offsetWidth ?? 360, samples: [{ t: e.timeStamp, x: e.clientX }] };
          // Holding still on a resting, closed row presses it in, then opens its menu.
          if (s.target === 0 && Math.abs(s.x) < 1) {
            pressTimer.current = setTimeout(() => {
              if (wrapRef.current && drag.current && !drag.current.active) wrapRef.current.dataset.pressing = "";
            }, PRESS_MS);
            holdTimer.current = setTimeout(() => {
              holdTimer.current = null;
              if (!drag.current || drag.current.active) return;
              drag.current = null;
              swallow.current = true;
              haptic(8);
              release();
              if (rowRef.current) onHold(rowRef.current);
            }, HOLD_MS);
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.active) {
            if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; clearTimers(); release(); return; }
            if (Math.abs(dx) < 6) return;
            clearTimers();
            release();
            // The press springs back instantly: an easing transform would make the drag lag.
            if (wrapRef.current) delete wrapRef.current.dataset.unpressing;
            d.active = true;
            swallow.current = true;
            // Caught mid-spring: the row stops where it is and follows the finger from there.
            const s = m.current;
            s.following = true;
            s.v = 0;
            d.base = s.x - dx;
            rowRef.current?.setPointerCapture(e.pointerId);
          }
          d.samples.push({ t: e.timeStamp, x: e.clientX });
          if (d.samples.length > 8) d.samples.shift();
          let x = d.base + dx;
          if (x > 0 && !revealL) x = 0;
          if (x < 0 && !revealR) x = 0;
          // Free almost to the far edge, then it resists, more the further it goes.
          const limit = d.width * .92;
          if (Math.abs(x) > limit) x = Math.sign(x) * (limit + (Math.abs(x) - limit) * .18);
          const s = m.current;
          s.x = x;
          // Past the line the outermost action takes over (with a tick); back under a lower line it lets go.
          const far = Math.abs(x) / d.width;
          const side: Side = x > 0 ? "l" : x < 0 ? "r" : "";
          setArmed(far > ARM_AT ? side : far > DISARM_AT && s.armed === side ? side : "");
          run();
        }}
        onPointerUp={() => {
          clearTimers();
          release();
          const d = drag.current;
          const v = velocity();
          drag.current = null;
          if (!d?.active) return;
          const s = m.current;
          // A long swipe runs the outermost action.
          if (s.armed === "l") { fire(leading[0], v); return; }
          if (s.armed === "r") { fire(trailing[trailing.length - 1], v); return; }
          // Otherwise: open or shut, from where the flick was heading.
          const projected = s.x + v * PROJECT_S;
          if (revealL && projected > revealL / 2) settle(revealL, v);
          else if (revealR && projected < -revealR / 2) settle(-revealR, v);
          else settle(0, v);
        }}
        onPointerCancel={() => { clearTimers(); release(); drag.current = null; setArmed(""); settle(m.current.target, 0); }}
        onClick={(e) => {
          if (swallow.current) { swallow.current = false; e.preventDefault(); return; }
          if (m.current.target !== 0) { e.preventDefault(); settle(0, 0); return; }
          onTap();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          clearTimers();
          release();
          drag.current = null;
          if (m.current.target !== 0) settle(0, 0);
          if (rowRef.current) onHold(rowRef.current);
        }}
      >
        {children}
      </button>
    </div>
  );
}
