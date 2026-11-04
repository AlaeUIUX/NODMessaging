"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { isGrouped, typingLine, typingNames, userById } from "@/lib/chat/store";
import type { AvatarTone, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconArrowUp, IconLock } from "./Icons";
import type { BubblePos } from "./MessageRow";
import { smooth } from "./ui";
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
  intro: { title: string; subtitle: string; glyph: string; tone: AvatarTone; photo?: string };
  firstUnreadId: string | null;
  typingUsers: string[];
  hasEarlier: boolean;
  onLoadEarlier: () => void;
  /** Lines in the thread between messages, at their time ("Charles pinned a message"). */
  notes?: { id: string; at: number; text: string; onTap?: () => void }[];
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

const dayKey = (ts: number) => new Date(ts).toDateString();

/** Cards, photos and posts are objects, not lines of text: they never sit flush, even in a run. */
const isBlock = (m: Message) =>
  !m.deletedAt && (m.kind === "card" || m.attachments.some((a) => a.kind === "image") || /^# /.test(m.body));

/**
 * The gap above a message, the way iMessage, WhatsApp and Telegram space a
 * conversation: lines in one burst stay close, a pause opens a little air,
 * a new speaker gets a clear break. Day labels and the "New" line carry their
 * own margins, so a message right under one needs none.
 */
function gapBefore(prev: Message | undefined, message: Message, joinPrev: boolean, breakBefore: boolean) {
  if (!prev || breakBefore) return 0;
  if (joinPrev) return isBlock(prev) || isBlock(message) ? 10 : 4;
  return prev.authorId === message.authorId ? 12 : 18;
}

const clock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function MessageList({
  chatId, messages, meId, isGroupChat, intro, firstUnreadId, typingUsers, hasEarlier, onLoadEarlier, notes = [], children,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Fresh thread on open: what's already there is "seen" from the first
  // render, so nothing animates in. (Seeding it in an effect ran too late:
  // every bubble played its entrance on open.)
  const [openedWith] = useState(() => new Set(messages.map((m) => m.id)));
  const seenIds = useRef(openedWith);
  const pendingScrollRestore = useRef<number | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  // Land at the bottom on open.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
    if (nearBottom || sentByMe) el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
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

  // Per-thread lookups, once per change instead of per row per render.
  const { days, byId } = useMemo(
    () => ({ days: messages.map((m) => dayKey(m.createdAt)), byId: new Map(messages.map((m) => [m.id, m])) }),
    [messages],
  );

  // Far from the bottom, a button takes you back — and counts what arrived meanwhile.
  // Only messages after the previous last one count: older pages prepended by
  // "Load earlier" are not news.
  const [away, setAway] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const lastSeenId = useRef(messages[messages.length - 1]?.id);
  useEffect(() => {
    const from = messages.findIndex((m) => m.id === lastSeenId.current);
    const added = from >= 0 ? messages.length - 1 - from : 0;
    lastSeenId.current = messages[messages.length - 1]?.id;
    if (added > 0 && away) setUnseen((n) => n + added);
  }, [messages, away]);
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth() });
    setAway(false);
    setUnseen(0);
  };

  const typists = useTypists(typingUsers);

  return (
    <>
    <div className={styles.thread} ref={scrollRef} data-thread onScroll={onScroll} role="log" aria-label="Messages">
      <div className={styles.threadFill} />

      {hasEarlier ? (
        <button className={styles.loadEarlier} onClick={handleLoadEarlier} disabled={loadingEarlier}>
          {loadingEarlier && <span className={styles.spinner} />}
          {loadingEarlier ? "Loading…" : "Load earlier messages"}
        </button>
      ) : (
        <div className={styles.threadIntro}>
          <Avatar glyph={intro.glyph} tone={intro.tone} photo={intro.photo} size={72} />
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
        const showDay = !prev || days[i - 1] !== days[i];
        const breakBefore = showDay || firstUnreadId === message.id;
        const joinPrev = !breakBefore && isGrouped(prev, message) && !prev?.deletedAt;
        const nextBreaks = !next || days[i + 1] !== days[i] || firstUnreadId === next.id;
        const joinNext = !nextBreaks && isGrouped(message, next) && !next?.deletedAt;
        const pos: BubblePos = joinPrev ? (joinNext ? "middle" : "last") : joinNext ? "first" : "single";
        const isMine = message.authorId === meId;
        const quoted = message.replyToId ? byId.get(message.replyToId) : undefined;
        // New means it arrived after the last message you'd seen — not an older page loaded above.
        const isNew = !seenIds.current.has(message.id) && message.createdAt >= (byId.get(lastSeenId.current ?? "")?.createdAt ?? 0);

        return (
          <div key={message.id} style={{ paddingTop: gapBefore(prev, message, joinPrev, breakBefore) }}>
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
              isNew,
            })}
            {notes.filter((n) => n.at >= message.createdAt && (!next || n.at < next.createdAt)).map((n) => (
              <div key={n.id} className={styles.threadNote}>
                {n.onTap ? <button onClick={n.onTap}>{n.text}</button> : <span>{n.text}</span>}
              </div>
            ))}
          </div>
        );
      })}

      {typists.length > 0 && <TypingRow typists={typists} group={isGroupChat} />}

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

interface Typist { id: string; leaving: boolean }

/**
 * Who the typing bubble shows, in the order they started. Someone who stops
 * stays a moment longer, so their face shrinks away instead of vanishing.
 * Derived during render (React's "adjust state on prop change" pattern).
 */
function useTypists(ids: string[]) {
  const key = ids.join(" ");
  const [seen, setSeen] = useState(key);
  const [shown, setShown] = useState<Typist[]>(() => ids.map((id) => ({ id, leaving: false })));
  if (key !== seen) {
    setSeen(key);
    setShown([
      ...shown.map((t) => ({ id: t.id, leaving: !ids.includes(t.id) })),
      ...ids.filter((id) => !shown.some((t) => t.id === id)).map((id) => ({ id, leaving: false })),
    ]);
  }
  const gone = shown.filter((t) => t.leaving).map((t) => t.id).join(" ");
  useEffect(() => {
    if (!gone) return;
    const t = setTimeout(() => setShown((list) => list.filter((x) => !x.leaving)), 220);
    return () => clearTimeout(t);
  }, [gone]);
  return shown;
}

/** Faces in the bubble before a "+2". */
const MAX_FACES = 3;

/**
 * The typing bubble. In a group it carries the faces of everyone typing,
 * overlapping, with their names above like a byline: faces pop in as people
 * start and shrink away as they stop, and the bubble resizes around them.
 */
function TypingRow({ typists, group }: { typists: Typist[]; group: boolean }) {
  const active = typists.filter((t) => !t.leaving).map((t) => t.id);
  // While the last one fades out, their name stays with them.
  const names = active.length ? active : typists.map((t) => t.id);
  const more = typists.slice(MAX_FACES).filter((t) => !t.leaving).length;
  return (
    <div className={`${styles.row} ${styles.theirs} ${styles.typingRow} ${active.length ? styles.enterTheirs : styles.typingLeaving}`}>
      {group && <div className={styles.avatarSlot} />}
      <div className={styles.stack}>
        {group && <span className={styles.byline}>{typingNames(names)}</span>}
        <div className={`${styles.typingBubble} ${group ? styles.typingGroup : ""}`} aria-label={group ? typingLine(names) : "typing"}>
          {group && (
            <span className={styles.typingFaces} aria-hidden="true">
              {typists.slice(0, MAX_FACES).map((t) => {
                const u = userById(t.id);
                return (
                  <span key={t.id} className={`${styles.typingFace} ${t.leaving ? styles.typingFaceOut : ""}`}>
                    <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={24} shape="circle" />
                  </span>
                );
              })}
              {more > 0 && <span className={`${styles.typingFace} ${styles.typingMore}`}>+{more}</span>}
            </span>
          )}
          <span className={styles.typingDots} aria-hidden="true"><i /><i /><i /></span>
        </div>
      </div>
    </div>
  );
}
