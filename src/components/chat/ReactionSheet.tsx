"use client";

import { useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { userById } from "@/lib/chat/store";
import type { Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { Emoji } from "@/lib/chat/emoji";
import styles from "./chat.module.css";

interface Props {
  message: Message;
  meId: string;
  onRemove: (emoji: string) => void;
  onClose: () => void;
}

/** Who reacted with what — opened from a reaction badge. */
export default function ReactionSheet({ message, meId, onRemove, onClose }: Props) {
  const [tab, setTab] = useState<string>("all");
  const [closing, setClosing] = useState(false);

  const dismiss = (after?: () => void) => {
    setClosing(true);
    setTimeout(() => { after?.(); onClose(); }, 200);
  };

  const entries = message.reactions.flatMap((r) => r.userIds.map((userId) => ({ emoji: r.emoji, userId })));
  const shown = tab === "all" ? entries : entries.filter((e) => e.emoji === tab);

  return (
    <>
      <div className={`${styles.sheetScrim} ${closing ? styles.sheetClosing : ""}`} onClick={() => dismiss()} />
      <div className={`${styles.sheet} ${styles.glassStrong} ${closing ? styles.sheetClosing : ""}`} role="dialog" aria-label="Reactions">
        <div className={styles.grabber} />
        <h3>Reactions</h3>
        <div className={styles.sheetTabs}>
          <button className={`${styles.segment} ${tab === "all" ? styles.segmentOn : ""}`} onClick={() => setTab("all")}>
            All<em>{entries.length}</em>
          </button>
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              className={`${styles.segment} ${tab === r.emoji ? styles.segmentOn : ""}`}
              onClick={() => setTab(r.emoji)}
            >
              <Emoji char={r.emoji} /><em>{r.userIds.length}</em>
            </button>
          ))}
        </div>
        {shown.map(({ emoji, userId }) => {
          const user = userById(userId);
          const isMe = userId === meId;
          const body = (
            <>
              <Avatar glyph={initials(user.fullName)} tone={user.tone} size={36} />
              <span className={styles.srName}>
                {isMe ? "You" : user.fullName}
                {isMe && <small>Tap to remove</small>}
              </span>
              <span className={styles.srEmoji}><Emoji char={emoji} /></span>
            </>
          );
          return isMe ? (
            <button key={emoji + userId} className={styles.sheetRow} onClick={() => dismiss(() => onRemove(emoji))}>{body}</button>
          ) : (
            <div key={emoji + userId} className={styles.sheetRow}>{body}</div>
          );
        })}
      </div>
    </>
  );
}
