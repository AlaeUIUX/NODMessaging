"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { stripFormatting } from "@/lib/chat/markdown";
import { openItems, type OpenState } from "@/lib/chat/open";
import { sortStops } from "@/lib/chat/ops";
import { useChat, userById } from "@/lib/chat/store";
import type { Attachment, Card, Chat, Message, SpaceMeta } from "@/lib/chat/types";
import Avatar from "./Avatar";
import {
  IconBack, IconBell, IconBellOff, IconBoard, IconCalendar, IconChecklist, IconChevron, IconClose, IconCompose, IconFile,
  IconGame, IconImage, IconLink, IconLocation, IconMoneyReceive, IconOpen, IconPoll, IconReceipt, IconRoute, IconSearch,
  IconSparkles,
} from "./Icons";
import { FileRow, Photo } from "./Media";
import { ExploreCategoryPicker } from "./Mind";
import StatusBar from "./StatusBar";
import { reducedMotion, relative, Sheet, useChatUi, useDialog, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./contact.module.css";

export type ContactTab = "live" | "media" | "files" | "links";

const LEAVE_MS = 220;
const EDGE = 24;

/* ---------------------------------------------------------------------------
   Mutes are the inbox's list (nod.chat.muted.<me>): same key, same shape.
--------------------------------------------------------------------------- */

const mutedKey = (me: string) => `nod.chat.muted.${me}`;
function readMuted(me: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(mutedKey(me)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeMuted(me: string, ids: string[]) {
  try { localStorage.setItem(mutedKey(me), JSON.stringify(ids)); } catch { /* private mode */ }
}

/* ---------------------------------------------------------------------------
   Formatting
--------------------------------------------------------------------------- */

const DAY = 86_400_000;
function when(ts: number, now: number) {
  const d = new Date(ts);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (ts >= today.getTime()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (ts >= today.getTime() - DAY) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
const ago = (ts: number, now: number) => (now - ts < 60_000 ? "just now" : `${relative(now - ts)} ago`);
function monthLabel(ts: number, now: number) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "long", year: d.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

const CARD_ICON: Partial<Record<Card["type"], ReactNode>> = {
  checklist: <IconChecklist size={18} />,
  poll: <IconPoll size={18} />,
  event: <IconCalendar size={18} />,
  payment: <IconMoneyReceive size={18} />,
  reminder: <IconBell size={18} />,
  location: <IconLocation size={18} />,
  tictactoe: <IconGame size={18} />,
  plan: <IconRoute size={18} />,
  bill: <IconReceipt size={18} />,
  project: <IconBoard size={18} />,
};

/* ---------------------------------------------------------------------------
   Links: markdown [text](url) first, then bare URLs in what's left.
--------------------------------------------------------------------------- */

interface FoundLink { id: string; message: Message; url: string; domain: string; label: string; context: string }

const MD_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /https?:\/\/[^\s<>()[\]]+/g;

function linksIn(message: Message): FoundLink[] {
  const out: FoundLink[] = [];
  const body = message.body;
  const plain = stripFormatting(body);
  // Sentences of the plain text, so a link comes with the words around it.
  const sentences = plain.split(/(?<=[.!?])\s+/);
  const around = (needle: string) => {
    const hit = sentences.find((x) => x.includes(needle)) ?? "";
    return hit.replace(BARE_URL, "").replace(/\s+/g, " ").trim();
  };
  const push = (url: string, text: string | null, at: number) => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return; }
    const path = `${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}`;
    const context = around(text ?? url);
    out.push({
      id: `${message.id}-${at}`,
      message,
      url: parsed.href,
      domain: parsed.hostname.replace(/^www\./, ""),
      label: text ?? (path ? decodeURIComponent(path) : parsed.hostname),
      // A link sent on its own has no sentence worth repeating.
      context: context === text ? "" : context,
    });
  };

  let masked = body;
  for (const m of body.matchAll(MD_LINK)) {
    push(m[2], m[1], m.index);
    masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  for (const m of masked.matchAll(BARE_URL)) {
    push(m[0].replace(/[.,;:!?'"’”]+$/, ""), null, m.index);
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Search: plain-text match with a snippet around the first hit.
--------------------------------------------------------------------------- */

function snippet(text: string, q: string): ReactNode {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  const start = Math.max(0, i - 32);
  // Start on a word boundary when the hit is deep into the message.
  const pre = start > 0 ? `…${text.slice(start, i).replace(/^\S*\s+/, "")}` : text.slice(0, i);
  return <>{pre}<mark className={s.mark}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length, i + q.length + 120)}</>;
}

/* ---------------------------------------------------------------------------
   The page
--------------------------------------------------------------------------- */

/**
 * The person (DM) or Space behind a chat: Live items, media, files and links
 * in tabs; for a Space, its members in their own section below.
 */
export default function ContactPage({ chat, startTab, onClose, onJump }: {
  chat: Chat;
  startTab: ContactTab;
  onClose: () => void;
  /** Closes the page and scrolls the thread to this message. */
  onJump: (messageId: string) => void;
}) {
  const { state, me, isOnline, updateCard, cardOp } = useChat();
  const ui = useChatUi();
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroNameRef = useRef<HTMLHeadingElement>(null);
  const tabsAnchorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isGroup = chat.kind === "group";
  const [tab, setTab] = useState<ContactTab>(startTab);
  const [leaving, setLeaving] = useState(false);
  const [compact, setCompact] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // Only mounted after a tap, never prerendered, so reading storage here is safe.
  const [muted, setMuted] = useState(() => readMuted(me).includes(chat.id));
  const now = useNow(30_000);

  const messages = useMemo(
    () => (state.data.messages[chat.id] ?? []).filter((m) => !m.deletedAt),
    [state.data.messages, chat.id],
  );
  const identity = chatIdentity(chat, me, userById);
  const other = isGroup ? undefined : chat.memberIds.find((id) => id !== me);
  const online = !!other && isOnline(other);
  const presence = isGroup ? `${chat.memberIds.length} members` : online ? "Active now" : "Active recently";
  const nameOf = (id: string) => (id === me ? "You" : userById(id).name);

  const live = useMemo(() => openItems(messages, me, now), [messages, me, now]);
  const needsMe = live.filter((x) => x.state.needsMe);
  const waiting = live.filter((x) => !x.state.needsMe);

  const photos = useMemo(() => {
    const out: { message: Message; a: Attachment; index: number }[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      m.attachments.filter((a) => a.kind === "image").forEach((a, index) => out.push({ message: m, a, index }));
    }
    return out;
  }, [messages]);
  const files = useMemo(
    () => messages.flatMap((m) => m.attachments.filter((a) => a.kind !== "image").map((a) => ({ message: m, a }))).reverse(),
    [messages],
  );
  const links = useMemo(
    () => messages.filter((m) => m.kind === "text" && m.body).flatMap(linksIn).reverse(),
    [messages],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => m.kind === "text" && m.body && stripFormatting(m.body).toLowerCase().includes(q))
      .reverse()
      .slice(0, 60);
  }, [messages, query]);

  // Leave with the same push animation in reverse, then hand back to the chat. Once, however fast the taps.
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef(false);
  const close = (after: () => void = onClose) => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    leaveTimer.current = setTimeout(after, reducedMotion() ? 0 : LEAVE_MS);
  };
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);
  const jump = (id: string) => close(() => onJump(id));

  useDialog(rootRef, () => close());
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }); }, []);

  // The name moves into the top bar once the big one scrolls under it.
  useEffect(() => {
    const root = scrollRef.current;
    const name = heroNameRef.current;
    if (!root || !name) return;
    const bar = topRef.current?.offsetHeight ?? 0;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { root, rootMargin: `-${bar}px 0px 0px 0px` });
    io.observe(name);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (searching) searchRef.current?.focus({ preventScroll: true });
  }, [searching]);

  // Switching tabs keeps the tab bar where it is instead of jumping back to the top.
  const pick = (next: ContactTab) => {
    setTab(next);
    const scroller = scrollRef.current;
    const anchor = tabsAnchorRef.current;
    if (!scroller || !anchor) return;
    const pinnedAt = anchor.offsetTop - (topRef.current?.offsetHeight ?? 0);
    if (scroller.scrollTop > pinnedAt) scroller.scrollTop = pinnedAt;
  };

  const toggleMute = () => {
    const list = readMuted(me).filter((id) => id !== chat.id);
    writeMuted(me, muted ? list : [...list, chat.id]);
    // The inbox keeps its own copy of the list; tell it to read the new one.
    window.dispatchEvent(new Event("nod:muted"));
    setMuted(!muted);
    ui.toast(muted ? "Notifications on" : `Muted ${isGroup ? identity.label : identity.label.split(" ")[0]}`);
  };

  // Swipe from the left edge to go back, like any pushed screen.
  const drag = useRef<{ x: number; dx: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el || e.button !== 0 || closing.current) return;
    if (e.clientX - el.getBoundingClientRect().left > EDGE) return;
    e.stopPropagation();
    drag.current = { x: e.clientX, dx: 0, t: performance.now() };
    el.setPointerCapture(e.pointerId);
    el.style.animation = "none";
    el.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = rootRef.current;
    if (!d || !el) return;
    d.dx = Math.max(0, e.clientX - d.x);
    el.style.transform = `translateX(${d.dx}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    const el = rootRef.current;
    drag.current = null;
    if (!d || !el) return;
    const width = el.offsetWidth || 400;
    const velocity = d.dx / Math.max(1, performance.now() - d.t);
    const back = d.dx > width * 0.35 || (velocity > 0.5 && d.dx > 24);
    const ms = reducedMotion() ? 0 : 280;
    el.style.transition = `transform ${ms}ms cubic-bezier(.22, 1, .36, 1)`;
    el.style.transform = back ? "translateX(100%)" : "";
    if (back) {
      closing.current = true;
      leaveTimer.current = setTimeout(onClose, ms);
    } else {
      leaveTimer.current = setTimeout(() => { el.style.transition = ""; }, ms);
    }
  };

  /* ---- Live ---- */

  const quickAction = (m: Message): { label: string; run: () => void } => {
    const c = m.card;
    const open = { label: "Open", run: () => jump(m.id) };
    if (!c) return open;
    const canEdit = "everyoneCanEdit" in c && (c.everyoneCanEdit || m.authorId === me || c.editors.includes(me));
    if (c.type === "checklist" && canEdit) {
      const next = c.items.find((i) => !i.doneBy);
      if (!next) return open;
      return {
        label: "Tick next",
        run: () => {
          updateCard(m, (x) => (x.type === "checklist"
            ? { ...x, items: x.items.map((it) => (it.id === next.id && !it.doneBy ? { ...it, doneBy: me } : it)) }
            : x));
          ui.toast(`Ticked “${next.label}”`);
        },
      };
    }
    if (c.type === "plan" && canEdit) {
      // The same "next" the summary names: the first stop still ahead, else the first one left.
      const left = [...c.days].sort((a, b) => a.date - b.date).flatMap((d) => sortStops(d.stops)).filter((x) => !x.doneBy);
      const next = left.find((x) => x.at === null || x.at >= now) ?? left[0];
      if (!next) return open;
      return {
        label: "Tick next",
        run: () => {
          cardOp(m, { kind: "plan.tick", stopId: next.id, by: me });
          ui.toast(`Ticked “${next.title}”`);
        },
      };
    }
    if (c.type === "project") {
      return {
        label: "Board",
        // The board pushes its own history entry, so it opens once this page's entry is gone.
        run: () => close(() => {
          let done = false;
          const go = () => {
            if (done) return;
            done = true;
            window.removeEventListener("popstate", go);
            clearTimeout(fallback);
            ui.openBoard(m.id);
          };
          window.addEventListener("popstate", go);
          const fallback = setTimeout(go, 400);
          onClose();
        }),
      };
    }
    return open;
  };

  const liveRow = ({ message: m, state: st }: { message: Message; state: OpenState }) => {
    const action = quickAction(m);
    return (
      <li key={m.id} className={s.liveRow}>
        <button className={s.liveMain} onClick={() => jump(m.id)}>
          <span className={`${s.liveIcon} ${st.needsMe ? s.liveIconMine : ""}`}>{m.card ? CARD_ICON[m.card.type] : null}</span>
          <span className={s.liveText}>
            <b>{st.title}</b>
            <span>{st.summary}</span>
            <small>{nameOf(m.authorId)} · {ago(m.createdAt, now)}</small>
          </span>
        </button>
        <button className={`${s.pill} ${st.needsMe ? s.pillPrimary : ""}`} onClick={action.run}>{action.label}</button>
      </li>
    );
  };

  const livePanel = live.length ? (
    <>
      {needsMe.length > 0 && (
        <section className={s.section}>
          <h3 className={s.sectionHead}>Needs you<em>{needsMe.length}</em></h3>
          <ul className={s.list}>{needsMe.map(liveRow)}</ul>
        </section>
      )}
      {waiting.length > 0 && (
        <section className={s.section}>
          <h3 className={s.sectionHead}>Waiting on others<em>{waiting.length}</em></h3>
          <ul className={s.list}>{waiting.map(liveRow)}</ul>
        </section>
      )}
    </>
  ) : (
    <Empty icon={<IconSparkles size={22} />} title="All caught up">
      Nothing open in this chat. Checklists, polls, plans and bills that still need something show up here.
    </Empty>
  );

  /* ---- Media ---- */

  const mediaPanel = photos.length ? (
    (() => {
      const groups: { label: string; items: typeof photos }[] = [];
      for (const p of photos) {
        const label = monthLabel(p.message.createdAt, now);
        const last = groups[groups.length - 1];
        if (last?.label === label) last.items.push(p);
        else groups.push({ label, items: [p] });
      }
      return groups.map((g) => (
        <section key={g.label} className={s.section}>
          <h3 className={s.sectionHead}>{g.label}<em>{g.items.length}</em></h3>
          <div className={s.grid}>
            {g.items.map((p) => (
              <button
                key={`${p.message.id}-${p.a.id}`}
                className={s.tile}
                onClick={() => ui.openMedia(p.message, p.index)}
                aria-label={`Photo from ${nameOf(p.message.authorId)}, ${when(p.message.createdAt, now)}`}
              >
                <Photo a={p.a} className={s.tileImg} />
              </button>
            ))}
          </div>
        </section>
      ));
    })()
  ) : (
    <Empty icon={<IconImage size={22} />} title="No photos yet">Photos shared in this chat collect here.</Empty>
  );

  /* ---- Files ---- */

  const filesPanel = files.length ? (
    <ul className={s.list}>
      {files.map(({ message: m, a }) => (
        <li key={`${m.id}-${a.id}`} className={s.fileItem}>
          <FileRow a={a} />
          <div className={s.itemFoot}>
            <span>{nameOf(m.authorId)} · {when(m.createdAt, now)}</span>
            <button className={s.textBtn} onClick={() => jump(m.id)}>Show in chat</button>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <Empty icon={<IconFile size={22} />} title="No files yet">Documents and other files shared here show up in this list.</Empty>
  );

  /* ---- Links ---- */

  const linksPanel = links.length ? (
    <ul className={s.list}>
      {links.map((l) => (
        <li key={l.id} className={s.linkItem}>
          <a className={s.linkMain} href={l.url} target="_blank" rel="noopener noreferrer">
            <span className={s.linkIcon}><IconLink size={18} /></span>
            <span className={s.linkText}>
              <b>{l.domain}</b>
              <span className={s.linkLabel}>{l.label}</span>
              {l.context && <span className={s.linkContext}>{l.context}</span>}
            </span>
            <span className={s.linkOpen} aria-hidden="true"><IconOpen size={16} /></span>
          </a>
          <div className={s.itemFoot}>
            <span>{nameOf(l.message.authorId)} · {when(l.message.createdAt, now)}</span>
            <button className={s.textBtn} onClick={() => jump(l.message.id)}>Show in chat</button>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <Empty icon={<IconLink size={22} />} title="No links yet">Links sent in messages are gathered here, with who sent them and when.</Empty>
  );

  const panels: Record<ContactTab, ReactNode> = {
    live: livePanel, media: mediaPanel, files: filesPanel, links: linksPanel,
  };
  const tabs: { id: ContactTab; label: string; count?: number }[] = [
    { id: "live", label: "Live", count: live.length },
    { id: "media", label: "Media" },
    { id: "files", label: "Files" },
    { id: "links", label: "Links" },
  ];
  const tabIndex = Math.max(0, tabs.findIndex((t) => t.id === tab));

  /* ---- Search ---- */

  const q = query.trim();
  const searchPanel = !q ? (
    <p className={s.hint}>Search messages in {isGroup ? identity.label : `your chat with ${identity.label.split(" ")[0]}`}.</p>
  ) : results.length ? (
    <ul className={`${s.list} ${s.group}`} aria-label={`${results.length} ${results.length === 1 ? "result" : "results"}`}>
      {results.map((m) => {
        const u = userById(m.authorId);
        return (
          <li key={m.id}>
            <button className={s.result} onClick={() => jump(m.id)}>
              <Avatar glyph={initials(u.fullName)} tone={u.tone} size={32} shape="circle" />
              <span className={s.resultText}>
                <span className={s.resultHead}><b>{nameOf(m.authorId)}</b><small>{when(m.createdAt, now)}</small></span>
                <span className={s.resultBody}>{snippet(stripFormatting(m.body), q)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className={s.hint}>No messages match “{q}”.</p>
  );

  const endSearch = () => { setSearching(false); setQuery(""); };

  return (
    <div
      ref={rootRef}
      className={`${s.page} ${leaving ? s.leaving : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${identity.label}, details`}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <StatusBar />
      <header ref={topRef} className={`${s.top} ${compact ? s.topCompact : ""}`}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => close()} aria-label="Back to chat">
          <IconBack />
        </button>
        <span className={s.topTitle} aria-hidden={!compact}>{identity.label}</span>
        <span className={s.topSpacer} />
      </header>

      <div ref={scrollRef} className={s.scroll}>
        <div className={s.hero}>
          <Avatar glyph={identity.glyph} tone={identity.tone} size={96} online={online} />
          <h2 ref={heroNameRef} className={s.name}>{identity.label}</h2>
          <p className={`${s.presence} ${online ? s.online : ""}`}>{presence}</p>
          <div className={s.actions}>
            <button className={s.action} onClick={() => close()}>
              <IconCompose size={20} /><span>Message</span>
            </button>
            <button className={s.action} onClick={() => (searching ? endSearch() : setSearching(true))} aria-pressed={searching}>
              <IconSearch size={20} /><span>Search</span>
            </button>
            <button className={s.action} onClick={toggleMute} aria-pressed={muted}>
              {muted ? <IconBellOff size={20} /> : <IconBell size={20} />}<span>{muted ? "Unmute" : "Mute"}</span>
            </button>
          </div>
        </div>

        <div ref={tabsAnchorRef} />
        {searching ? (
          <>
            <div className={s.stick}>
              <div className={s.searchRow}>
                <label className={s.searchField}>
                  <IconSearch size={17} />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); endSearch(); } }}
                    placeholder="Search messages"
                    aria-label="Search messages"
                    enterKeyHint="search"
                  />
                  {query && (
                    <button className={s.clear} onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">
                      <IconClose size={14} />
                    </button>
                  )}
                </label>
                <button className={s.textBtn} onClick={endSearch}>Cancel</button>
              </div>
            </div>
            <div className={s.panel} aria-live="polite">{searchPanel}</div>
          </>
        ) : (
          <>
            {/* Its own block, so the sticky tabs let go before the Space's sections below. */}
            <section className={s.tabbed} aria-label="Shared in this chat">
            {/* In a Space the tabs are one block among the Space's sections: they scroll with the page. */}
            <div className={`${s.stick} ${isGroup ? s.flat : ""}`}>
              <div className={s.tabs} role="tablist" aria-label="Details" style={{ ["--n" as string]: tabs.length }}>
                <span className={s.lens} style={{ transform: `translateX(${tabIndex * 100}%)` }} aria-hidden="true" />
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    id={`contact-tab-${t.id}`}
                    role="tab"
                    aria-selected={t.id === tab}
                    aria-controls="contact-panel"
                    className={t.id === tab ? s.tabOn : undefined}
                    onClick={() => pick(t.id)}
                  >
                    {t.label}
                    {!!t.count && <em className={s.count}>{t.count}</em>}
                  </button>
                ))}
              </div>
            </div>
            <div key={tab} id="contact-panel" className={s.panel} role="tabpanel" aria-labelledby={`contact-tab-${tab}`}>
              {panels[tab]}
            </div>
            </section>
            {isGroup && <SpaceExploreRow chat={chat} />}
            {isGroup && <SpaceMembers chat={chat} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Whether this Space shows up in Explore, and a tap-through to publish or
 * un-publish it. Any member can do this — there's no owner/role concept yet.
 * Reads the chat fresh from the store (like `useLiveBoard` in Project.tsx),
 * since `chat` here is otherwise the snapshot `ChatApp` captured when it was
 * opened, which never updates on its own.
 */
function SpaceExploreRow({ chat }: { chat: Chat }) {
  const { state } = useChat();
  const ui = useChatUi();
  const live = state.data.chats.find((c) => c.id === chat.id) ?? chat;
  const published = !!live.space?.open;
  return (
    <div className={styles.listGroup}>
      <button
        className={styles.actionRow}
        onClick={() => ui.openSheet(<PublishSpaceSheet chat={live} onClose={ui.closeSheet} />)}
      >
        <span className={styles.actionIcon}><IconSparkles size={20} /></span>
        <span className={styles.contactText}>
          <b>Explore</b>
          <small>{published ? `Discoverable · ${live.space!.category}` : "Not discoverable"}</small>
        </span>
        <IconChevron size={16} />
      </button>
    </div>
  );
}

/** Choosing a category (and optionally a city) is the whole point of this sheet — publishing never changes anything about the chat itself. */
function PublishSpaceSheet({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const { setSpace } = useChat();
  const [category, setCategory] = useState<string | null>(chat.space?.category ?? null);
  const [city, setCity] = useState(chat.space?.city ?? "");
  const published = !!chat.space?.open;

  const publish = () => {
    if (!category) return;
    const space: SpaceMeta = { category, city: city.trim() || undefined, open: true, createdAt: chat.space?.createdAt ?? Date.now() };
    setSpace(chat.id, space);
    onClose();
  };

  return (
    <Sheet title="Publish to Explore" onClose={onClose} action={{ label: published ? "Save" : "Publish", disabled: !category, onClick: publish }}>
      <p className={styles.sheetNote}>
        Anyone can find &ldquo;{chat.name}&rdquo; on Explore and join, with the category (and city, if you add one) you pick below.
      </p>

      <p className={styles.sheetLabel}>Category</p>
      <ExploreCategoryPicker value={category} onChange={setCategory} />

      <p className={styles.sheetLabel}>City (optional)</p>
      <input
        className={styles.plainInput}
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="e.g. Vienna"
        aria-label="City"
      />

      {published && (
        <button className={styles.secondaryWide} onClick={() => { setSpace(chat.id, null); onClose(); }}>
          Remove from Explore
        </button>
      )}
    </Sheet>
  );
}

/**
 * A Space's people, apart from the shared-content tabs. This is where roles
 * and permissions will live, and the Space's channels will sit alongside it.
 */
function SpaceMembers({ chat }: { chat: Chat }) {
  const { me, isOnline } = useChat();
  const members = [...chat.memberIds].sort((a, b) =>
    a === me ? -1 : b === me ? 1 : Number(isOnline(b)) - Number(isOnline(a)) || userById(a).fullName.localeCompare(userById(b).fullName));
  const online = members.filter((id) => id !== me && isOnline(id)).length;
  return (
    <section className={s.space} aria-labelledby="space-members">
      <h3 id="space-members" className={s.spaceHead}>
        Members <em>{members.length}{online ? ` · ${online} online` : ""}</em>
      </h3>
      <ul className={`${s.list} ${s.group}`}>
        {members.map((id) => {
          const u = userById(id);
          const on = id !== me && isOnline(id);
          return (
            <li key={id} className={s.member}>
              <Avatar glyph={initials(u.fullName)} tone={u.tone} size={40} shape="circle" online={on} />
              <span className={s.memberText}>
                <b>{u.fullName}{id === me && <em> · You</em>}</b>
                <span className={on ? s.online : undefined}>{on ? "Active now" : `@${u.name}`}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>{icon}</span>
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}
