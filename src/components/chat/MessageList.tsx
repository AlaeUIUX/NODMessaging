"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { isGrouped, userById } from "@/lib/chat/store";
import type { AvatarTone, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconArrowUp, IconLock } from "./Icons";
import type { BubblePos } from "./MessageRow";
import styles from "./chat.module.css";

export interface RowArgs {
  message: Message;
  quoted?: Message;
  isMine: boolean;
  pos: BubblePos;
  showAvatar: boolean;
  avatarSlot: boolean;
  showByline: boolean;
  showStatus: boolean;
  isNew: boolean;
}

interface Props {
  chatId: string;
  messages: Message[];
  meId: string;
  isGroupChat: boolean;
  intro: { title: string; subtitle: string; glyph: string; tone: AvatarTone };
  firstUnreadId: string | null;
  typingUsers: string[];
  hasEarlier: boolean;
  onLoadEarlier: () => void;
  children: (args: RowArgs) => React.ReactNode;
}

function dayLabel(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Today";
  if (same(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const clock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function MessageList({
  chatId, messages, meId, isGroupChat, intro, firstUnreadId, typingUsers, hasEarlier, onLoadEarlier, children,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const pendingScrollRestore = useRef<number | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  // Fresh thread on open: nothing animates in, land at the bottom.
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
      // Keep the reading position pinned while older pages prepend; the first
      // assignment can clamp against a stale height, so re-apply next frame.
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

    // Your own sends always land in view (cards can be taller than the
    // near-bottom window); others' messages only follow if you're already there.
    const last = messages[messages.length - 1];
    const sentByMe = !!last && last.authorId === meId && !seenIds.current.has(last.id);
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (nearBottom || sentByMe) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typingUsers.length, meId]);

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
    setTimeout(() => {
      onLoadEarlier();
      setLoadingEarlier(false);
    }, 650);
  };

  const lastOwnIndex = messages.map((m) => m.authorId).lastIndexOf(meId);

  // Far from the bottom, a button takes you back — and counts what arrived meanwhile.
  const [away, setAway] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const seenCount = useRef(messages.length);
  useEffect(() => {
    const added = messages.length - seenCount.current;
    seenCount.current = messages.length;
    if (added > 0 && away) setUnseen((n) => n + added);
  }, [messages.length, away]);
  // While a jump is scrolling down, don't bring the button back mid-flight.
  const jumping = useRef(false);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const far = el.scrollHeight - el.scrollTop - el.clientHeight > 600;
    if (!far) jumping.current = false;
    if (far && jumping.current) return;
    if (far !== away) setAway(far);
    if (!far && unseen) setUnseen(0);
  };
  const jumpToLatest = () => {
    jumping.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setAway(false);
    setUnseen(0);
  };

  // The typing bubble fades out instead of vanishing when someone stops.
  // Derived during render (React's "adjust state on prop change" pattern).
  const typingNow = typingUsers[0] ?? null;
  const [prevTyping, setPrevTyping] = useState(typingNow);
  const [typingExit, setTypingExit] = useState<string | null>(null);
  if (typingNow !== prevTyping) {
    setPrevTyping(typingNow);
    setTypingExit(typingNow ? null : prevTyping);
  }
  useEffect(() => {
    if (!typingExit) return;
    const t = setTimeout(() => setTypingExit(null), 220);
    return () => clearTimeout(t);
  }, [typingExit]);
  const typingShown = typingNow ? { user: typingNow, leaving: false } : typingExit ? { user: typingExit, leaving: true } : null;

  return (
    <>
    <div className={styles.thread} ref={scrollRef} data-thread onScroll={onScroll}>
      <div className={styles.threadFill} />

      {hasEarlier ? (
        <button className={styles.loadEarlier} onClick={handleLoadEarlier} disabled={loadingEarlier}>
          {loadingEarlier && <span className={styles.spinner} />}
          {loadingEarlier ? "Loading…" : "Load earlier messages"}
        </button>
      ) : (
        <div className={styles.threadIntro}>
          <Avatar glyph={intro.glyph} tone={intro.tone} size={72} />
          <h2>{intro.title}</h2>
          <p>{intro.subtitle}</p>
          <span className={styles.e2e}><IconLock size={12} />Messages are end-to-end encrypted</span>
        </div>
      )}

      {/* `seenIds` is read during render to decide which rows animate in — a
          render-phase heuristic; the worst case is a replayed entrance. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {messages.map((message, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(message.createdAt);
        const breakBefore = showDay || firstUnreadId === message.id;
        const joinPrev = !breakBefore && isGrouped(prev, message) && !prev?.deletedAt;
        const nextBreaks = !next || dayLabel(next.createdAt) !== dayLabel(message.createdAt) || firstUnreadId === next.id;
        const joinNext = !nextBreaks && isGrouped(message, next) && !next?.deletedAt;
        const pos: BubblePos = joinPrev ? (joinNext ? "middle" : "last") : joinNext ? "first" : "single";
        const isMine = message.authorId === meId;
        const quoted = message.replyToId ? messages.find((m) => m.id === message.replyToId) : undefined;

        return (
          <div key={message.id}>
            {showDay && (
              <div className={styles.dayLabel}>
                <span><b>{dayLabel(message.createdAt)}</b> {clock(message.createdAt)}</span>
              </div>
            )}
            {firstUnreadId === message.id && <div className={styles.newDivider}>New</div>}
            {children({
              message,
              quoted,
              isMine,
              pos,
              avatarSlot: isGroupChat && !isMine,
              showAvatar: isGroupChat && !isMine && (pos === "last" || pos === "single"),
              showByline: isGroupChat && !isMine && (pos === "first" || pos === "single"),
              // Receipts only while the conversation is still on your message:
              // once three or more newer messages arrive, the line goes (a failure always stays).
              showStatus: i === lastOwnIndex && (message.status === "failed" || messages.length - 1 - i < 3),
              isNew: !seenIds.current.has(message.id),
            })}
          </div>
        );
      })}

      {typingShown && (
        <div className={`${styles.row} ${styles.theirs} ${typingShown.leaving ? styles.typingLeaving : styles.enterTheirs}`}>
          {isGroupChat && (
            <div className={styles.avatarSlot}>
              <Avatar glyph={initials(userById(typingShown.user).fullName)} tone={userById(typingShown.user).tone} size={28} />
            </div>
          )}
          <div className={styles.stack}>
            <div className={styles.typingBubble} aria-label="typing"><span /><span /><span /></div>
          </div>
        </div>
      )}

      <div className={styles.threadSpacer} />
    </div>
    {away && (
      <button className={`${styles.jumpLatest} ${styles.glassStrong}`} onClick={jumpToLatest} aria-label="Jump to latest messages">
        {unseen > 0 && <span className={styles.jumpCount}>{unseen} new</span>}
        <span className={styles.jumpArrow}><IconArrowUp size={18} /></span>
      </button>
    )}
    </>
  );
}
