"use client";

import { useRef, useState } from "react";
import { renderBody, stripFormatting } from "@/lib/chat/markdown";
import { userById } from "@/lib/chat/store";
import type { Message } from "@/lib/chat/types";
import styles from "./chat.module.css";

const SWIPE_TRIGGER = 46;
const SWIPE_MAX = 70;
const LONG_PRESS_MS = 480;
const DOUBLE_TAP_MS = 350;

interface Props {
  message: Message;
  quoted?: Message;
  isMine: boolean;
  grouped: boolean;
  showAuthor: boolean;
  showStatus: boolean;
  isNew: boolean;
  highlighted: boolean;
  meId: string;
  onReply: (message: Message) => void;
  onMenu: (message: Message, anchor: DOMRect) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onRetry: (message: Message) => void;
  onJumpTo: (messageId: string) => void;
}

export default function MessageRow({
  message, quoted, isMine, grouped, showAuthor, showStatus, isNew, highlighted,
  meId, onReply, onMenu, onToggleReaction, onRetry, onJumpTo,
}: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ startX: number; moved: boolean; timer: ReturnType<typeof setTimeout> | null }>({
    startX: 0, moved: false, timer: null,
  });
  const lastTap = useRef(0);
  const [burst, setBurst] = useState(false);
  const [playedBars, setPlayedBars] = useState(0);
  const author = userById(message.authorId);
  const deleted = message.deletedAt !== null;

  const endGesture = (clientX: number) => {
    const g = gesture.current;
    if (g.timer) clearTimeout(g.timer);
    const dx = clientX - g.startX;
    const el = bubbleRef.current;
    if (el) el.style.transform = "";
    const hint = el?.querySelector<HTMLElement>(`.${styles.swipeHint}`);
    if (hint) hint.style.opacity = "0";

    if (g.moved && Math.abs(dx) > SWIPE_TRIGGER && !deleted) {
      onReply(message);
    } else if (!g.moved && !deleted) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        setBurst(true);
        setTimeout(() => setBurst(false), 720);
        onToggleReaction(message, "❤️");
      } else {
        lastTap.current = now;
      }
    }
    gesture.current = { startX: 0, moved: false, timer: null };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (deleted) return;
    bubbleRef.current?.setPointerCapture(e.pointerId);
    gesture.current = {
      startX: e.clientX,
      moved: false,
      timer: setTimeout(() => {
        if (gesture.current.moved) return;
        const rect = bubbleRef.current?.getBoundingClientRect();
        if (rect) onMenu(message, rect);
        gesture.current.moved = true; // suppress the tap that follows
      }, LONG_PRESS_MS),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.startX) return;
    const dx = e.clientX - g.startX;
    if (Math.abs(dx) > 6 && !g.moved) {
      g.moved = true;
      if (g.timer) clearTimeout(g.timer);
    }
    if (!g.moved) return;
    const clamped = isMine ? Math.min(0, Math.max(dx, -SWIPE_MAX)) : Math.max(0, Math.min(dx, SWIPE_MAX));
    const el = bubbleRef.current;
    if (el) {
      el.style.transform = `translateX(${clamped}px)`;
      const hint = el.querySelector<HTMLElement>(`.${styles.swipeHint}`);
      if (hint) hint.style.opacity = String(Math.min(1, Math.abs(clamped) / 50));
    }
  };

  const playVoice = () => {
    const total = message.waveform?.length ?? 0;
    if (!total || playedBars > 0) return;
    let i = 0;
    const tick = setInterval(() => {
      i += 1;
      setPlayedBars(i);
      if (i >= total) {
        clearInterval(tick);
        setTimeout(() => setPlayedBars(0), 300);
      }
    }, 45);
  };

  const statusLabel =
    message.status === "pending" ? "Sending…"
    : message.status === "sent" ? "Sent"
    : message.status === "delivered" ? "Delivered"
    : message.status === "read" ? "Read"
    : "Failed";

  return (
    <div
      className={[styles.row, isMine ? styles.mine : "", grouped ? styles.grouped : "", isNew ? styles.msgEnter : ""]
        .filter(Boolean).join(" ")}
      data-message-id={message.id}
    >
      {!isMine && (grouped
        ? <div className={styles.avatarSpacer} />
        : <img className={styles.rowAvatar} src={author.avatar} alt="" />)}

      <div className={styles.stack}>
        {showAuthor && !isMine && !grouped && <span className={styles.authorName}>{author.name}</span>}

        <div
          ref={bubbleRef}
          className={[
            styles.bubble,
            message.status === "pending" ? styles.pendingBubble : "",
            message.status === "failed" ? styles.failedBubble : "",
            deleted ? styles.deleted : "",
            highlighted ? styles.flash : "",
          ].filter(Boolean).join(" ")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endGesture(e.clientX)}
          onPointerCancel={(e) => endGesture(e.clientX)}
          onContextMenu={(e) => {
            e.preventDefault();
            const rect = bubbleRef.current?.getBoundingClientRect();
            if (rect && !deleted) onMenu(message, rect);
          }}
        >
          {burst && <span className={styles.heartBurst}>❤️</span>}

          {deleted ? (
            "This message was deleted"
          ) : (
            <>
              {quoted && (
                <div className={styles.quoted} onClick={() => onJumpTo(quoted.id)}>
                  <b>{userById(quoted.authorId).name}</b>
                  <span>{quoted.deletedAt ? "Deleted message" : stripFormatting(quoted.body) || "Attachment"}</span>
                </div>
              )}

              {message.kind === "voice" ? (
                <div className={styles.voice}>
                  <button className={styles.voicePlay} onClick={playVoice} aria-label="Play voice note">
                    <svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z" /></svg>
                  </button>
                  <div className={styles.wave}>
                    {(message.waveform ?? []).map((h, i) => (
                      <i key={i} className={i < playedBars ? styles.played : ""} style={{ height: h }} />
                    ))}
                  </div>
                  <span className={styles.voiceTime}>
                    {Math.floor((message.durationMs ?? 0) / 1000)}s
                  </span>
                </div>
              ) : (
                <>
                  {renderBody(message.body)}
                  {message.editedAt && <span className={styles.editedTag}>edited</span>}
                </>
              )}

              {message.attachments.length > 0 && (
                <div className={styles.attachments}>
                  {message.attachments.map((a) =>
                    a.kind === "image" && a.dataUrl ? (
                      <img key={a.id} className={styles.attachImg} src={a.dataUrl} alt={a.name} />
                    ) : (
                      <div key={a.id} className={styles.attachFile}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                        </svg>
                        {a.name}
                      </div>
                    ),
                  )}
                </div>
              )}

              <span className={styles.swipeHint}>
                <svg viewBox="0 0 24 24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14l-4-4 4-4M5 10h14" />
                </svg>
              </span>
            </>
          )}
        </div>

        {message.reactions.length > 0 && (
          <div className={styles.reactions}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`${styles.reactionChip} ${r.userIds.includes(meId) ? styles.mineReaction : ""}`}
                onClick={() => onToggleReaction(message, r.emoji)}
                title={r.userIds.map((id) => userById(id).name).join(", ")}
              >
                {r.emoji}{r.userIds.length > 1 && <span>{r.userIds.length}</span>}
              </button>
            ))}
          </div>
        )}

        {showStatus && (
          <div className={styles.statusLine}>
            {message.status === "failed" ? (
              <>
                <span>Failed to send</span>
                <button className={styles.retryBtn} onClick={() => onRetry(message)}>Tap to retry</button>
              </>
            ) : (
              <>
                {message.status === "read" && <img src={userById(isMine ? "charles" : message.authorId).avatar} alt="" />}
                {statusLabel}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
