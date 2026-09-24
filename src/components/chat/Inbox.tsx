"use client";

import { useMemo, useState } from "react";
import { stripFormatting } from "@/lib/chat/markdown";
import { useChat } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import StatusBar from "./StatusBar";
import styles from "./chat.module.css";

function preview(message: Message | undefined) {
  if (!message) return "No messages yet";
  if (message.deletedAt) return "This message was deleted";
  if (message.kind === "voice") return "🎤 Voice message";
  if (!message.body && message.attachments.length) return `📎 ${message.attachments[0].name}`;
  return stripFormatting(message.body);
}

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function Inbox({ onOpen }: { onOpen: (chat: Chat) => void }) {
  const { state, me } = useChat();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return state.data.chats.map((chat) => {
      const messages = state.data.messages[chat.id] ?? [];
      const last = messages[messages.length - 1];
      const lastRead = state.data.lastReadAt[chat.id] ?? 0;
      const unread = messages.filter((m) => m.authorId !== me && m.createdAt > lastRead).length;
      return { chat, last, unread };
    });
  }, [state.data, me]);

  const filtered = rows.filter(({ chat, last }) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return chat.name.toLowerCase().includes(q) || preview(last).toLowerCase().includes(q);
  });

  return (
    <div className="app">
      <StatusBar />
      <div className={styles.inboxHeader}>
        <h1>Chats</h1>
        <p>Everything, one tap away</p>
        <div className={styles.searchRow}>
          <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className={styles.inboxList}>
        {filtered.map(({ chat, last, unread }) => (
          <button key={chat.id} className={styles.inboxRow} onClick={() => onOpen(chat)}>
            <div className={styles.avatarWrap}>
              <img className={styles.avatar} src={chat.avatar} alt="" />
              {chat.kind === "dm" && <span className={styles.onlineDot} />}
            </div>
            <div className={styles.inboxMeta}>
              <div className={styles.row1}>
                <span className={styles.name}>{chat.name}</span>
                <span className={styles.time}>{last ? timeLabel(last.createdAt) : ""}</span>
              </div>
              <div className={styles.row1}>
                <span className={styles.preview}>{preview(last)}</span>
                {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#a8a29e", fontSize: 13, padding: "30px 20px" }}>
            No chats match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
