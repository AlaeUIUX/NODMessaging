"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isGrouped, userById } from "@/lib/chat/store";
import type { Message } from "@/lib/chat/types";
import styles from "./chat.module.css";

interface Props {
  chatId: string;
  messages: Message[];
  meId: string;
  isGroupChat: boolean;
  firstUnreadId: string | null;
  typingUsers: string[];
  hasEarlier: boolean;
  onLoadEarlier: () => void;
  children: (args: {
    message: Message;
    quoted?: Message;
    isMine: boolean;
    grouped: boolean;
    showAuthor: boolean;
    showStatus: boolean;
    isNew: boolean;
  }) => React.ReactNode;
}

function dayLabel(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MessageList({
  chatId, messages, meId, isGroupChat, firstUnreadId, typingUsers, hasEarlier, onLoadEarlier, children,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const pendingScrollRestore = useRef<number | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  // Fresh thread on chat switch: nothing animates, land at the bottom.
  useEffect(() => {
    seenIds.current = new Set(messages.map((m) => m.id));
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (pendingScrollRestore.current !== null) {
      // Keep the reading position pinned when older pages prepend. The flex
      // container's height is not resolved yet during the layout effect, so the
      // first assignment can clamp against a stale max — re-apply next frame.
      const distanceFromBottom = pendingScrollRestore.current;
      const apply = () => {
        const target = el.scrollHeight - distanceFromBottom;
        el.scrollTop = target;
        return Math.abs(el.scrollTop - target) <= 1;
      };
      if (!apply()) requestAnimationFrame(apply);
      pendingScrollRestore.current = null;
      return;
    }

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, typingUsers.length]);

  useEffect(() => {
    const next = new Set(seenIds.current);
    messages.forEach((m) => next.add(m.id));
    seenIds.current = next;
  });

  const handleLoadEarlier = () => {
    const el = scrollRef.current;
    if (!el || loadingEarlier) return;
    setLoadingEarlier(true);
    pendingScrollRestore.current = el.scrollHeight - el.scrollTop;
    // Matches the prototype's 750ms simulated fetch so the spinner is legible.
    setTimeout(() => {
      onLoadEarlier();
      setLoadingEarlier(false);
    }, 750);
  };

  return (
    <div className={styles.body} ref={scrollRef}>
      {hasEarlier && (
        <button className={styles.loadEarlier} onClick={handleLoadEarlier} disabled={loadingEarlier}>
          {loadingEarlier ? (
            <><span className={styles.spinner} /> Loading earlier messages…</>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              Load earlier messages
            </>
          )}
        </button>
      )}

      {/* `seenIds` is read during render to decide which rows animate in. It is a
          render-phase heuristic, not state: the worst case under a discarded
          render is a replayed entrance animation. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {messages.map((message, i) => {
        const previous = messages[i - 1];
        const grouped = isGrouped(previous, message);
        const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
        const isMine = message.authorId === meId;
        const quoted = message.replyToId ? messages.find((m) => m.id === message.replyToId) : undefined;

        // Status belongs under the sender's own most recent message only.
        const isLastOwn = isMine && !messages.slice(i + 1).some((m) => m.authorId === meId);

        return (
          <div key={message.id}>
            {showDay && (
              <div className={styles.divider}>
                <div className={styles.line} /><span>{dayLabel(message.createdAt)}</span><div className={styles.line} />
              </div>
            )}
            {firstUnreadId === message.id && (
              <div className={`${styles.divider} ${styles.unread}`}>
                <div className={styles.line} /><span>New messages</span><div className={styles.line} />
              </div>
            )}
            {children({
              message,
              quoted,
              isMine,
              grouped: grouped && !showDay && firstUnreadId !== message.id,
              showAuthor: isGroupChat,
              showStatus: isLastOwn,
              isNew: !seenIds.current.has(message.id),
            })}
          </div>
        );
      })}

      {typingUsers.length > 0 && (
        <div className={styles.row}>
          <img className={styles.rowAvatar} src={userById(typingUsers[0]).avatar} alt="" />
          <div className={styles.stack}>
            <div className={styles.typingBubble}><span /><span /><span /></div>
          </div>
        </div>
      )}
    </div>
  );
}
