"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chatIdentity, initials, TONES } from "@/lib/chat/avatar";
import { stripFormatting } from "@/lib/chat/markdown";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBellOff, IconClose, IconPin } from "./Icons";
import Logo from "./Logo";
import { emojify } from "@/lib/chat/emoji";
import StatusBar from "./StatusBar";
import styles from "./chat.module.css";

type Filter = "all" | "unread" | "dms" | "spaces";
type Tab = "chats" | "mind" | "spaces" | "explore";

const REVEAL = 124;

type PrimaryTab = Exclude<Tab, "explore">;

const TABS: { id: PrimaryTab; label: string; icon: string; w: number; h: number }[] = [
  { id: "chats", label: "Chats", icon: "/nod/chats.svg", w: 18, h: 18 },
  { id: "mind", label: "Mind", icon: "/nod/mind.svg", w: 16, h: 16 },
  { id: "spaces", label: "Spaces", icon: "/nod/spaces.svg", w: 30, h: 16 },
];

/** Figma icons render through a mask so they follow the theme's ink colour. */
function MaskIcon({ src, w, h }: { src: string; w: number; h: number }) {
  return <span className={styles.maskIcon} style={{ width: w, height: h, ["--src" as string]: `url(${src})` }} aria-hidden="true" />;
}

function preview(message: Message | undefined, me: string) {
  if (!message) return "No messages yet";
  if (message.deletedAt) return "Message deleted";
  const who = message.authorId === me ? "You: " : "";
  if (message.kind === "voice") return `${who}Voice message`;
  if (!message.body && message.attachments.length) return `${who}${message.attachments[0].name}`;
  return who + stripFormatting(message.body);
}

function timeLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString()) return "Yesterday";
  if (now.getTime() - ts < 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A row that slides left to reveal Pin / Mute, and springs back otherwise. */
function SwipeRow({
  children, onTap, onPin, onMute, pinned, muted,
}: {
  children: React.ReactNode;
  onTap: () => void;
  onPin: () => void;
  onMute: () => void;
  pinned: boolean;
  muted: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const [settling, setSettling] = useState(false);

  const apply = (x: number) => {
    if (ref.current) ref.current.style.transform = x ? `translateX(${x}px)` : "";
    wrapRef.current?.style.setProperty("--reveal", String(Math.min(1, -x / REVEAL)));
  };

  const settle = (x: number) => {
    setSettling(true);
    setOffset(x);
    apply(x);
    setTimeout(() => setSettling(false), 360);
  };

  return (
    <div className={styles.inboxRowWrap} ref={wrapRef}>
      <div className={styles.rowActions}>
        <button className={`${styles.rowAction} ${styles.rowActionPin}`} aria-label={pinned ? "Unpin" : "Pin"} onClick={() => { onPin(); settle(0); }}>
          <IconPin />
        </button>
        <button className={`${styles.rowAction} ${styles.rowActionMute}`} aria-label={muted ? "Unmute" : "Mute"} onClick={() => { onMute(); settle(0); }}>
          <IconBellOff />
        </button>
      </div>
      <button
        ref={ref}
        className={`${styles.inboxRow} ${settling ? styles.settling : ""}`}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, base: offset, active: false }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.active) {
            if (Math.abs(dy) > 8) { drag.current = null; return; }
            if (Math.abs(dx) < 8) return;
            d.active = true;
            ref.current?.setPointerCapture(e.pointerId);
          }
          // Rubber-band past the reveal width so it never feels like a wall.
          let x = Math.min(0, d.base + dx);
          if (x < -REVEAL) x = -REVEAL - (-REVEAL - x) * .25;
          apply(x);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.active) return;
          const x = Math.min(0, d.base + (e.clientX - d.x));
          settle(x < -REVEAL / 2 ? -REVEAL : 0);
        }}
        onPointerCancel={() => { drag.current = null; settle(offset); }}
        onClick={(e) => {
          if (offset !== 0) { e.preventDefault(); settle(0); return; }
          onTap();
        }}
      >
        {children}
      </button>
    </div>
  );
}

/**
 * iOS 26-style dock: a glass capsule of primary tabs plus a detached search
 * orb. Searching collapses the capsule to a single button and grows the orb
 * into a search pill.
 */
function NavDock({
  tab, last, searching, query, onTab, onOpenSearch, onCloseSearch, onQuery,
}: {
  tab: Tab;
  last: PrimaryTab;
  searching: boolean;
  query: string;
  onTab: (t: PrimaryTab) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onQuery: (q: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stretch, setStretch] = useState(false);
  const index = Math.max(0, TABS.findIndex((t) => t.id === tab));
  const current = TABS.find((t) => t.id === last) ?? TABS[0];

  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const choose = (t: PrimaryTab) => {
    if (t === tab) return;
    // The lens squashes while it travels, then settles — a liquid, not a slide.
    setStretch(true);
    setTimeout(() => setStretch(false), 260);
    onTab(t);
  };

  return (
    <div className={styles.navDock}>
      <nav className={`${styles.navCapsule} ${styles.liquid} ${searching ? styles.navCollapsed : ""}`} aria-label="Primary">
        <div className={styles.navTabs} aria-hidden={searching}>
          <span
            className={`${styles.navLens} ${stretch ? styles.navLensMoving : ""}`}
            style={{ ["--x" as string]: `${index * 100}%` }}
            aria-hidden="true"
          />
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.navItem} ${tab === t.id ? styles.navOn : ""}`}
              onClick={() => choose(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              tabIndex={searching ? -1 : 0}
            >
              <span className={styles.tabIcon}><MaskIcon src={t.icon} w={t.w} h={t.h} /></span>
              {t.label}
            </button>
          ))}
        </div>
        <button
          className={styles.navCurrent}
          onClick={onCloseSearch}
          aria-label={`Back to ${current.label}`}
          tabIndex={searching ? 0 : -1}
        >
          <MaskIcon src={current.icon} w={current.w} h={current.h} />
        </button>
      </nav>

      <div className={`${styles.navOrb} ${styles.liquid} ${searching ? styles.navOrbOpen : ""}`}>
        <button className={styles.orbIcon} onClick={onOpenSearch} aria-label="Explore and search" tabIndex={searching ? -1 : 0}>
          <MaskIcon src="/nod/explore.svg" w={18} h={18} />
        </button>
        <input
          ref={inputRef}
          className={styles.orbInput}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onCloseSearch(); }}
          placeholder="People, spaces, messages"
          aria-label="Search people, spaces and messages"
          tabIndex={searching ? 0 : -1}
        />
        <button className={styles.orbClose} onClick={onCloseSearch} aria-label="Close search" tabIndex={searching ? 0 : -1}>
          <IconClose size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Inbox({ onOpen, pushed }: { onOpen: (chat: Chat) => void; pushed: boolean }) {
  const { state, me, peers, typingUsers } = useChat();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("chats");
  const [lastTab, setLastTab] = useState<PrimaryTab>("chats");
  const [exploreQuery, setExploreQuery] = useState("");
  const searching = tab === "explore";
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(["dm"]));
  const [muted, setMuted] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const meUser = userById(me);

  const rows = useMemo(() => {
    return state.data.chats.map((chat) => {
      const messages = state.data.messages[chat.id] ?? [];
      const last = messages[messages.length - 1];
      const lastRead = state.data.lastReadAt[chat.id] ?? 0;
      const unreadMsgs = messages.filter((m) => m.authorId !== me && m.createdAt > lastRead);
      const mentioned = unreadMsgs.some((m) => m.body.includes(`@${userById(me).name}`));
      return { chat, last, unread: unreadMsgs.length, mentioned };
    });
  }, [state.data, me]);

  // Conversations (and their clock-relative labels) exist only once local
  // storage has loaded; rendering the seed on the server would mismatch.
  const ready = state.hydrated;
  const unreadChats = ready ? rows.filter((r) => r.unread > 0).length : 0;
  const spaceMention = ready && rows.some((r) => r.chat.kind === "group" && r.mentioned);
  const effective: Filter = tab === "spaces" ? "spaces" : searching ? "all" : filter;

  const visible = (ready ? rows : [])
    .filter(({ chat, last, unread }) => {
      if (effective === "unread" && unread === 0) return false;
      if (effective === "dms" && chat.kind !== "dm") return false;
      if (effective === "spaces" && chat.kind !== "group") return false;
      const text = searching ? exploreQuery : query;
      if (!text.trim()) return true;
      const q = text.toLowerCase();
      return chatIdentity(chat, me, userById).label.toLowerCase().includes(q) || preview(last, me).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const pa = pinned.has(a.chat.id) ? 1 : 0;
      const pb = pinned.has(b.chat.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0);
    });

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  const chips: { id: Filter; label: string; badge?: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread", badge: unreadChats ? String(unreadChats) : undefined },
    { id: "dms", label: "DMs" },
    { id: "spaces", label: "Spaces", badge: spaceMention ? "@" : undefined },
  ];

  const placeholder = (title: string, body: string) => (
    <div className={styles.tabEmpty}>
      <Logo size={40} />
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );

  return (
    <div className={`${styles.screen} ${styles.inboxScreen} ${pushed ? styles.pushed : ""}`}>
      <StatusBar />

      <header className={styles.profile}>
        <div className={styles.profileRow}>
          <div className={styles.profileId}>
            <span className={styles.profileAvatar}>
              <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} size={40} shape="circle" />
              <span className={styles.orgBadge}><Logo size={12} /></span>
            </span>
            <div className={styles.profileText}>
              <b>Your inbox</b>
              <span>
                <span className={styles.maskIcon} style={{ width: 12, height: 12, ["--src" as string]: "url(/nod/phone.svg)" }} aria-hidden="true" />
                +43 123456789
              </span>
            </div>
          </div>
          <button className={styles.plusBtn} aria-label="New message" onClick={() => { setTab("chats"); setLastTab("chats"); searchRef.current?.focus(); }}>
            <span className={styles.maskIcon} style={{ width: 16, height: 16, ["--src" as string]: "url(/nod/plus.svg)" }} aria-hidden="true" />
          </button>
        </div>
        <label className={styles.searchBar}>
          <span className={styles.maskIcon} style={{ width: 16, height: 16, ["--src" as string]: "url(/nod/search.svg)" }} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for messages, users, items and more..."
          />
        </label>
      </header>

      <div className={styles.inboxBody}>
        {tab === "mind" ? placeholder("Mind", "Your notes, saved messages and ideas will live here.")
        : (
          <div className={styles.inboxScroll}>
            {searching && (
              <p className={styles.exploreLabel}>{exploreQuery.trim() ? "Results" : "Recent"}</p>
            )}
            {tab === "chats" && (
              <div className={styles.chips} role="tablist">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={filter === c.id}
                    className={`${styles.chip} ${filter === c.id ? styles.chipOn : ""}`}
                    onClick={() => setFilter(c.id)}
                  >
                    {c.label}
                    {c.badge && <span className={styles.chipBadge}>{c.badge}</span>}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.rows} key={`${tab}-${effective}`}>
              {visible.map(({ chat, last, unread, mentioned }, i) => {
                const id = chatIdentity(chat, me, userById);
                const other = chat.kind === "dm" ? chat.memberIds.find((m) => m !== me) : undefined;
                const online = !!other && peers.some((p) => p.userId === other);
                const typing = typingUsers(chat.id).filter((u) => u !== me);
                const isMuted = muted.has(chat.id);
                const showBadge = unread > 0 && !isMuted;
                return (
                  <div key={chat.id} className={styles.rowEnter} style={{ ["--i" as string]: i }}>
                    <SwipeRow
                      onTap={() => onOpen(chat)}
                      pinned={pinned.has(chat.id)}
                      muted={isMuted}
                      onPin={() => setPinned((s) => toggle(s, chat.id))}
                      onMute={() => setMuted((s) => toggle(s, chat.id))}
                    >
                      {chat.kind === "group" ? (
                        <span className={styles.spaceAvatar} style={{ background: TONES[id.tone] }}><Logo size={36} /></span>
                      ) : (
                        <Avatar glyph={id.glyph} tone={id.tone} size={56} shape="circle" online={online} />
                      )}
                      <div className={styles.rowMain}>
                        <div className={styles.rowText}>
                          <span className={styles.rowName}>{id.label}</span>
                          <span className={styles.rowPreview}>
                            {typing.length > 0 ? (
                              <span className={styles.typingText}>
                                {chat.kind === "group" ? `${userById(typing[0]).name} is typing` : "typing"}
                                <span className={styles.ellipsis}><i>.</i><i>.</i><i>.</i></span>
                              </span>
                            ) : emojify(preview(last, me))}
                          </span>
                        </div>
                        <div className={styles.rowSide}>
                          <span className={`${styles.rowTime} ${showBadge ? styles.rowTimeUnread : ""}`}>
                            {pinned.has(chat.id) && <IconPin size={11} />}
                            {isMuted && <IconBellOff size={11} />}
                            {last ? timeLabel(last.createdAt) : ""}
                          </span>
                          {showBadge && <span className={styles.rowBadge}>{mentioned ? "@" : unread}</span>}
                        </div>
                      </div>
                    </SwipeRow>
                  </div>
                );
              })}

              {!ready && [0, 1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonRow} aria-hidden="true">
                  <span /><div><i /><i /></div>
                </div>
              ))}
              {ready && visible.length === 0 && (
                <p className={styles.emptyInbox}>
                  {(searching ? exploreQuery : query) ? `Nothing matches “${searching ? exploreQuery : query}”` : effective === "unread" ? "You're all caught up." : "No conversations yet."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.edgeBottom} />
      <NavDock
        tab={tab}
        last={lastTab}
        searching={searching}
        query={exploreQuery}
        onTab={(t) => { setTab(t); setLastTab(t); }}
        onOpenSearch={() => setTab("explore")}
        onCloseSearch={() => { setTab(lastTab); setExploreQuery(""); }}
        onQuery={setExploreQuery}
      />
    </div>
  );
}
