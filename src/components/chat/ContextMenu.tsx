"use client";

import type { Message } from "@/lib/chat/types";
import styles from "./chat.module.css";

const QUICK_EMOJI = ["❤️", "😂", "👍", "🔥", "😮", "🙏"];

interface Props {
  message: Message;
  anchor: DOMRect;
  container: DOMRect;
  isMine: boolean;
  meId: string;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onCopy: () => void;
}

export default function ContextMenu({
  message, anchor, container, isMine, meId, onClose,
  onReact, onReply, onEdit, onDelete, onPin, onCopy,
}: Props) {
  const top = Math.max(60, anchor.top - container.top - 78);
  const left = Math.max(14, Math.min(anchor.left - container.left, container.width - 246));
  const mineReactions = new Set(
    message.reactions.filter((r) => r.userIds.includes(meId)).map((r) => r.emoji),
  );

  const run = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.ctxMenu} style={{ top, left }} role="menu">
        <div className={styles.ctxEmoji}>
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              className={mineReactions.has(emoji) ? styles.picked : undefined}
              onClick={run(() => onReact(emoji))}
            >
              {emoji}
            </button>
          ))}
        </div>

        <button className={styles.ctxItem} onClick={run(onReply)}>
          <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-4-4 4-4M5 10h14" /></svg>
          Reply
        </button>

        <button className={styles.ctxItem} onClick={run(onCopy)}>
          <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
          Copy
        </button>

        <button className={styles.ctxItem} onClick={run(onPin)}>
          <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z" /></svg>
          {message.pinned ? "Unpin" : "Pin"}
        </button>

        {isMine && message.kind === "text" && (
          <button className={styles.ctxItem} onClick={run(onEdit)}>
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            Edit
          </button>
        )}

        {isMine && (
          <button className={`${styles.ctxItem} ${styles.danger}`} onClick={run(onDelete)}>
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
            Delete
          </button>
        )}
      </div>
    </>
  );
}
