"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stripFormatting } from "@/lib/chat/markdown";
import { USERS } from "@/lib/chat/seed";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import Composer from "./Composer";
import ContextMenu from "./ContextMenu";
import MessageList from "./MessageList";
import MessageRow from "./MessageRow";
import StatusBar from "./StatusBar";
import styles from "./chat.module.css";

export default function ChatView({ chat, onBack }: { chat: Chat; onBack: () => void }) {
  const {
    state, me, send, retry, toggleReaction, editMessage, deleteMessage,
    togglePin, loadEarlier, hasEarlier, setTyping, typingUsers, markRead,
  } = useChat();

  const containerRef = useRef<HTMLDivElement>(null);
  // The container rect is captured when the menu opens; reading the ref during
  // render is unsafe under concurrent rendering.
  const [menu, setMenu] = useState<{ message: Message; anchor: DOMRect; container: DOMRect } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const messages = useMemo(() => state.data.messages[chat.id] ?? [], [state.data.messages, chat.id]);
  const typing = typingUsers(chat.id).filter((id) => id !== me);

  // Frozen on open so the divider doesn't chase incoming messages.
  const [firstUnreadId] = useState(() => {
    const lastRead = state.data.lastReadAt[chat.id] ?? 0;
    if (!lastRead) return null;
    return messages.find((m) => m.authorId !== me && m.createdAt > lastRead)?.id ?? null;
  });

  useEffect(() => {
    markRead(chat.id);
    const onVisible = () => {
      if (document.visibilityState === "visible") markRead(chat.id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  };

  const jumpTo = (messageId: string) => {
    const el = containerRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(messageId);
    setTimeout(() => setHighlighted(null), 1200);
  };

  // Mention candidates never include the current user, whoever that is.
  const members = USERS.filter((u) => chat.memberIds.includes(u.id) && u.id !== me);
  const presence = typing.length
    ? chat.kind === "group"
      ? `${userById(typing[0]).name} is typing…`
      : "typing…"
    : chat.kind === "group"
      ? `${chat.memberIds.length} members`
      : "Active now";

  return (
    // `.app` is absolutely positioned by the shell; that bounded height is what
    // makes the message list scroll instead of overflowing, and it already acts
    // as the containing block the context menu positions against.
    <div className="app" ref={containerRef}>
      <StatusBar />
      <div className={styles.chatHeader}>
        <button className={styles.iconBtn} onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className={styles.titlePill}>
          <img src={chat.avatar} alt="" />
          <div className={styles.titleNames}>
            <b>{chat.name}</b>
            <span className={typing.length ? styles.typing : undefined}>{presence}</span>
          </div>
        </div>
      </div>

      <MessageList
        chatId={chat.id}
        messages={messages}
        meId={me}
        isGroupChat={chat.kind === "group"}
        firstUnreadId={firstUnreadId}
        typingUsers={typing}
        hasEarlier={hasEarlier(chat.id)}
        onLoadEarlier={() => loadEarlier(chat.id)}
      >
        {({ message, quoted, isMine, grouped, showAuthor, showStatus, isNew }) => (
          <MessageRow
            message={message}
            quoted={quoted}
            isMine={isMine}
            grouped={grouped}
            showAuthor={showAuthor}
            showStatus={showStatus}
            isNew={isNew}
            highlighted={highlighted === message.id}
            meId={me}
            onReply={(m) => { setReplyTo(m); setEditing(null); }}
            onMenu={(m, anchor) => {
              const container = containerRef.current?.getBoundingClientRect();
              if (container) setMenu({ message: m, anchor, container });
            }}
            onToggleReaction={toggleReaction}
            onRetry={retry}
            onJumpTo={jumpTo}
          />
        )}
      </MessageList>

      <Composer
        key={`${chat.id}:${editing?.id ?? "compose"}`}
        chatId={chat.id}
        members={members}
        placeholder={chat.kind === "group" ? "Message #General" : `Message ${chat.name}`}
        replyTo={replyTo}
        editing={editing}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
        onSend={(body, attachments) => {
          send(chat.id, body, { replyToId: replyTo?.id ?? null, attachments });
          setReplyTo(null);
        }}
        onSaveEdit={(body) => {
          if (editing) editMessage(editing, body);
          setEditing(null);
        }}
        onTyping={(isTyping) => setTyping(chat.id, isTyping)}
      />

      {menu && (
        <ContextMenu
          message={menu.message}
          anchor={menu.anchor}
          container={menu.container}
          isMine={menu.message.authorId === me}
          meId={me}
          onClose={() => setMenu(null)}
          onReact={(emoji) => toggleReaction(menu.message, emoji)}
          onReply={() => { setReplyTo(menu.message); setEditing(null); }}
          onEdit={() => { setEditing(menu.message); setReplyTo(null); }}
          onDelete={() => { deleteMessage(menu.message); flash("Message deleted"); }}
          onPin={() => { togglePin(menu.message); flash(menu.message.pinned ? "Unpinned" : "Pinned"); }}
          onCopy={() => {
            void navigator.clipboard?.writeText(stripFormatting(menu.message.body));
            flash("Copied to clipboard");
          }}
        />
      )}

      {toast && (
        <div className={styles.toast}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#17b26a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
