"use client";

import { useMemo, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { USERS } from "@/lib/chat/seed";
import { useChat } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconCheck, IconChevron, IconSearch, IconShare, IconUserGroup } from "./Icons";
import { Sheet } from "./ui";
import styles from "./chat.module.css";

/**
 * WhatsApp-style "New chat": quick actions first, then frequently contacted,
 * then everyone A–Z. "New group" is a second step inside the same sheet.
 */
export default function NewChat({ onOpen, onClose }: { onOpen: (chat: Chat) => void; onClose: () => void }) {
  const { state, me, peers, createGroup } = useChat();
  const [step, setStep] = useState<"pick" | "group">("pick");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [copied, setCopied] = useState(false);

  const contacts = USERS.filter((u) => u.id !== me);
  const dmWith = (id: string) => state.data.chats.find((c) => c.kind === "dm" && c.memberIds.includes(id) && c.memberIds.includes(me));

  // "Frequently contacted" = the people you've messaged most recently.
  const frequent = useMemo(() => {
    const lastAt = (id: string) => {
      const chat = dmWith(id);
      const list = chat ? state.data.messages[chat.id] ?? [] : [];
      return list[list.length - 1]?.createdAt ?? 0;
    };
    return [...contacts].sort((a, b) => lastAt(b.id) - lastAt(a.id)).slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, me]);

  const q = query.trim().toLowerCase();
  const matches = contacts.filter((u) => !q || u.name.toLowerCase().includes(q));
  const byLetter = matches.reduce<Record<string, typeof contacts>>((acc, u) => {
    const k = u.name[0].toUpperCase();
    (acc[k] ??= []).push(u);
    return acc;
  }, {});

  const presence = (id: string) =>
    peers.some((p) => p.userId === id) ? "Active now"
    : step === "group" ? (selected.includes(id) ? "Added" : "Tap to add")
    : "Tap to message";

  const person = (u: (typeof contacts)[number], close: (after?: () => void) => void) => (
    <button
      key={u.id}
      className={styles.contactRow}
      onClick={() => {
        if (step === "group") {
          setSelected((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]));
          return;
        }
        const chat = dmWith(u.id);
        if (chat) close(() => onOpen(chat));
      }}
    >
      <Avatar glyph={initials(u.fullName)} tone={u.tone} size={40} shape="circle" online={peers.some((p) => p.userId === u.id)} />
      <span className={styles.contactText}><b>{u.name}</b><small>{presence(u.id)}</small></span>
      {step === "group" && (
        <span className={`${styles.pickCircle} ${selected.includes(u.id) ? styles.pickOn : ""}`}>
          {selected.includes(u.id) && <IconCheck size={12} />}
        </span>
      )}
    </button>
  );

  if (step === "group") {
    return (
      <Sheet
        title="New group"
        onClose={onClose}
        action={{
          label: "Create",
          disabled: !groupName.trim() || selected.length === 0,
          onClick: () => onOpen(createGroup(groupName, selected)),
        }}
      >
        {(close) => (
          <>
            <input
              className={styles.bigInput}
              autoFocus
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            {selected.length > 0 && (
              <div className={styles.memberPick}>
                {selected.map((id) => {
                  const u = USERS.find((x) => x.id === id)!;
                  return (
                    <button key={id} className={styles.memberOn} onClick={() => setSelected((s) => s.filter((x) => x !== id))}>
                      <Avatar glyph={initials(u.fullName)} tone={u.tone} size={40} shape="circle" />
                      <span>{u.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className={styles.sheetLabel}>Members · {selected.length} of {contacts.length}</p>
            <div className={styles.listGroup}>{contacts.map((u) => person(u, close))}</div>
          </>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet title="New chat" onClose={onClose}>
      {(close) => (
        <>
          <label className={styles.sheetSearch}>
            <IconSearch size={18} />
            <input placeholder="Search name" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>

          {!q && (
            <div className={styles.listGroup}>
              <button className={styles.actionRow} onClick={() => setStep("group")}>
                <span className={styles.actionIcon}><IconUserGroup size={20} /></span>
                <span className={styles.contactText}><b>New group</b><small>Chat with several people at once</small></span>
                <IconChevron size={16} />
              </button>
              <button
                className={styles.actionRow}
                onClick={async () => {
                  const link = typeof window !== "undefined" ? window.location.origin : "";
                  try {
                    if (navigator.share) await navigator.share({ title: "Join me on NOD", url: link });
                    else { await navigator.clipboard.writeText(link); setCopied(true); }
                  } catch { /* dismissed */ }
                }}
              >
                <span className={styles.actionIcon}><IconShare size={20} /></span>
                <span className={styles.contactText}><b>Invite a friend</b><small>{copied ? "Link copied" : "Share a link to NOD"}</small></span>
                <IconChevron size={16} />
              </button>
            </div>
          )}

          {!q && (
            <>
              <p className={styles.sheetLabel}>Frequently contacted</p>
              <div className={styles.listGroup}>{frequent.map((u) => person(u, close))}</div>
            </>
          )}

          <p className={styles.sheetLabel}>Contacts on NOD</p>
          {Object.keys(byLetter).sort().map((letter) => (
            <div key={letter}>
              <p className={styles.letter}>{letter}</p>
              <div className={styles.listGroup}>{byLetter[letter].map((u) => person(u, close))}</div>
            </div>
          ))}
          {matches.length === 0 && <p className={styles.emptyInbox}>No one matches “{query}”.</p>}
        </>
      )}
    </Sheet>
  );
}
