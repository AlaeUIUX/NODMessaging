"use client";

import { useEffect, useRef, useState } from "react";
import { renderBody, stripFormatting } from "@/lib/chat/markdown";
import { userById } from "@/lib/chat/store";
import type { Message } from "@/lib/chat/types";
import { initials } from "@/lib/chat/avatar";
import Avatar from "./Avatar";
import CardView from "./CardView";
import { Emoji, emojiCount, emojify } from "@/lib/chat/emoji";
import { IconDownload, IconFile, IconPause, IconPlay, IconReply } from "./Icons";
import styles from "./chat.module.css";

export type BubblePos = "single" | "first" | "middle" | "last";

const LONG_PRESS_MS = 380;
const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 84;
const DOUBLE_TAP_MS = 320;
const VOICE_BARS = 28;

export function haptic(ms = 8) {
  // Chrome logs an error for vibrate() before the first real user gesture.
  if (!navigator.userActivation?.hasBeenActive) return;
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

/** Up to three emoji and nothing else renders large, without a bubble. */
function isEmojiOnly(body: string) {
  const n = emojiCount(body);
  return n > 0 && n <= 3;
}

function resample(wave: number[], n: number) {
  if (!wave.length) return Array(n).fill(.3);
  const max = Math.max(...wave);
  return Array.from({ length: n }, (_, i) => {
    const v = wave[Math.floor((i / n) * wave.length)] / max;
    return .18 + v * .82;
  });
}

function VoiceNote({ message, interactive }: { message: Message; interactive: boolean }) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const duration = message.durationMs ?? 0;
  const bars = resample(message.waveform ?? [], VOICE_BARS);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const toggle = () => {
    if (playing) {
      cancelAnimationFrame(raf.current);
      setPlaying(false);
      return;
    }
    // Playback is simulated, compressed so a demo note finishes in a few seconds.
    const span = Math.min(duration, 5000);
    const from = progress >= 1 ? 0 : progress;
    const start = performance.now() - from * span;
    setPlaying(true);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / span);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else { setPlaying(false); setTimeout(() => setProgress(0), 400); }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const secs = Math.round(((playing || progress > 0 ? progress : 1) * duration) / 1000);
  return (
    <div className={styles.voice}>
      <button
        className={styles.voicePlay}
        onClick={interactive ? toggle : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {playing ? <IconPause size={15} strokeWidth={2.2} /> : <IconPlay size={15} strokeWidth={2.2} />}
      </button>
      <div className={styles.bars} aria-hidden="true">
        {bars.map((h, i) => (
          <i key={i} className={i / VOICE_BARS < progress ? styles.played : undefined} style={{ height: `${h * 100}%` }} />
        ))}
      </div>
      <span className={styles.voiceTime}>0:{String(secs).padStart(2, "0")}</span>
    </div>
  );
}

/** The bubble itself, shared by the thread and the long-press focus overlay. */
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Long-form posts (they open with a heading) render as a document, not a bubble. */
export const isDoc = (m: Message) => m.kind === "text" && !m.deletedAt && /^# /.test(m.body);

export function BubbleBody({ message, interactive = true }: { message: Message; interactive?: boolean }) {
  if (message.deletedAt) return <>Message deleted</>;
  if (message.kind === "card" && message.card) return <CardView message={message} interactive={interactive} />;
  return (
    <>
      {message.kind === "voice" ? (
        <VoiceNote message={message} interactive={interactive} />
      ) : (
        <>
          {renderBody(message.body, { article: isDoc(message) })}
          {message.editedAt && <span className={styles.edited}>Edited</span>}
        </>
      )}
      {message.attachments.length > 0 && (
        <div className={styles.attachments}>
          {message.attachments.map((a) =>
            a.kind === "image" && a.dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.id} className={styles.attachImg} src={a.dataUrl} alt={a.name} />
            ) : (
              <div key={a.id} className={styles.fileRow}>
                <span className={styles.fileIcon}><IconFile size={24} /></span>
                <span className={styles.fileMeta}><b>{a.name}</b><small>{fileSize(a.size)}</small></span>
                {a.dataUrl ? (
                  <a className={styles.fileDownload} href={a.dataUrl} download={a.name} onClick={(e) => e.stopPropagation()}><IconDownload size={14} />Download</a>
                ) : (
                  <span className={styles.fileDownload} aria-disabled="true" title="Files over 1.5 MB aren't stored in this demo">Too large</span>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}

export function bubbleClass(message: Message) {
  return [
    styles.bubble,
    message.kind === "card" && !message.deletedAt ? styles.cardBubble : "",
    isDoc(message) ? styles.docBubble : "",
    message.deletedAt ? styles.deleted : "",
    message.kind === "text" && !message.deletedAt && !message.attachments.length && isEmojiOnly(message.body) ? styles.emojiOnly : "",
  ].filter(Boolean).join(" ");
}

interface Props {
  message: Message;
  quoted?: Message;
  isMine: boolean;
  pos: BubblePos;
  showAvatar: boolean;
  avatarSlot: boolean;
  showByline: boolean;
  showStatus: boolean;
  isNew: boolean;
  highlighted: boolean;
  focused: boolean;
  meId: string;
  onReply: (message: Message) => void;
  onMenu: (message: Message, bubble: HTMLElement, armed: boolean) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onShowReactions: (message: Message) => void;
  onRetry: (message: Message) => void;
  onJumpTo: (messageId: string) => void;
}

type Mode = "idle" | "pending" | "swipe" | "menu";

export default function MessageRow({
  message, quoted, isMine, pos, showAvatar, avatarSlot, showByline, showStatus, isNew, highlighted, focused,
  meId, onReply, onMenu, onToggleReaction, onShowReactions, onRetry, onJumpTo,
}: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const g = useRef({ mode: "idle" as Mode, x: 0, y: 0, armed: false, timer: 0 as unknown as ReturnType<typeof setTimeout> });
  const lastTap = useRef(0);
  const [burst, setBurst] = useState(0);
  const [pressing, setPressing] = useState(false);
  const author = userById(message.authorId);
  const deleted = message.deletedAt !== null;

  const setSwipe = (x: number) => {
    const el = bubbleRef.current;
    if (el) el.style.transform = x ? `translateX(${x}px)` : "";
    const p = Math.min(1, Math.abs(x) / SWIPE_TRIGGER);
    hintRef.current?.style.setProperty("--p", String(p));
    const armed = Math.abs(x) >= SWIPE_TRIGGER;
    if (armed !== g.current.armed) {
      g.current.armed = armed;
      hintRef.current?.classList.toggle(styles.armed, armed);
      if (armed) haptic(6);
    }
  };

  const reset = () => {
    clearTimeout(g.current.timer);
    setPressing(false);
    bubbleRef.current?.classList.remove(styles.dragging);
    setSwipe(0);
    g.current.mode = "idle";
    g.current.armed = false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (deleted || e.button > 0) return;
    // Controls inside cards (vote, tick, download…) get plain taps, not gestures.
    const t = e.target as HTMLElement;
    if (t !== e.currentTarget && t.closest("button, a, input, label, form")) return;
    g.current = {
      mode: "pending",
      x: e.clientX,
      y: e.clientY,
      armed: false,
      timer: setTimeout(() => {
        if (g.current.mode !== "pending") return;
        g.current.mode = "menu";
        setPressing(false);
        haptic(12);
        if (bubbleRef.current) onMenu(message, bubbleRef.current, true);
      }, LONG_PRESS_MS),
    };
    setPressing(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (s.mode === "idle" || s.mode === "menu") return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === "pending") {
      if (Math.abs(dy) > 8) { reset(); return; }
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        clearTimeout(s.timer);
        setPressing(false);
        s.mode = "swipe";
        bubbleRef.current?.setPointerCapture(e.pointerId);
        bubbleRef.current?.classList.add(styles.dragging);
      } else return;
    }
    // Replies pull toward the centre of the screen: right for theirs, left for mine.
    const raw = isMine ? Math.min(0, dx) : Math.max(0, dx);
    const mag = Math.abs(raw);
    const eased = mag > SWIPE_TRIGGER ? SWIPE_TRIGGER + (mag - SWIPE_TRIGGER) * .3 : mag;
    setSwipe((isMine ? -1 : 1) * Math.min(SWIPE_MAX, eased));
  };

  const onPointerUp = () => {
    const s = g.current;
    if (s.mode === "swipe" && s.armed) onReply(message);
    if (s.mode === "pending") {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        setBurst(now);
        haptic(10);
        const hasHeart = message.reactions.some((r) => r.emoji === "❤️" && r.userIds.includes(meId));
        if (!hasHeart) onToggleReaction(message, "❤️");
      } else {
        lastTap.current = now;
      }
    }
    reset();
  };

  useEffect(() => () => clearTimeout(g.current.timer), []);

  const statusLabel =
    message.status === "pending" ? "Sending…"
    : message.status === "sent" ? "Sent"
    : message.status === "delivered" ? "Delivered"
    : "Read";

  const rowClass = [
    styles.row,
    isMine ? styles.mine : styles.theirs,
    pos === "middle" || pos === "last" ? styles.grouped : "",
    message.reactions.length ? styles.hasReactions : "",
    isNew ? (isMine ? styles.enterMine : styles.enterTheirs) : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rowClass} data-pos={pos} data-message-id={message.id}>
      {avatarSlot && (
        <div className={styles.avatarSlot}>
          {showAvatar && <Avatar glyph={initials(author.fullName)} tone={author.tone} size={28} />}
        </div>
      )}

      {isMine && message.status === "failed" && (
        <button className={styles.failMark} onClick={() => onRetry(message)} aria-label="Retry sending">!</button>
      )}

      <div className={styles.stack}>
        {/* Posts carry one caption that names the sender, instead of a byline
            stacked on a "made with" label. */}
        {isDoc(message) ? (
          <span className={styles.madeWith}>
            {isMine ? "You" : author.name} made this with <b><i>Aa</i> Text composer</b>
          </span>
        ) : showByline && <span className={styles.byline}>{author.name}</span>}

        {quoted && !deleted && (
          <div className={styles.replyCtx} onClick={() => onJumpTo(quoted.id)}>
            <span className={styles.replyCaption}>
              <IconReply size={12} />
              {isMine ? "You" : author.name} replied to {quoted.authorId === meId ? "you" : userById(quoted.authorId).name}
            </span>
            <span className={styles.ghost}>
              {quoted.deletedAt ? "Message deleted" : quoted.kind === "voice" ? "Voice message" : emojify(stripFormatting(quoted.body)) || "Attachment"}
            </span>
          </div>
        )}

        <div className={styles.bubbleWrap}>
          <div
            ref={bubbleRef}
            tabIndex={deleted ? -1 : 0}
            role="group"
            aria-label={`${author.name}: ${deleted ? "deleted" : stripFormatting(message.body) || "voice message"}`}
            className={[
              bubbleClass(message),
              pressing ? styles.pressing : "",
              message.status === "pending" ? styles.pending : "",
              highlighted ? styles.flash : "",
              focused ? styles.hiddenForOverlay : "",
            ].filter(Boolean).join(" ")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={reset}
            onPointerLeave={() => { if (g.current.mode === "pending") reset(); }}
            onContextMenu={(e) => {
              e.preventDefault();
              // Touch browsers fire this after our own long-press already opened the menu.
              if (g.current.mode === "menu") return;
              reset();
              if (!deleted && bubbleRef.current) onMenu(message, bubbleRef.current, false);
            }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === "ContextMenu") && bubbleRef.current && !deleted) {
                e.preventDefault();
                onMenu(message, bubbleRef.current, false);
              }
            }}
          >
            <BubbleBody message={message} />
            {burst > 0 && <span key={burst} className={styles.heartBurst}><Emoji char="❤️" /></span>}
          </div>

          <span ref={hintRef} className={styles.replyHint}><IconReply /></span>

          {message.reactions.length > 0 && !deleted && (
            <div className={styles.reactions}>
              {message.reactions.map((r) => (
                <button
                  key={`${r.emoji}-${r.userIds.length}`}
                  className={`${styles.reaction} ${r.userIds.includes(meId) ? styles.reactionMine : ""}`}
                  onClick={() => onShowReactions(message)}
                  aria-label={`${r.emoji} from ${r.userIds.map((id) => userById(id).name).join(", ")}`}
                >
                  <Emoji char={r.emoji} />
                  {r.userIds.length > 1 && <b>{r.userIds.length}</b>}
                </button>
              ))}
            </div>
          )}
        </div>

        {showStatus && (
          message.status === "failed" ? (
            <div className={`${styles.statusLine} ${styles.failed}`}>
              Not delivered · <button onClick={() => onRetry(message)}>Retry</button>
            </div>
          ) : (
            <div className={styles.statusLine} key={message.status}>{statusLabel}</div>
          )
        )}
      </div>
    </div>
  );
}
