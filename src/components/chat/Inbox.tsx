"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chatIdentity, initials, TONES } from "@/lib/chat/avatar";
import { useChatFlags, withId, type ChatList } from "@/lib/chat/chatFlags";
import { groupInfo, landingChannel, visibleChannels } from "@/lib/chat/groups";
import { isLanding } from "@/lib/chat/landing";
import { isUnassigned, useMind } from "@/lib/chat/mind";
import { effectiveRule, isQuiet, useMutes } from "@/lib/chat/mutes";
import { draftOf } from "@/lib/chat/storage";
import { typingLine, useChat, userById } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import {
  IconArchive, IconBack, IconBell, IconBellOff, IconHeart, IconListView, IconMarkRead, IconMarkUnread, IconMore, IconPin,
  IconPlus, IconShare, IconUnarchive, IconUserGroup,
} from "./Icons";
import Logo from "./Logo";
import MindTab from "./Mind";
import Onboarding from "./Onboarding";
import { InviteSheet } from "./Invite";
import Settings from "./Settings";
import { formatPhone } from "@/lib/chat/people";
import NewChat from "./NewChat";
import { NewGroupSheet } from "./Groups";
import { OperationRowStrip } from "./operation/Setup";
import { MuteSheet } from "./Mute";
import { smooth, uid, useBackLayer, useNow } from "./ui";
import AnalyticsTab from "./Analytics";
import ExploreTab from "./Explore";
import StatusBar from "./StatusBar";
import { previewParts, RowPreview, SwipeRow, type RowData, type SwipeAction } from "./InboxRow";
import { useGlide } from "./useGlide";
import { ChatHold } from "./InboxHold";
import { AddToListSheet, ListSheet, MoreSheet, type SheetAction } from "./InboxSheets";
import type { HoldAction } from "./MindHold";
import styles from "./chat.module.css";
import inbox from "./inbox.module.css";
import nav from "./nav.module.css";
import ops from "./operation/setup.module.css";

/** A chip: the built-in ones, or one of your own lists. */
type Filter = "all" | "unread" | "favourites" | "dms" | "groups" | `list:${string}`;
type Tab = "chats" | "mind" | "analytics" | "explore";

const TABS: { id: Tab; label: string; icon: string; w: number; h: number }[] = [
  { id: "chats", label: "Chats", icon: "/nod/chats.svg", w: 18, h: 18 },
  { id: "mind", label: "Mind", icon: "/nod/mind.svg", w: 16, h: 16 },
  { id: "analytics", label: "Dashboard", icon: "/nod/dashboard.svg", w: 16, h: 16 },
  { id: "explore", label: "Explore", icon: "/nod/explore.svg", w: 16, h: 16 },
];

/** Figma icons render through a mask so they follow the theme's ink colour. */
function MaskIcon({ src, w, h }: { src: string; w: number; h: number }) {
  return <span className={styles.maskIcon} style={{ width: w, height: h, ["--src" as string]: `url(${src})` }} aria-hidden="true" />;
}

function timeLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString()) return "Yesterday";
  if (now.getTime() - ts < 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A single glass capsule of the four primary tabs, with a liquid lens. */
/**
 * The tab bar. A tab can carry a dot: Chats when a conversation has something
 * unread (like WhatsApp or Instagram), Mind while things wait in Unassigned to
 * be sorted. `ping` gives a tab a small nudge: Mind, on the way back from
 * saving something in a chat.
 */
function NavDock({ tab, onTab, dots, ping }: {
  tab: Tab;
  onTab: (t: Tab) => void;
  dots?: Partial<Record<Tab, "unread" | "sort">>;
  ping?: Tab | null;
}) {
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
              <span className={`${styles.tabIcon} ${nav.icon} ${ping === t.id ? nav.ping : ""}`}>
                <MaskIcon src={t.icon} w={t.w} h={t.h} />
                {dots?.[t.id] && <span className={`${nav.dot} ${nav[dots[t.id]!]}`} aria-hidden="true" />}
              </span>
              {t.label}
              {dots?.[t.id] && <span className={nav.hidden}>{dots[t.id] === "unread" ? ", unread messages" : ", things to sort"}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Something that would notify, or a chat marked unread by hand. */
const needsYou = (r: RowData) => r.alert > 0 || r.marked;

export default function Inbox({ onOpen, pushed }: {
  onOpen: (chat: Chat, messageId?: string) => void;
  pushed: boolean;
}) {
  const { state, me, setMe, isOnline, lastReadAt, typingUsers, markRead } = useChat();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("chats");
  const [newChat, setNewChat] = useState(false);
  // The group maker, and which kind it starts on.
  const [newGroup, setNewGroup] = useState<"group" | "operation" | null>(null);
  // Pinned, archived, marked unread, favourites and lists: this person's own, kept in this browser.
  const { flags, update } = useChatFlags(me);
  const pinned = useMemo(() => new Set(flags.pinned), [flags.pinned]);
  const archived = useMemo(() => new Set(flags.archived), [flags.archived]);
  const marks = useMemo(() => new Set(flags.unread), [flags.unread]);
  const favourites = useMemo(() => new Set(flags.favourites), [flags.favourites]);
  // Mutes are rules per chat (what notifies, for how long); a channel follows its group.
  const { rules, set: setRule } = useMutes(me);
  const now = useNow(60_000);
  const [muting, setMuting] = useState<Chat | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const meUser = userById(me);
  const [settings, setSettings] = useState<{ leaving: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  // The row swiped open (only one at a time), the row being held, and the sheets a row opens.
  const [swiped, setSwiped] = useState<string | null>(null);
  const [hold, setHold] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [more, setMore] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [listSheet, setListSheet] = useState<{ kind: "favourites" } | { kind: "list"; listId?: string; seed?: string[] } | null>(null);
  const [archivedView, setArchivedView] = useState<{ leaving: boolean } | null>(null);
  // Rows folding away (archived, unarchived) before the list drops them.
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
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
  const closeArchived = useCallback(() => {
    setArchivedView((x) => (x ? { leaving: true } : x));
    setTimeout(() => setArchivedView((x) => (x?.leaving ? null : x)), 220);
  }, []);
  useBackLayer("nodArchived", !!archivedView && !archivedView.leaving, closeArchived);

  // Drafts are saved by the composer as you type: read them again once you're back in the list.
  const [draftEpoch, setDraftEpoch] = useState(0);
  useEffect(() => {
    if (pushed) return;
    const t = setTimeout(() => setDraftEpoch((e) => e + 1), 400);
    return () => clearTimeout(t);
  }, [pushed]);

  // Only chats this person is in: signed in as Reema, the Alae–Charles DM isn't yours to read.
  // A group is one row for all the channels you can see: their unread add up, the newest message shows.
  const rows: RowData[] = useMemo(() => {
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
      let draft: RowData["draft"] = null;
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
        const d = draftOf(t.id, me);
        if (d && (!draft || d.at > draft.at)) draft = d;
      }
      const quiet = isQuiet(effectiveRule(rules, chat, now));
      // Which channel the newest message is in, when there's more than one to tell apart.
      const channel = chat.kind === "group" && threads.length > 1 && last && last.chatId !== chat.id
        ? groupInfo(chat).channels.find((c) => c.id === last!.chatId)?.name
        : undefined;
      const sortAt = Math.max(last?.createdAt ?? 0, draft?.at ?? 0);
      return { chat, threads: threads.map((t) => t.id), last, unread, alert, mentioned, channel, quiet, draft, marked: marks.has(chat.id), sortAt };
    });
    // `pushed` and `draftEpoch` re-read the drafts once you're back from a chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, me, lastReadAt, rules, now, marks, pushed, draftEpoch]);
  // Groups that invited you: a red badge on + until you answer them (in New chat › Invitations).
  const invites = useMemo(
    () => state.data.chats.filter((c) => c.kind === "group" && !c.groupId && !c.removedAt && !c.memberIds.includes(me) && c.group?.invites.some((i) => i.userId === me)),
    [state.data.chats, me],
  );
  const openRow = (chat: Chat) => {
    // Opening a chat you marked unread takes the mark off, as reading it would.
    if (marks.has(chat.id)) update((f) => ({ ...f, unread: withId(f.unread, chat.id, false) }));
    onOpen(chat.kind === "group" ? landingChannel(state.data.chats, chat, me) : chat);
  };

  // Conversations (and their clock-relative labels) exist only once local
  // storage has loaded; rendering the seed on the server would mismatch.
  const ready = state.hydrated;
  const live = ready ? rows.filter((r) => !archived.has(r.chat.id)) : [];
  const archivedRows = ready ? rows.filter((r) => archived.has(r.chat.id)) : [];
  // Muted chats keep their own count but stay out of the Unread badge (unless a mention gets through).
  // Archived chats stay out of it too: they're put away until you open Archived.
  const unreadChats = live.filter(needsYou).length;
  const spaceMention = live.some((r) => r.chat.kind === "group" && r.mentioned);
  // Mind's dot: things waiting in Unassigned. Something just saved from a chat nudges the tab once you're back.
  const { mind } = useMind(me);
  const toSort = mind?.collections.find(isUnassigned)?.items.length ?? 0;
  const mindPing = !pushed && isLanding("tab:mind");

  // The chip you're on scrolls into view, like WhatsApp's (a new list's chip lands at the end).
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chipsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: smooth() });
  }, [filter, flags.lists.length]);
  // Dragged with a mouse or wheeled, the chips glide with momentum and spring back at the ends.
  useGlide(chipsRef, [tab]);

  const activeList: ChatList | undefined = filter.startsWith("list:") ? flags.lists.find((l) => `list:${l.id}` === filter) : undefined;
  // A list deleted elsewhere (another tab): fall back to All.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (filter.startsWith("list:") && !activeList) setFilter("all");
  }, [filter, activeList]);

  const inFilter = (r: RowData, f: Filter) => {
    if (f === "unread") return r.unread > 0 || r.marked;
    if (f === "favourites") return favourites.has(r.chat.id);
    if (f === "dms") return r.chat.kind === "dm";
    if (f === "groups") return r.chat.kind === "group";
    if (f.startsWith("list:")) return !!flags.lists.find((l) => `list:${l.id}` === f)?.chatIds.includes(r.chat.id);
    return true;
  };
  const byRecent = (a: RowData, b: RowData) => {
    const pa = pinned.has(a.chat.id) ? 1 : 0;
    const pb = pinned.has(b.chat.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.sortAt - a.sortAt;
  };
  const matches = (r: RowData) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const p = previewParts(r.last, r.chat, me);
    return chatIdentity(r.chat, me, userById).label.toLowerCase().includes(q) || `${p.who ?? ""} ${p.text}`.toLowerCase().includes(q);
  };
  const visible = live.filter((r) => inFilter(r, filter) && matches(r)).sort(byRecent);
  const archivedVisible = [...archivedRows].sort((a, b) => b.sortAt - a.sortAt);
  const archivedNeedYou = archivedRows.filter(needsYou).length;

  const count = (f: Filter) => {
    const n = live.filter((r) => inFilter(r, f) && needsYou(r)).length;
    return n ? String(n) : undefined;
  };
  const chips: { id: Filter; label: string; badge?: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread", badge: unreadChats ? String(unreadChats) : undefined },
    { id: "favourites", label: "Favourites", badge: count("favourites") },
    { id: "dms", label: "DMs", badge: count("dms") },
    { id: "groups", label: "Groups", badge: spaceMention ? "@" : count("groups") },
    ...flags.lists.map((l) => ({ id: `list:${l.id}` as Filter, label: l.name, badge: count(`list:${l.id}`) })),
  ];
  // Search stays inside the chip you're on, and says so.
  const placeholder = filter === "all" ? "Search chats"
    : filter === "unread" ? "Search unread chats"
    : filter === "favourites" ? "Search favourites"
    : filter === "dms" ? "Search DMs"
    : filter === "groups" ? "Search groups"
    : `Search ${activeList?.name ?? "this list"}`;

  /* ---- what you can do to a row ---- */

  const rowById = (id: string) => rows.find((r) => r.chat.id === id);
  const nameOf = (chat: Chat) => chatIdentity(chat, me, userById).label;
  const isUnread = (r: RowData) => r.unread > 0 || r.marked;

  const setRead = (r: RowData, read: boolean) => {
    if (read) {
      for (const t of r.threads) markRead(t);
      update((f) => ({ ...f, unread: withId(f.unread, r.chat.id, false) }));
    } else {
      update((f) => ({ ...f, unread: withId(f.unread, r.chat.id, true) }));
    }
  };
  const togglePin = (r: RowData) => update((f) => ({ ...f, pinned: withId(f.pinned, r.chat.id, !f.pinned.includes(r.chat.id)) }));
  const muteOrUnmute = (r: RowData) => {
    if (isQuiet(effectiveRule(rules, r.chat, now))) {
      setRule(r.chat.id, null);
      flash(`Notifications on for ${nameOf(r.chat)}`);
    } else {
      setMuting(r.chat);
    }
  };
  const toggleFavourite = (r: RowData) => {
    const on = !favourites.has(r.chat.id);
    update((f) => ({ ...f, favourites: withId(f.favourites, r.chat.id, on) }));
    flash(on ? `${nameOf(r.chat)} added to Favourites` : `${nameOf(r.chat)} removed from Favourites`);
  };
  // Archive and Unarchive fold the row away first, then move it.
  const fold = (id: string, then: () => void) => {
    setSwiped(null);
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => {
      then();
      setLeaving((s) => { const next = new Set(s); next.delete(id); return next; });
    }, 280);
  };
  const setArchived = (r: RowData, on: boolean) => {
    const id = r.chat.id;
    fold(id, () => {
      // Archiving takes a chat off the pinned list, as WhatsApp does.
      update((f) => ({ ...f, archived: withId(f.archived, id, on), pinned: on ? withId(f.pinned, id, false) : f.pinned }));
      flash(on ? "Chat archived" : "Chat unarchived", { label: "Undo", run: () => update((f) => ({ ...f, archived: withId(f.archived, id, !on) })) });
    });
  };

  const leadingFor = (r: RowData, where: "list" | "archived"): SwipeAction[] => {
    const read: SwipeAction = isUnread(r)
      ? { id: "read", label: "Read", icon: <IconMarkRead />, tone: "accent", run: () => setRead(r, true) }
      : { id: "unread", label: "Unread", icon: <IconMarkUnread />, tone: "accent", run: () => setRead(r, false) };
    if (where === "archived") return [read];
    return [read, { id: "pin", label: pinned.has(r.chat.id) ? "Unpin" : "Pin", icon: <IconPin />, tone: "ink", run: () => togglePin(r) }];
  };
  const trailingFor = (r: RowData, where: "list" | "archived"): SwipeAction[] => [
    { id: "more", label: "More", icon: <IconMore />, tone: "grey", run: () => setMore(r.chat.id) },
    where === "archived"
      ? { id: "unarchive", label: "Unarchive", icon: <IconUnarchive />, tone: "accent", removes: true, run: () => setArchived(r, false) }
      : { id: "archive", label: "Archive", icon: <IconArchive />, tone: "accent", removes: true, run: () => setArchived(r, true) },
  ];
  const quietNow = (r: RowData) => isQuiet(effectiveRule(rules, r.chat, now));
  const moreFor = (r: RowData): SheetAction[] => [
    quietNow(r)
      ? { id: "unmute", label: "Unmute", icon: <IconBell />, run: () => muteOrUnmute(r) }
      : { id: "mute", label: "Mute…", icon: <IconBellOff />, run: () => muteOrUnmute(r) },
    { id: "fav", label: favourites.has(r.chat.id) ? "Remove from Favourites" : "Add to Favourites", icon: <IconHeart />, run: () => toggleFavourite(r) },
    { id: "list", label: "Add to list…", icon: <IconListView />, run: () => setAddTo(r.chat.id) },
  ];
  const holdFor = (r: RowData): HoldAction[] => [
    isUnread(r)
      ? { id: "read", label: "Mark as read", icon: <IconMarkRead />, run: () => setRead(r, true) }
      : { id: "unread", label: "Mark as unread", icon: <IconMarkUnread />, run: () => setRead(r, false) },
    ...(archived.has(r.chat.id) ? [] : [{ id: "pin", label: pinned.has(r.chat.id) ? "Unpin" : "Pin", icon: <IconPin />, run: () => togglePin(r) }]),
    ...moreFor(r),
    "sep",
    archived.has(r.chat.id)
      ? { id: "unarchive", label: "Unarchive", icon: <IconUnarchive />, run: () => setArchived(r, false) }
      : { id: "archive", label: "Archive", icon: <IconArchive />, run: () => setArchived(r, true) },
  ];

  /* ---- lists ---- */

  const editingList = listSheet?.kind === "list" && listSheet.listId ? flags.lists.find((l) => l.id === listSheet.listId) : undefined;
  const saveList = (name: string, chatIds: string[]) => {
    if (listSheet?.kind === "favourites") {
      update((f) => ({ ...f, favourites: chatIds }));
      return;
    }
    if (editingList) {
      update((f) => ({ ...f, lists: f.lists.map((l) => (l.id === editingList.id ? { ...l, name, chatIds } : l)) }));
      return;
    }
    const id = uid();
    update((f) => ({ ...f, lists: [...f.lists, { id, name, chatIds }] }));
    setFilter(`list:${id}`);
    flash(`“${name}” is ready`);
  };
  const deleteList = (list: ChatList) => {
    const at = flags.lists.findIndex((l) => l.id === list.id);
    update((f) => ({ ...f, lists: f.lists.filter((l) => l.id !== list.id) }));
    if (filter === `list:${list.id}`) setFilter("all");
    flash(`“${list.name}” deleted`, {
      label: "Undo",
      run: () => update((f) => ({ ...f, lists: [...f.lists.slice(0, at), list, ...f.lists.slice(at)] })),
    });
  };
  // Everything you could put in a list, newest first (archived chats too).
  const pickable = [...rows].sort((a, b) => b.sortAt - a.sortAt).map((r) => r.chat);

  /* ---- one row ---- */

  const renderRow = (r: RowData, i: number, where: "list" | "archived") => {
    const { chat, threads, alert, mentioned, quiet, unread, marked } = r;
    const id = chatIdentity(chat, me, userById);
    const other = chat.kind === "dm" ? chat.memberIds.find((m) => m !== me) : undefined;
    const online = !!other && isOnline(other);
    // Typing anywhere in a group shows on its row, with the channel when it's all in one other than #general.
    const typingIn = threads.filter((t) => typingUsers(t).some((u) => u !== me));
    const typing = [...new Set(typingIn.flatMap((t) => typingUsers(t)))].filter((u) => u !== me);
    const typingChannel = chat.kind === "group" && typingIn.length === 1 && typingIn[0] !== chat.id
      ? groupInfo(chat).channels.find((c) => c.id === typingIn[0])?.name
      : undefined;
    // A count that would notify; a muted chat's own count in grey; a dot for one marked unread.
    const badge = alert > 0 ? (mentioned ? "@" : String(alert)) : quiet && unread > 0 ? String(unread) : marked ? "" : null;
    const hot = alert > 0 || marked;
    // An Operation's row carries its live strip (its own component: only it follows the live state).
    const operation = chat.kind === "group" && !!chat.group?.operation;
    return (
      <div key={chat.id} className={`${styles.rowEnter} ${leaving.has(chat.id) ? inbox.rowOut : ""}`} style={{ ["--i" as string]: i }}>
        <SwipeRow
          onTap={() => openRow(chat)}
          onHold={(el) => { setSwiped(null); setHold({ id: chat.id, el }); }}
          leading={leadingFor(r, where)}
          trailing={trailingFor(r, where)}
          open={swiped === chat.id}
          onOpenChange={(o) => setSwiped((s) => (o ? chat.id : s === chat.id ? null : s))}
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
              <span className={`${styles.rowPreview} ${operation ? ops.opPreview : ""}`}>
                <RowPreview
                  row={r}
                  me={me}
                  typingChannel={typingChannel}
                  typing={typing.length > 0 ? (
                    <>
                      {chat.kind === "group" ? typingLine(typing) : "typing"}
                      <span className={styles.ellipsis}><i>.</i><i>.</i><i>.</i></span>
                    </>
                  ) : null}
                />
              </span>
              {operation && <OperationRowStrip group={chat} me={me} now={now} />}
            </div>
            <div className={styles.rowSide}>
              <span className={`${styles.rowTime} ${hot ? styles.rowTimeUnread : ""}`}>
                {where === "list" && pinned.has(chat.id) && <IconPin size={11} />}
                {quiet && <IconBellOff size={11} />}
                {r.sortAt ? timeLabel(r.sortAt) : ""}
              </span>
              {badge !== null && (
                <span
                  className={`${styles.rowBadge} ${inbox.badge}`}
                  data-quiet={alert === 0 && !marked ? "" : undefined}
                  data-dot={badge === "" ? "" : undefined}
                  aria-label={badge === "" ? "Marked unread" : undefined}
                >
                  {badge}
                </span>
              )}
            </div>
          </div>
        </SwipeRow>
      </div>
    );
  };

  const holdRow = hold ? rowById(hold.id) : undefined;
  const moreRow = more ? rowById(more) : undefined;
  const addToRow = addTo ? rowById(addTo) : undefined;
  const listName = filter === "favourites" ? "Favourites" : activeList?.name;

  return (
    // Covered by an open chat: out of the tab order and the accessibility tree.
    <div className={`${styles.screen} ${styles.inboxScreen} ${pushed ? styles.pushed : ""}`} data-inbox-screen inert={pushed}>
      <StatusBar />

      {tab === "mind" ? <MindTab onOpenChat={onOpen} onSettings={openSettings} /> : tab === "analytics" ? (
        <AnalyticsTab onOpenChat={onOpen} onSettings={openSettings} />
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
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </label>
      </header>

      <div className={styles.inboxBody}>
          <div className={styles.inboxScroll} onScroll={() => { if (swiped) setSwiped(null); }}>
            {tab === "chats" && (
              <div className={styles.chips} role="tablist" ref={chipsRef}>
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
                <button className={`${styles.chip} ${inbox.chipAdd}`} onClick={() => setListSheet({ kind: "list" })} aria-label="New list">
                  <IconPlus />
                </button>
              </div>
            )}

            <div className={styles.rows} key={`${tab}-${filter}`}>
              {/* Archived sits at the top of All, out of the way, like WhatsApp. */}
              {ready && filter === "all" && !query && archivedRows.length > 0 && (
                <button className={inbox.archivedRow} onClick={() => { setSwiped(null); setArchivedView({ leaving: false }); }}>
                  <span className={inbox.archivedIcon}><IconArchive /></span>
                  <b>Archived</b>
                  {archivedNeedYou > 0 ? <span data-unread="">{archivedNeedYou}</span> : <span>{archivedRows.length}</span>}
                </button>
              )}

              {visible.map((r, i) => renderRow(r, i, "list"))}

              {!ready && [0, 1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonRow} aria-hidden="true">
                  <span /><div><i /><i /></div>
                </div>
              ))}

              {/* Favourites and lists: say how to fill them, and let you change them. */}
              {ready && listName && !query && (visible.length === 0 ? (
                <div className={inbox.emptyList}>
                  <b>{filter === "favourites" ? "No favourites yet" : `${listName} is empty`}</b>
                  <p>{filter === "favourites"
                    ? "Add the people and groups you talk to most, and find them here in one tap."
                    : "Add chats to keep them together under this chip."}</p>
                  <button className={inbox.emptyBtn} onClick={() => setListSheet(filter === "favourites" ? { kind: "favourites" } : { kind: "list", listId: activeList?.id })}>
                    {filter === "favourites" ? <IconHeart size={17} /> : <IconPlus size={17} />}
                    <span>{filter === "favourites" ? "Add favourites" : "Add chats"}</span>
                  </button>
                </div>
              ) : (
                <button className={inbox.listEdit} onClick={() => setListSheet(filter === "favourites" ? { kind: "favourites" } : { kind: "list", listId: activeList?.id })}>
                  {filter === "favourites" ? "Edit favourites" : `Edit “${listName}”`}
                </button>
              ))}

              {ready && visible.length === 0 && !(listName && !query) && (rows.length === 0 && !query ? (
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

      {/* Archived: its own screen over the list, with Back. */}
      {archivedView && (
        <div className={`${inbox.archived} ${archivedView.leaving ? inbox.archivedLeaving : ""}`}>
          <StatusBar />
          <header className={inbox.archivedHead}>
            <button className={`${styles.circleBtn} ${styles.glass}`} onClick={closeArchived} aria-label="Back to chats"><IconBack /></button>
            <h2>Archived</h2>
            <span />
          </header>
          <p className={inbox.archivedNote}>These chats stay archived when new messages come in. Swipe left on one to unarchive it.</p>
          <div className={inbox.archivedScroll} onScroll={() => { if (swiped) setSwiped(null); }}>
            <div className={styles.rows}>
              {archivedVisible.map((r, i) => renderRow(r, i, "archived"))}
            </div>
            {archivedVisible.length === 0 && <p className={styles.emptyInbox}>No archived chats</p>}
          </div>
        </div>
      )}

      <div className={styles.edgeBottom} />
      <NavDock
        tab={tab}
        onTab={setTab}
        dots={{ chats: unreadChats ? "unread" : undefined, mind: toSort ? "sort" : undefined }}
        ping={mindPing ? "mind" : null}
      />
      {holdRow && hold && (
        <ChatHold
          anchor={hold.el}
          row={holdRow}
          me={me}
          actions={holdFor(holdRow)}
          onOpen={() => openRow(holdRow.chat)}
          onClose={() => setHold(null)}
        />
      )}
      {moreRow && <MoreSheet title={nameOf(moreRow.chat)} actions={moreFor(moreRow)} onClose={() => setMore(null)} />}
      {addToRow && (
        <AddToListSheet
          chatName={nameOf(addToRow.chat)}
          chatId={addToRow.chat.id}
          inFavourites={favourites.has(addToRow.chat.id)}
          lists={flags.lists}
          onToggleFavourite={(on) => update((f) => ({ ...f, favourites: withId(f.favourites, addToRow.chat.id, on) }))}
          onToggleList={(listId, on) => update((f) => ({ ...f, lists: f.lists.map((l) => (l.id === listId ? { ...l, chatIds: withId(l.chatIds, addToRow.chat.id, on) } : l)) }))}
          onNewList={() => setListSheet({ kind: "list", seed: [addToRow.chat.id] })}
          onClose={() => setAddTo(null)}
        />
      )}
      {listSheet && (
        <ListSheet
          key={listSheet.kind === "list" ? listSheet.listId ?? "new" : "favourites"}
          mode={listSheet.kind === "favourites"
            ? { kind: "favourites", chatIds: flags.favourites }
            : { kind: "list", list: editingList, chatIds: editingList?.chatIds ?? listSheet.seed ?? [] }}
          chats={pickable}
          me={me}
          onSave={saveList}
          onDelete={editingList ? () => deleteList(editingList) : undefined}
          onClose={() => setListSheet(null)}
        />
      )}
      {newChat && (
        <NewChat
          onClose={() => setNewChat(false)}
          onOpen={onOpen}
          onInvite={() => setInviting(true)}
          onNewGroup={() => setNewGroup("group")}
          onNewOperation={() => setNewGroup("operation")}
          onToast={flash}
          invitations={invites}
          onJoined={(g) => { flash(`Welcome to ${g.name}`); openRow(g); }}
        />
      )}
      {newGroup && (
        <NewGroupSheet
          startAs={newGroup}
          onClose={() => setNewGroup(null)}
          onCreated={(chat) => { setNewGroup(null); setFilter("all"); onOpen(chat); }}
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
