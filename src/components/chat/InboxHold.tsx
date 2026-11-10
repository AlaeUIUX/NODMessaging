"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { chatIdentity, TONES } from "@/lib/chat/avatar";
import { emojify } from "@/lib/chat/emoji";
import { landingChannel } from "@/lib/chat/groups";
import { useChat, userById } from "@/lib/chat/store";
import Avatar from "./Avatar";
import Logo from "./Logo";
import { previewParts, Ticks, type RowData } from "./InboxRow";
import type { HoldAction } from "./MindHold";
import { useDialog } from "./ui";
import styles from "./chat.module.css";
import inbox from "./inbox.module.css";

/**
 * Hold a chat in the list: it rises as a peek at the conversation (its last
 * messages and where you stopped reading) with the chat's menu under it, the
 * way WhatsApp does. Tapping the peek opens the chat.
 */

const TOP = 58;
const BOTTOM = 30;
const GAP = 10;
const SIDE = 16;
const PEEK_MAX = 380;
const PEEK_MIN = 180;
const CLOSE_MS = 220;

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function ChatHold({ anchor, row, me, actions, onOpen, onClose }: {
  anchor: HTMLElement;
  row: RowData;
  me: string;
  actions: HoldAction[];
  onOpen: () => void;
  onClose: () => void;
}) {
  const { state, lastReadAt } = useChat();
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<{ height: number; menuTop: number; fromY: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  // The finger that held is still coming up: that release must not close the menu.
  const canDismiss = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { canDismiss.current = true; }, 450);
    return () => clearTimeout(t);
  }, []);

  const items = actions.filter((a) => a !== "sep").length;
  const menuH = 12 + items * 44 + (actions.length - items) * 11;

  useLayoutEffect(() => {
    const host = rootRef.current?.getBoundingClientRect();
    if (!host) return;
    const r = anchor.getBoundingClientRect();
    const height = Math.max(PEEK_MIN, Math.min(PEEK_MAX, host.height - TOP - BOTTOM - menuH - GAP));
    setPlace({ height, menuTop: TOP + height + GAP, fromY: r.top - host.top - TOP });
  }, [anchor, menuH]);

  useEffect(() => { firstRef.current?.focus({ preventScroll: true }); }, [place]);

  const close = (after?: () => void) => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    setTimeout(() => { onClose(); after?.(); }, CLOSE_MS);
  };
  const dismiss = () => { if (canDismiss.current) close(); };
  useDialog(rootRef, dismiss);

  const chat = row.chat;
  const id = chatIdentity(chat, me, userById);
  // The thread the newest message is in; a quiet group shows its landing channel.
  const threadId = row.last?.chatId ?? (chat.kind === "group" ? landingChannel(state.data.chats, chat, me).id : chat.id);
  const all = state.data.messages[threadId] ?? [];
  const messages = all.slice(-14);
  const readAt = lastReadAt(threadId);
  const unread = all.filter((m) => m.authorId !== me && m.createdAt > readAt);
  const firstUnread = unread.length ? Math.max(0, messages.findIndex((m) => m.id === unread[0].id)) : -1;
  const sub = chat.kind === "group" ? `${chat.memberIds.length} ${chat.memberIds.length === 1 ? "member" : "members"}` : null;

  const firstIdx = actions.findIndex((a) => a !== "sep");
  return (
    <div
      ref={rootRef}
      className={`${styles.overlay} ${closing ? `${styles.closing} ${inbox.holdClosing}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={id.label}
    >
      <div className={styles.scrim} onClick={dismiss} />
      {place && (
        <>
          <div
            className={inbox.peek}
            style={{ top: TOP, left: SIDE, right: SIDE, height: place.height, ["--from-y" as string]: `${place.fromY}px` }}
            role="button"
            tabIndex={-1}
            aria-label={`Open ${id.label}`}
            onClick={() => close(onOpen)}
          >
            <div className={inbox.peekHead}>
              {chat.kind === "group" ? (
                id.photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className={inbox.peekAvatar} src={id.photo} alt="" />
                  : <span className={inbox.peekAvatar} style={{ background: TONES[id.tone] }}><Logo size={22} /></span>
              ) : (
                <Avatar glyph={id.glyph} tone={id.tone} photo={id.photo} size={34} shape="circle" />
              )}
              <div style={{ minWidth: 0 }}>
                <b className={inbox.peekName}>{id.label}</b>
                {sub && <span className={inbox.peekSub}>{sub}</span>}
              </div>
            </div>
            <div className={inbox.peekBody}>
              {messages.length === 0 && <p className={inbox.peekEmpty}>No messages yet</p>}
              {messages.map((m, i) => {
                const mine = m.authorId === me;
                const prev = messages[i - 1];
                const startsRun = !prev || prev.authorId !== m.authorId || i === firstUnread;
                const p = previewParts(m, chat, me);
                return (
                  <Fragment key={m.id}>
                    {i === firstUnread && (
                      <p className={inbox.peekUnread}>{unread.length} unread {unread.length === 1 ? "message" : "messages"}</p>
                    )}
                    <div className={`${inbox.peekMsg} ${mine ? inbox.peekMine : ""}`}>
                      <div className={inbox.peekBubble}>
                        {chat.kind === "group" && !mine && startsRun && <b className={inbox.peekWho}>{userById(m.authorId).name}</b>}
                        {p.icon && <span className={inbox.kindIcon}>{p.icon}</span>}
                        <span className={p.quiet ? inbox.quietText : undefined}>{emojify(p.text)}</span>
                        <span className={inbox.peekTime}>
                          {hhmm(m.createdAt)}
                          {mine && !m.deletedAt && <Ticks status={m.status} />}
                        </span>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
          <div className={`${styles.menu} ${styles.glassStrong}`} style={{ top: place.menuTop, left: SIDE, width: 262, transformOrigin: "top left" }} role="menu">
            {actions.map((a, i) => {
              if (a === "sep") return <div key={`sep-${i}`} className={styles.menuSep} />;
              return (
                <button
                  key={a.id}
                  ref={i === firstIdx ? firstRef : undefined}
                  role="menuitem"
                  className={`${styles.menuItem} ${a.danger ? styles.danger : ""}`}
                  onClick={() => close(a.run)}
                >
                  {a.label}
                  {a.icon}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
