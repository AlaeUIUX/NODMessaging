"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chatIdentity, initials, TONES } from "@/lib/chat/avatar";
import { stripFormatting } from "@/lib/chat/markdown";
import { groupInfo, landingChannel, visibleChannels } from "@/lib/chat/groups";
import { describe, effectiveRule, isQuiet, QUICK_MUTE, useMutes } from "@/lib/chat/mutes";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBellOff, IconPin, IconShare, IconUserGroup } from "./Icons";
import Logo from "./Logo";
import { emojify } from "@/lib/chat/emoji";
import MindTab from "./Mind";
import Onboarding from "./Onboarding";
import { InviteSheet } from "./Invite";
import Settings from "./Settings";
import { formatPhone } from "@/lib/chat/people";
import NewChat from "./NewChat";
import { NewGroupSheet } from "./Groups";
import { MuteSheet } from "./Mute";
import { useNow } from "./ui";
import AnalyticsTab from "./Analytics";
import ExploreTab from "./Explore";
import StatusBar from "./StatusBar";
import styles from "./chat.module.css";

type Filter = "all" | "unread" | "dms" | "groups";
type Tab = "chats" | "mind" | "analytics" | "explore";

const REVEAL = 124;

/** Pins and mutes are this person's own, and survive a reload. */
const listKey = (kind: "pinned" | "muted", userId: string) => `nod.chat.${kind}.${userId}`;
function readList(kind: "pinned" | "muted", userId: string, fallback: string[]) {
  try {
    const raw = localStorage.getItem(listKey(kind, userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : fallback);
  } catch {
    return new Set(fallback);
  }
}
function writeList(kind: "pinned" | "muted", userId: string, ids: Set<string>) {
  try { localStorage.setItem(listKey(kind, userId), JSON.stringify([...ids])); } catch { /* private mode */ }
}

const TABS: { id: Tab; label: string; icon: string; w: number; h: number }[] = [
  { id: "chats", label: "Chats", icon: "/nod/chats.svg", w: 18, h: 18 },
  { id: "mind", label: "Mind", icon: "/nod/mind.svg", w: 16, h: 16 },
  { id: "analytics", label: "Analytics", icon: "/nod/analytics.svg", w: 18, h: 18 },
  { id: "explore", label: "Explore", icon: "/nod/explore.svg", w: 16, h: 16 },
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
  // A mouse drag still ends in a click; it must not open the chat or snap the row shut.
  const dragged = useRef(false);
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
    setTimeout(() => setSettling(false), 340);
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
        onPointerDown={(e) => {
          dragged.current = false;
          drag.current = { x: e.clientX, y: e.clientY, base: offset, active: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.active) {
            if (Math.abs(dy) > 8) { drag.current = null; return; }
            if (Math.abs(dx) < 8) return;
            d.active = true;
            dragged.current = true;
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
          if (dragged.current) { dragged.current = false; e.preventDefault(); return; }
          if (offset !== 0) { e.preventDefault(); settle(0); return; }
          onTap();
        }}
      >
        {children}
      </button>
    </div>
  );
}

/** A single glass capsule of the four primary tabs, with a liquid lens. */
function NavDock({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const [stretch, setStretch] = useState(false);
  const index = Math.max(0, TABS.findIndex((t) => t.id === tab));

  const choose = (t: Tab) => {
    if (t === tab) return;
    // The lens squashes while it travels, then settles — a liquid, not a slide.
    setStretch(true);
    setTimeout(() => setStretch(false), 220);
    onTab(t);
  };

  return (
    <div className={styles.navDock}>
      <nav className={`${styles.navCapsule} ${styles.liquid}`} aria-label="Primary">
        <div className={styles.navTabs}>
          <span
            className={`${styles.navLens} ${stretch ? styles.navLensMoving : ""}`}
            style={{ ["--x" as string]: `${index * 100}%`, width: `calc(100% / ${TABS.length})` }}
            aria-hidden="true"
          />
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.navItem} ${tab === t.id ? styles.navOn : ""}`}
              onClick={() => choose(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <span className={styles.tabIcon}><MaskIcon src={t.icon} w={t.w} h={t.h} /></span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function toggle(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export default function Inbox({ onOpen, pushed, analyticsMode, onOpenWidget }: {
  onOpen: (chat: Chat, messageId?: string) => void;
  pushed: boolean;
  analyticsMode: "v1" | "v2";
  onOpenWidget: (chat: Chat, message: Message) => void;
}) {
  const { state, me, setMe, isOnline, lastReadAt, typingUsers } = useChat();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("chats");
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(["dm"]));
  // Mutes are rules per chat (what notifies, for how long); a channel follows its group.
  const { rules, set: setRule } = useMutes(me);
  const now = useNow(60_000);
  const [muting, setMuting] = useState<Chat | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const meUser = userById(me);
  const [settings, setSettings] = useState<{ leaving: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; action?: { label: string; run: () => void } } | null>(null);
  const flash = useCallback((text: string, action?: { label: string; run: () => void }) => {
    const id = Date.now();
    setToast({ text, id, action });
    const stay = action ? 3600 : 2200;
    setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), stay);
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), stay + 220);
  }, [setToast]);
  const openSettings = () => setSettings({ leaving: false });
  const closeSettings = () => {
    setSettings((x) => (x ? { leaving: true } : x));
    setTimeout(() => setSettings((x) => (x?.leaving ? null : x)), 220);
  };

  // Read after mount (and per person): the prerendered HTML uses the defaults.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinned(readList("pinned", me, ["dm"]));
  }, [me]);
  const togglePinned = (id: string) => setPinned((s) => { const next = toggle(s, id); writeList("pinned", me, next); return next; });
  // One swipe: quiet (only @mentions get through; a DM goes fully quiet) or back on. Options for the details.
  const toggleMuted = (chat: Chat) => {
    const name = chatIdentity(chat, me, userById).label;
    if (isQuiet(effectiveRule(rules, chat, now))) {
      setRule(chat.id, null);
      flash(`Notifications on for ${name}`);
      return;
    }
    const rule = QUICK_MUTE(chat.kind === "dm");
    setRule(chat.id, rule);
    flash(`${name}: ${describe(rule, now).toLowerCase()}`, { label: "Options", run: () => setMuting(chat) });
  };

  // Only chats this person is in: signed in as Reema, the Alae–Charles DM isn't yours to read.
  // A group is one row for all the channels you can see: their unread add up, the newest message shows.
  const rows = useMemo(() => {
    const chats = state.data.chats;
    return chats.filter((chat) => chat.memberIds.includes(me) && !chat.groupId && !chat.removedAt).map((chat) => {
      const threads = chat.kind === "group"
        ? visibleChannels(chat, me).map((c) => chats.find((x) => x.id === c.id && !x.removedAt && x.memberIds.includes(me))).filter(Boolean) as Chat[]
        : [chat];
      let last: Message | undefined;
      let unread = 0;
      // What would actually notify: a muted channel adds nothing, "only @mentions" adds its mentions.
      let alert = 0;
      let mentioned = false;
      for (const t of threads) {
        const messages = state.data.messages[t.id] ?? [];
        const tail = messages[messages.length - 1];
        if (tail && (!last || tail.createdAt > last.createdAt)) last = tail;
        const lastRead = lastReadAt(t.id);
        const unreadMsgs = messages.filter((m) => m.authorId !== me && m.createdAt > lastRead);
        const mentions = unreadMsgs.filter((m) => m.body.includes(`@${userById(me).name}`)).length;
        const rule = effectiveRule(rules, t, now);
        unread += unreadMsgs.length;
        alert += !rule || rule.messages === "all" ? unreadMsgs.length : rule.messages === "mentions" ? mentions : 0;
        mentioned ||= mentions > 0 && rule?.messages !== "none";
      }
      const quiet = isQuiet(effectiveRule(rules, chat, now));
      // Which channel the newest message is in, when there's more than one to tell apart.
      const channel = chat.kind === "group" && threads.length > 1 && last && last.chatId !== chat.id
        ? groupInfo(chat).channels.find((c) => c.id === last!.chatId)?.name
        : undefined;
      return { chat, last, unread, alert, mentioned, channel, quiet };
    });
  }, [state.data, me, lastReadAt, rules, now]);
  // Groups that invited you: a red badge on + until you answer them (in New chat › Invitations).
  const invites = useMemo(
    () => state.data.chats.filter((c) => c.kind === "group" && !c.groupId && !c.removedAt && !c.memberIds.includes(me) && c.group?.invites.some((i) => i.userId === me)),
    [state.data.chats, me],
  );
  const openRow = (chat: Chat) => onOpen(chat.kind === "group" ? landingChannel(state.data.chats, chat, me) : chat);

  // Conversations (and their clock-relative labels) exist only once local
  // storage has loaded; rendering the seed on the server would mismatch.
  const ready = state.hydrated;
  // Muted chats keep their own count but stay out of the Unread badge (unless a mention gets through).
  const unreadChats = ready ? rows.filter((r) => r.alert > 0).length : 0;
  const spaceMention = ready && rows.some((r) => r.chat.kind === "group" && r.mentioned);

  const visible = (ready ? rows : [])
    .filter(({ chat, last, unread }) => {
      if (filter === "unread" && unread === 0) return false;
      if (filter === "dms" && chat.kind !== "dm") return false;
      if (filter === "groups" && chat.kind !== "group") return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return chatIdentity(chat, me, userById).label.toLowerCase().includes(q) || preview(last, me).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const pa = pinned.has(a.chat.id) ? 1 : 0;
      const pb = pinned.has(b.chat.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0);
    });


  const chips: { id: Filter; label: string; badge?: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread", badge: unreadChats ? String(unreadChats) : undefined },
    { id: "dms", label: "DMs" },
    { id: "groups", label: "Groups", badge: spaceMention ? "@" : undefined },
  ];

  return (
    // Covered by an open chat: out of the tab order and the accessibility tree.
    <div className={`${styles.screen} ${styles.inboxScreen} ${pushed ? styles.pushed : ""}`} data-inbox-screen inert={pushed}>
      <StatusBar />

      {tab === "mind" ? <MindTab onOpenChat={onOpen} onSettings={openSettings} /> : tab === "analytics" ? (
        <AnalyticsTab onOpenChat={onOpen} mode={analyticsMode} onOpenWidget={onOpenWidget} onSettings={openSettings} />
      ) : tab === "explore" ? (
        <ExploreTab onOpenChat={onOpen} onSettings={openSettings} />
      ) : (
      <>
      <header className={styles.profile}>
        <div className={styles.profileRow}>
          <div className={styles.profileId}>
            {/* Your avatar opens Settings. */}
            <button className={`${styles.profileAvatar} ${styles.avatarBtn}`} onClick={openSettings} aria-label="Settings">
              <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} photo={meUser.photo} size={40} shape="circle" />
              <span className={styles.orgBadge}><Logo size={12} /></span>
            </button>
            <div className={styles.profileText}>
              <b>Your inbox</b>
              <span>
                <span className={styles.maskIcon} style={{ width: 12, height: 12, ["--src" as string]: "url(/nod/phone.svg)" }} aria-hidden="true" />
                {formatPhone(meUser.phone) || (meUser.username ? `@${meUser.username}` : "")}
              </span>
            </div>
          </div>
          <button className={styles.plusBtn} aria-label={invites.length ? `New message, ${invites.length} ${invites.length === 1 ? "invitation" : "invitations"}` : "New message"} onClick={() => setNewChat(true)}>
            {ready && invites.length > 0 && <span className={styles.plusBadge}>{invites.length}</span>}
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
          <div className={styles.inboxScroll}>
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

            <div className={styles.rows} key={`${tab}-${filter}`}>
              {visible.map(({ chat, last, alert, mentioned, channel, quiet }, i) => {
                const id = chatIdentity(chat, me, userById);
                const other = chat.kind === "dm" ? chat.memberIds.find((m) => m !== me) : undefined;
                const online = !!other && isOnline(other);
                const typing = typingUsers(chat.id).filter((u) => u !== me);
                const isMuted = quiet;
                const showBadge = alert > 0;
                return (
                  <div key={chat.id} className={styles.rowEnter} style={{ ["--i" as string]: i }}>
                    <SwipeRow
                      onTap={() => openRow(chat)}
                      pinned={pinned.has(chat.id)}
                      muted={isMuted}
                      onPin={() => togglePinned(chat.id)}
                      onMute={() => toggleMuted(chat)}
                    >
                      {chat.kind === "group" ? (
                        id.photo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img className={styles.spaceAvatar} src={id.photo} alt="" />
                          : <span className={styles.spaceAvatar} style={{ background: TONES[id.tone] }}><Logo size={36} /></span>
                      ) : (
                        <Avatar glyph={id.glyph} tone={id.tone} photo={id.photo} size={56} shape="circle" online={online} />
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
                            ) : emojify(`${channel ? `#${channel} · ` : ""}${preview(last, me)}`)}
                          </span>
                        </div>
                        <div className={styles.rowSide}>
                          <span className={`${styles.rowTime} ${showBadge ? styles.rowTimeUnread : ""}`}>
                            {pinned.has(chat.id) && <IconPin size={11} />}
                            {isMuted && <IconBellOff size={11} />}
                            {last ? timeLabel(last.createdAt) : ""}
                          </span>
                          {showBadge && <span className={styles.rowBadge}>{mentioned ? "@" : alert}</span>}
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
              {ready && visible.length === 0 && (rows.length === 0 && !query ? (
                // A brand-new account: nothing to show yet, so point at people.
                <div className={styles.inboxWelcome}>
                  <Logo size={40} />
                  <h2>Say hello</h2>
                  <p>Find people you know on NOD, or invite someone to start your first conversation.</p>
                  <button className={styles.primaryWide} onClick={() => setNewChat(true)}><IconUserGroup size={18} /> Find people</button>
                  <button className={styles.secondaryWide} onClick={() => setInviting(true)}><IconShare size={18} /> Invite friends</button>
                </div>
              ) : (
                <p className={styles.emptyInbox}>
                  {query ? `Nothing matches “${query}”` : filter === "unread" ? "You're all caught up." : "No conversations yet."}
                </p>
              ))}
            </div>
          </div>
      </div>

      </>
      )}

      <div className={styles.edgeBottom} />
      <NavDock tab={tab} onTab={setTab} />
      {newChat && (
        <NewChat
          onClose={() => setNewChat(false)}
          onOpen={onOpen}
          onInvite={() => setInviting(true)}
          onNewGroup={() => setNewGroup(true)}
          onToast={flash}
          invitations={invites}
          onJoined={(g) => { flash(`Welcome to ${g.name}`); openRow(g); }}
        />
      )}
      {newGroup && (
        <NewGroupSheet
          onClose={() => setNewGroup(false)}
          onCreated={(chat) => { setNewGroup(false); setFilter("all"); onOpen(chat); }}
        />
      )}
      {settings && (
        <Settings
          leaving={settings.leaving}
          onBack={closeSettings}
          onAddIdentity={() => setAdding(true)}
          onInvite={() => setInviting(true)}
          onToast={flash}
        />
      )}
      {inviting && <InviteSheet onClose={() => setInviting(false)} onToast={flash} />}
      {adding && (
        <Onboarding
          mode="add"
          onCancel={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false);
            setMe(id);
            closeSettings();
            flash(`Signed in as ${userById(id).name}`);
          }}
        />
      )}
      {muting && (
        <MuteSheet me={me} chatId={muting.id} name={chatIdentity(muting, me, userById).label} onClose={() => setMuting(null)} onToast={flash} />
      )}
      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${styles.mindToast} ${toast.action ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
          <span className={styles.toastText}>{toast.text}</span>
          {toast.action && <button className={styles.toastBtn} onClick={() => { setToast(null); toast.action!.run(); }}>{toast.action.label}</button>}
        </div>
      )}
    </div>
  );
}
