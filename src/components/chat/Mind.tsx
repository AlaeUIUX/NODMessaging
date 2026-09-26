"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { Emoji, emojify } from "@/lib/chat/emoji";
import { toAttachment } from "@/lib/chat/media";
import {
  blankPage, childrenOf, collectionItems, collectionOf, COLLECTION_TEMPLATES, dayIndex, daysUntil, detach, isPast,
  LANGUAGES, lastSevenDays, nowMs, learnChat, locate, logPractice, makeCollection, newId, pageItems, patchBlock,
  patchCollection, patchPage, pitchGuide, place, removeBlock, streakOf, tagsOf, todayKey, useMind,
  type Block, type BlockKind, type Collection, type Mind, type MindView, type Page, type TaskStatus, type WidgetKind,
} from "@/lib/chat/mind";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { BlockView, KIND_LABEL, relDay } from "./MindBlocks";
import {
  IconArrowUp, IconBack, IconBoard, IconCheck, IconChevron, IconChevronDown, IconClose, IconGrid, IconListView,
  IconEdit, IconMore, IconPlus, IconShelf,
} from "./Icons";
import Logo from "./Logo";
import { Segmented, Sheet, Toggle } from "./ui";
import styles from "./chat.module.css";

/**
 * Mind: collections of pages, built one + at a time. The same parts as the
 * messaging app: pages push in like chats, sheets rise like the Add sheet,
 * the quick-add field works like the composer, and anything held for a
 * moment can be picked up and dropped somewhere else.
 */

const VIEW_META: Record<MindView, { label: string; icon: React.ReactNode }> = {
  shelf: { label: "Shelf", icon: <IconShelf size={15} /> },
  list: { label: "List", icon: <IconListView size={15} /> },
  grid: { label: "Grid", icon: <IconGrid size={15} /> },
  board: { label: "Board", icon: <IconBoard size={15} /> },
};
const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
];
const euro = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const HOLD_MS = 380;

/** Everything the + button can make, with the emoji it wears in sheets. */
const KINDS: { kind: BlockKind; label: string; emoji: string; group: "Capture" | "Track" }[] = [
  { kind: "note", label: "Note", emoji: "📝", group: "Capture" },
  { kind: "link", label: "Link", emoji: "🔗", group: "Capture" },
  { kind: "image", label: "Image", emoji: "🖼️", group: "Capture" },
  { kind: "file", label: "File", emoji: "📎", group: "Capture" },
  { kind: "quote", label: "Quote", emoji: "💬", group: "Capture" },
  { kind: "flashcard", label: "Flashcard", emoji: "🃏", group: "Capture" },
  { kind: "book", label: "Book", emoji: "📚", group: "Capture" },
  { kind: "video", label: "Video", emoji: "🎬", group: "Capture" },
  { kind: "palette", label: "Palette", emoji: "🎨", group: "Capture" },
  { kind: "todo", label: "To-do", emoji: "✅", group: "Track" },
  { kind: "progress", label: "Progress", emoji: "📈", group: "Track" },
  { kind: "habit", label: "Habit", emoji: "🔁", group: "Track" },
  { kind: "amount", label: "Amount", emoji: "💶", group: "Track" },
  { kind: "date", label: "Date", emoji: "📅", group: "Track" },
];
const KIND_EMOJI = Object.fromEntries(KINDS.map((k) => [k.kind, k.emoji])) as Record<BlockKind, string>;

const WIDGETS: { kind: WidgetKind; label: string; wide?: boolean; blurb: string }[] = [
  { kind: "streak", label: "Streak", blurb: "Days in a row you practised" },
  { kind: "review", label: "Review", blurb: "Flashcards waiting for you" },
  { kind: "word", label: "Word of the day", wide: true, blurb: "One of your cards, every day" },
  { kind: "progress", label: "Progress", blurb: "From a Progress item or your tasks" },
  { kind: "countdown", label: "Countdown", blurb: "Days to your next Date" },
  { kind: "totals", label: "Totals", blurb: "Adds up your Amounts" },
  { kind: "needs", label: "Needs you", wide: true, blurb: "Overdue, #urgent and in progress" },
  { kind: "covers", label: "Cover wall", wide: true, blurb: "The first picture of each page" },
  { kind: "recent", label: "Recently added", wide: true, blurb: "Your latest items" },
  { kind: "pinned", label: "Pinned pages", wide: true, blurb: "Pages you pin" },
  { kind: "vault", label: "Vault", blurb: "Saves waiting to be sorted" },
  { kind: "tags", label: "Tags", wide: true, blurb: "Your most used tags" },
];

type Screen = { kind: "home" } | { kind: "vault" } | { kind: "tag"; tag: string };

interface Ctx {
  mind: Mind;
  col: Collection | null;
  update: (fn: (m: Mind) => Mind) => void;
  me: string;
  flash: (t: string) => void;
  openPage: (id: string) => void;
  openSheet: (n: React.ReactNode) => void;
  closeSheet: () => void;
  openChat: (chatId: string) => void;
  go: (s: Screen) => void;
}

export default function MindTab({ onOpenChat }: { onOpenChat: (chat: Chat) => void }) {
  const { me, state } = useChat();
  const { mind, update } = useMind(me);
  const meUser = userById(me);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [openPage, setOpenPage] = useState<{ id: string; leaving: boolean } | null>(null);
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean } | null>(null);

  // Switching person (Developer → Signed in as) starts from their home.
  const [seenMe, setSeenMe] = useState(me);
  if (seenMe !== me) {
    setSeenMe(me);
    setScreen({ kind: "home" });
    setOpenPage(null);
    setSheet(null);
    setQuery("");
  }

  if (!mind) return <div className={styles.inboxBody} />;
  const col = collectionOf(mind, mind.current);

  const ctx: Ctx = {
    mind, col, update, me,
    flash: (text) => {
      const id = nowMs();
      setToast({ text, id });
      setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), 1800);
      setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2020);
    },
    openPage: (id) => setOpenPage({ id, leaving: false }),
    openSheet: setSheet,
    closeSheet: () => setSheet(null),
    openChat: (chatId) => {
      const chat = state.data.chats.find((c) => c.id === chatId);
      if (chat) onOpenChat(chat);
    },
    go: (s) => { setQuery(""); setScreen(s); },
  };
  const back = () => {
    setOpenPage((p) => (p ? { ...p, leaving: true } : p));
    setTimeout(() => setOpenPage(null), 220);
  };

  const items = col ? collectionItems(mind, col) : [];
  const tags = tagsOf(items).slice(0, 6);
  const q = query.trim().toLowerCase();

  return (
    <>
      <header className={styles.profile}>
        <div className={styles.profileRow}>
          <div className={styles.profileId}>
            <span className={styles.profileAvatar}>
              <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} size={40} shape="circle" />
              <span className={styles.orgBadge}><Logo size={12} /></span>
            </span>
            {col ? (
              <button className={`${styles.profileText} ${styles.mindSwitch}`} onClick={() => setSheet(<CollectionsSheet ctx={ctx} />)} aria-label="Switch collection">
                <b><Emoji char={col.emoji} /> {col.name} <IconChevronDown size={14} /></b>
                <span>{col.tagline || `${col.pages.length} pages · ${items.length} items`}</span>
              </button>
            ) : (
              <div className={styles.profileText}>
                <b>{me === "me" ? "Your Mind" : `${meUser.name}'s Mind`}</b>
                <span>Empty for now</span>
              </div>
            )}
          </div>
          <button
            className={styles.plusBtn}
            aria-label={col ? `Add to ${col.name}` : "New collection"}
            onClick={() => setSheet(col ? <HomeAddSheet ctx={ctx} /> : <NewCollectionSheet ctx={ctx} />)}
          >
            <IconPlus size={16} />
          </button>
        </div>
        {col && (
          <label className={styles.searchBar}>
            <span className={styles.maskIcon} style={{ width: 16, height: 16, ["--src" as string]: "url(/nod/search.svg)" }} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${col.name}...`} />
            {query && <button className={styles.mindClear} onClick={() => setQuery("")} aria-label="Clear search"><IconClose size={14} /></button>}
          </label>
        )}
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll} key={`${me}-${col?.id}-${screen.kind}-${screen.kind === "tag" ? screen.tag : ""}`}>
          {!col ? <EmptyMind ctx={ctx} /> : (
            <>
              {!q && (
                <div className={styles.chips} role="tablist">
                  <button role="tab" aria-selected={screen.kind === "home"} className={`${styles.chip} ${screen.kind === "home" ? styles.chipOn : ""}`} onClick={() => ctx.go({ kind: "home" })}>Home</button>
                  <button role="tab" aria-selected={screen.kind === "vault"} className={`${styles.chip} ${screen.kind === "vault" ? styles.chipOn : ""}`} onClick={() => ctx.go({ kind: "vault" })}>
                    Vault{col.vault.length > 0 && <span className={styles.chipBadge}>{col.vault.length}</span>}
                  </button>
                  {tags.map((t) => (
                    <button key={t} role="tab" aria-selected={screen.kind === "tag" && screen.tag === t} className={`${styles.chip} ${screen.kind === "tag" && screen.tag === t ? styles.chipOn : ""}`} onClick={() => ctx.go({ kind: "tag", tag: t })}>#{t}</button>
                  ))}
                </div>
              )}
              {q ? <SearchResults ctx={ctx} col={col} q={q} />
                : screen.kind === "vault" ? <VaultView ctx={ctx} col={col} />
                : screen.kind === "tag" ? <TagView ctx={ctx} col={col} tag={screen.tag} />
                : <Home ctx={ctx} col={col} />}
            </>
          )}
        </div>
      </div>

      {openPage && col?.pages.some((p) => p.id === openPage.id) && (
        <PageScreen ctx={ctx} col={col} pageId={openPage.id} leaving={openPage.leaving} onBack={back} onOpen={(id) => setOpenPage({ id, leaving: false })} />
      )}
      {sheet}
      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${styles.mindToast} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">{emojify(toast.text)}</div>
      )}
    </>
  );
}

/* ===========================================================================
   Home: widgets on top, pages underneath
   =========================================================================== */

function Home({ ctx, col }: { ctx: Ctx; col: Collection }) {
  const [editing, setEditing] = useState(false);
  const roots = col.pages.filter((p) => !p.parentId);
  const moveWidget = (i: number, dir: -1 | 1) => ctx.update((m) => patchCollection(m, col.id, (c) => {
    const list = [...c.widgets];
    const j = i + dir;
    if (j < 0 || j >= list.length) return c;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...c, widgets: list };
  }));

  return (
    <div className={styles.mindStack}>
      {ctx.mind.guide && !ctx.mind.guideDismissed && <GuideCard ctx={ctx} />}

      <div className={styles.mindSectionBar}>
        <p className={styles.sheetLabel}>Home</p>
        {editing ? (
          <button className={styles.mindPill} data-strong onClick={() => setEditing(false)}>Done</button>
        ) : (
          <span className={styles.mindBarActions}>
            {col.widgets.length > 0 && (
              <button className={styles.mindIconBtn} onClick={() => setEditing(true)} aria-label="Edit home" title="Edit home"><IconEdit size={16} /></button>
            )}
            <button className={styles.mindPill} onClick={() => ctx.openSheet(<HomeAddSheet ctx={ctx} focus="widgets" />)}><IconPlus size={14} /> Widget</button>
          </span>
        )}
      </div>
      {col.widgets.length > 0 && (
        <div className={`${styles.mindWidgetGrid} ${editing ? styles.mindEditing : ""}`}>
          {col.widgets.map((w, i) => (
            <div key={w.id} className={`${styles.mindWidgetSlot} ${WIDGETS.find((x) => x.kind === w.kind)?.wide ? styles.mindWide : ""}`}>
              <WidgetView ctx={ctx} col={col} kind={w.kind} />
              {editing && (
                <span className={styles.mindWidgetEdit}>
                  <button onClick={() => moveWidget(i, -1)} disabled={i === 0} aria-label="Move earlier">‹</button>
                  <button onClick={() => ctx.update((m) => patchCollection(m, col.id, (c) => ({ ...c, widgets: c.widgets.filter((x) => x.id !== w.id) })))} aria-label="Remove widget"><IconClose size={12} /></button>
                  <button onClick={() => moveWidget(i, 1)} disabled={i === col.widgets.length - 1} aria-label="Move later">›</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className={styles.mindSectionBar}>
        <p className={styles.sheetLabel}>Pages</p>
        <button className={styles.mindIconBtn} onClick={() => ctx.openSheet(<NewPageSheet ctx={ctx} col={col} />)} aria-label="New page" title="New page"><IconPlus size={16} /></button>
      </div>
      <div className={styles.mindRows}>
        <button className={styles.mindPageRow} onClick={() => ctx.go({ kind: "vault" })}>
          <span className={styles.mindEmoji}><Emoji char="🗄️" /></span>
          <span className={styles.mindPageText}>
            <b>Vault</b>
            <small>{col.vault.length ? `${col.vault.length} to sort · newest: ${ctx.mind.blocks[col.vault[0]]?.title ?? ""}` : "Saves land here first"}</small>
          </span>
          <span className={styles.mindPageSide}>{col.vault.length > 0 && <em className={styles.mindCount}>{col.vault.length}</em>}<IconChevron size={14} /></span>
        </button>
        {roots.map((p, i) => <PageTree key={p.id} ctx={ctx} col={col} page={p} i={i} />)}
        {!roots.length && (
          <button className={styles.mindEmptySection} onClick={() => ctx.openSheet(<NewPageSheet ctx={ctx} col={col} />)}>
            <IconPlus size={14} /> Make your first page
          </button>
        )}
      </div>
    </div>
  );
}

function PageTree({ ctx, col, page, i, depth = 0 }: { ctx: Ctx; col: Collection; page: Page; i: number; depth?: number }) {
  const kids = childrenOf(col, page.id);
  const list = pageItems(ctx.mind, page);
  const tasks = list.filter((b) => b.kind === "todo");
  const done = tasks.filter((b) => b.done).length;
  return (
    <>
      <div className={`${styles.mindTreeRow} ${styles.rowEnter}`} style={{ ["--i" as string]: i, ["--depth" as string]: depth }}>
        <button className={styles.mindPageRow} onClick={() => ctx.openPage(page.id)}>
          <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${page.tone} 16%, transparent)` }}><Emoji char={page.emoji} /></span>
          <span className={styles.mindPageText}>
            <b>{page.title}</b>
            <small>{list.length} {list.length === 1 ? "item" : "items"}{kids.length ? ` · ${kids.length} sub-page${kids.length > 1 ? "s" : ""}` : ""}</small>
            {tasks.length > 0 && <span className={styles.mindRowBar}><i style={{ width: `${(done / tasks.length) * 100}%`, background: page.tone }} /></span>}
          </span>
          <span className={styles.mindPageSide}>
            {page.pinned && <Emoji char="📌" />}
            <IconChevron size={14} />
          </span>
        </button>
        {kids.length > 0 && (
          <button
            className={`${styles.mindTreeToggle} ${page.collapsed ? styles.mindChevronShut : ""}`}
            onClick={() => ctx.update((m) => patchPage(m, page.id, (p) => ({ ...p, collapsed: !p.collapsed })))}
            aria-label={page.collapsed ? "Show sub-pages" : "Hide sub-pages"}
            aria-expanded={!page.collapsed}
          >
            <IconChevronDown size={14} />
          </button>
        )}
      </div>
      {kids.length > 0 && (
        <div className={`${styles.mindFoldBody} ${page.collapsed ? styles.mindFolded : ""}`}>
          <div className={styles.mindTreeKids}>
            {kids.map((k, j) => <PageTree key={k.id} ctx={ctx} col={col} page={k} i={j} depth={depth + 1} />)}
          </div>
        </div>
      )}
    </>
  );
}

/* ===========================================================================
   Widgets — every number comes from items
   =========================================================================== */

function WidgetView({ ctx, col, kind, preview = false }: { ctx: Ctx; col: Collection; kind: WidgetKind; preview?: boolean }) {
  const items = collectionItems(ctx.mind, col);
  const [flipped, setFlipped] = useState(false);
  const where = (b: Block) => locate(ctx.mind, b.id)?.page;
  const open = (b: Block) => { const p = where(b); if (p && !preview) ctx.openPage(p.id); };
  const hint = (text: string) => <p className={styles.wHint}>{text}</p>;

  switch (kind) {
    case "streak": {
      const days = [...col.activity, ...items.flatMap((b) => b.days ?? [])];
      const n = streakOf(days);
      const set = new Set(days);
      return (
        <div className={`${styles.widget} ${styles.wStreak}`}>
          <span className={styles.wLabel}>Streak</span>
          <b className={styles.wBig}><Emoji char="🔥" /> {n}</b>
          <span className={styles.wSub}>{n ? `day${n === 1 ? "" : "s"} in a row` : "Practise today to start"}</span>
          <span className={styles.mbWeek}>{lastSevenDays().map((d) => <i key={d} className={set.has(d) ? styles.mbWeekOn : undefined} />)}</span>
        </div>
      );
    }
    case "review": {
      const due = items.filter((b) => b.kind === "flashcard" && b.due).length;
      const cards = items.filter((b) => b.kind === "flashcard").length;
      return (
        <div className={styles.widget}>
          <span className={styles.wLabel}>Review</span>
          <b className={styles.wBig}>{due}</b>
          <span className={styles.wSub}>{cards ? (due ? `of ${cards} cards due` : "All learned") : "No flashcards yet"}</span>
          {due > 0 && !preview && <button className={styles.mindPrimary} onClick={() => ctx.openSheet(<ReviewSheet ctx={ctx} col={col} />)}>Start</button>}
        </div>
      );
    }
    case "word": {
      const pool = items.filter((b) => b.kind === "flashcard");
      const w = pool[dayIndex(pool.length)];
      return (
        <button className={`${styles.widget} ${styles.wWord} ${flipped ? styles.mbFlipped : ""}`} onClick={() => setFlipped((f) => !f)} disabled={!w || preview}>
          <span className={styles.wLabel}>Word of the day</span>
          {w ? (
            <span className={styles.mbCardInner}>
              <span className={styles.mbFace}><b>{w.title}</b><small>Tap for the meaning</small></span>
              <span className={`${styles.mbFace} ${styles.mbBack}`}><b>{w.back}</b></span>
            </span>
          ) : hint("Add a flashcard and one shows up here every day.")}
        </button>
      );
    }
    case "progress": {
      const p = items.find((b) => b.kind === "progress");
      const tasks = items.filter((b) => b.kind === "todo");
      const value = p ? p.value ?? 0 : tasks.filter((t) => t.done).length;
      const total = p ? p.total ?? 1 : tasks.length;
      const pct = total ? Math.round((value / total) * 100) : 0;
      return (
        <div className={styles.widget} onClick={() => p && open(p)}>
          <span className={styles.wLabel}>{p ? p.title : "Tasks"}</span>
          {total ? (
            <span className={styles.wRingRow}>
              <svg viewBox="0 0 36 36" className={styles.wRing} aria-hidden="true">
                <circle cx="18" cy="18" r="15" />
                <circle cx="18" cy="18" r="15" style={{ strokeDasharray: `${(pct / 100) * 94.2} 94.2`, stroke: col.tone }} />
              </svg>
              <span><b className={styles.wMid}>{pct}%</b><span className={styles.wSub}>{value} of {total}</span></span>
            </span>
          ) : hint("Add a Progress item or some to-dos.")}
        </div>
      );
    }
    case "countdown": {
      const next = items.filter((b) => b.kind === "date" && daysUntil(b.at ?? 0) >= 0).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0];
      const n = next ? daysUntil(next.at ?? 0) : 0;
      return (
        <div className={styles.widget} onClick={() => next && open(next)}>
          <span className={styles.wLabel}>Countdown</span>
          {next ? <><b className={styles.wBig}>{n === 0 ? "Today" : n}</b><span className={styles.wSub}>{n === 0 ? next.title : `day${n === 1 ? "" : "s"} to ${next.title}`}</span></> : hint("Add a Date to count down to.")}
        </div>
      );
    }
    case "totals": {
      const amounts = items.filter((b) => b.kind === "amount");
      const unpaid = amounts.filter((b) => !b.paid);
      const overdue = unpaid.filter((b) => b.at && isPast(b.at));
      const sum = (l: Block[]) => l.reduce((n, b) => n + (b.amount ?? 0), 0);
      return (
        <div className={`${styles.widget} ${overdue.length ? styles.wWarn : ""}`}>
          <span className={styles.wLabel}>Unpaid</span>
          {amounts.length ? <><b className={styles.wBig}>{euro(sum(unpaid))}</b><span className={styles.wSub}>{overdue.length ? `${overdue.length} overdue · ` : ""}{euro(sum(amounts) - sum(unpaid))} paid</span></> : hint("Add an Amount to see totals.")}
        </div>
      );
    }
    case "needs": {
      const list = items.filter((b) =>
        (b.kind === "amount" && !b.paid && !!b.at && isPast(b.at))
        || (b.kind === "todo" && !b.done && (b.tags.includes("urgent") || b.status === "doing"))
        || (b.kind === "date" && daysUntil(b.at ?? 0) >= 0 && daysUntil(b.at ?? 0) <= 3),
      ).slice(0, 4);
      return (
        <div className={styles.widget}>
          <span className={styles.wLabel}>Needs you</span>
          {list.length ? (
            <span className={styles.wList}>
              {list.map((b) => (
                <button key={b.id} onClick={() => open(b)}>
                  <Emoji char={KIND_EMOJI[b.kind] ?? "💬"} />
                  <b>{b.kind === "amount" ? `${b.title} · ${b.source} · ${euro(b.amount ?? 0)}` : b.title}</b>
                  <em>{b.kind === "amount" ? "Overdue" : b.kind === "date" ? relDay(b.at ?? 0) : b.tags.includes("urgent") ? "Urgent" : "Doing"}</em>
                </button>
              ))}
            </span>
          ) : hint("Nothing overdue, urgent or in progress.")}
        </div>
      );
    }
    case "covers": {
      const covers = col.pages.map((p) => ({ p, img: pageItems(ctx.mind, p).find((b) => b.kind === "image") })).filter((x) => x.img).slice(0, 4);
      return (
        <div className={`${styles.widget} ${styles.wCovers}`}>
          {covers.length ? covers.map(({ p, img }) => (
            <button key={p.id} onClick={() => !preview && ctx.openPage(p.id)}>
              <BlockView block={img!} shape="tile" />
              <b><Emoji char={p.emoji} /> {p.title}</b>
            </button>
          )) : hint("Pages with pictures show their first one here.")}
        </div>
      );
    }
    case "recent": {
      const list = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
      return (
        <div className={styles.widget}>
          <span className={styles.wLabel}>Recently added</span>
          {list.length ? (
            <span className={styles.wList}>
              {list.map((b) => (
                <button key={b.id} onClick={() => open(b)}>
                  {b.kind === "image" && b.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.image} alt="" className={styles.wThumb} />
                  ) : <Emoji char={KIND_EMOJI[b.kind] ?? "💬"} />}
                  <b>{b.title}</b>
                  <em>{where(b)?.title ?? "Vault"}</em>
                </button>
              ))}
            </span>
          ) : hint("Nothing here yet.")}
        </div>
      );
    }
    case "pinned": {
      const pins = col.pages.filter((p) => p.pinned);
      return (
        <div className={styles.widget}>
          <span className={styles.wLabel}>Pinned</span>
          {pins.length ? (
            <span className={styles.wPins}>
              {pins.map((p) => <button key={p.id} onClick={() => !preview && ctx.openPage(p.id)}><Emoji char={p.emoji} /> {p.title}</button>)}
            </span>
          ) : hint("Pin a page from its ··· menu.")}
        </div>
      );
    }
    case "vault": return (
      <div className={styles.widget} onClick={() => !preview && ctx.go({ kind: "vault" })}>
        <span className={styles.wLabel}>Vault</span>
        <b className={styles.wBig}>{col.vault.length}</b>
        <span className={styles.wSub}>{col.vault.length ? "waiting to be sorted" : "All sorted"}</span>
      </div>
    );
    case "tags": {
      const t = tagsOf(items).slice(0, 8);
      return (
        <div className={styles.widget}>
          <span className={styles.wLabel}>Tags</span>
          {t.length ? <span className={styles.wPins}>{t.map((x) => <button key={x} onClick={() => !preview && ctx.go({ kind: "tag", tag: x })}>#{x}</button>)}</span> : hint("Tag items to see them here.")}
        </div>
      );
    }
  }
}

/* ===========================================================================
   Empty Minds and Jamshad's guide
   =========================================================================== */

function EmptyMind({ ctx }: { ctx: Ctx }) {
  return (
    <div className={styles.mindStack}>
      <div className={styles.mindStarter}>
        <Logo size={36} />
        <h2>{ctx.mind.guide ? "Let's build your Mind" : "Make Mind yours"}</h2>
        <p>{ctx.mind.guide
          ? "You're preparing the investor pitch. Follow the steps: every piece is made with the + button."
          : "Start a collection for something you care about: a language, a client, a room. Everything inside it is yours to arrange."}</p>
        <button className={styles.mindPrimary} onClick={() => ctx.openSheet(<NewCollectionSheet ctx={ctx} template={ctx.mind.guide ? "project" : undefined} name={ctx.mind.guide ? "Pitch" : undefined} widgets={ctx.mind.guide ? ["needs", "recent"] : undefined} />)}>
          <IconPlus size={14} /> New collection
        </button>
      </div>
      {ctx.mind.guide && <GuideCard ctx={ctx} />}
    </div>
  );
}

function GuideCard({ ctx }: { ctx: Ctx }) {
  const steps = pitchGuide(ctx.mind);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <section className={styles.mindGuide}>
      <div className={styles.mindGuideHead}>
        <b>Build Jamshad&apos;s pitch Mind</b>
        <span>{done} of {steps.length}</span>
      </div>
      <span className={styles.mbBar}><i style={{ width: `${(done / steps.length) * 100}%` }} /></span>
      <ol className={styles.mindSteps}>
        {steps.map((s) => (
          <li key={s.id} className={s.done ? styles.mindStepDone : s === next ? styles.mindStepNext : undefined}>
            <span className={styles.mindStepMark}>{s.done && <IconCheck size={11} />}</span>
            <span><b>{s.title}</b>{s === next && <small>{s.how}</small>}</span>
          </li>
        ))}
      </ol>
      {!next && (
        <button className={styles.mindSecondary} onClick={() => ctx.update((m) => ({ ...m, guideDismissed: true }))}>
          <Emoji char="🎉" /> All set. Hide the guide
        </button>
      )}
    </section>
  );
}

/* ===========================================================================
   Vault, tags and search
   =========================================================================== */

function VaultView({ ctx, col }: { ctx: Ctx; col: Collection }) {
  const items = col.vault.map((id) => ctx.mind.blocks[id]).filter(Boolean);
  return (
    <div className={styles.mindStack}>
      <div className={styles.mindIntro}>
        <h3><Emoji char="🗄️" /> Vault</h3>
        <p>Saves from chats land here first. Sort them into a page when you have a minute.</p>
      </div>
      {items.length === 0 ? (
        <p className={styles.emptyInbox}>All sorted. Hold any message in a chat and choose Save to Mind.</p>
      ) : (
        <div className={styles.mindRows}>
          {items.map((b) => (
            <div key={b.id} className={styles.mindInboxItem}>
              <button className={styles.mindTileBtn} onClick={() => ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />)}>
                <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} onToggle={() => toggleItem(ctx.update, b)} />
              </button>
              <button className={styles.mindSort} onClick={() => ctx.openSheet(<MoveSheet me={ctx.me} id={b.id} onClose={ctx.closeSheet} onMoved={ctx.flash} title="Sort into" />)}>Sort</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemList({ ctx, blocks, empty }: { ctx: Ctx; blocks: Block[]; empty: string }) {
  if (!blocks.length) return <p className={styles.emptyInbox}>{empty}</p>;
  return (
    <div className={styles.mindRows}>
      {blocks.map((b) => {
        const at = locate(ctx.mind, b.id);
        return (
          <button key={b.id} className={styles.mindTileBtn} onClick={() => ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />)}>
            <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} onToggle={() => toggleItem(ctx.update, b)} />
            <span className={styles.mindWhere}>{emojify(at?.page ? `${at.page.emoji} ${at.page.title}` : "🗄️ Vault")}</span>
          </button>
        );
      })}
    </div>
  );
}

function TagView({ ctx, col, tag }: { ctx: Ctx; col: Collection; tag: string }) {
  const blocks = collectionItems(ctx.mind, col).filter((b) => b.tags.includes(tag));
  return (
    <div className={styles.mindStack}>
      <div className={styles.mindIntro}><h3>#{tag}</h3><p>{blocks.length} items in {col.name}.</p></div>
      <ItemList ctx={ctx} blocks={blocks} empty="Nothing tagged yet." />
    </div>
  );
}

function SearchResults({ ctx, col, q }: { ctx: Ctx; col: Collection; q: string }) {
  const pages = col.pages.filter((p) => p.title.toLowerCase().includes(q));
  const blocks = collectionItems(ctx.mind, col).filter((b) =>
    [b.title, b.body, b.source, b.back, b.note, ...b.tags].some((s) => s?.toLowerCase().includes(q)));
  return (
    <div className={styles.mindStack}>
      {pages.length > 0 && <div className={styles.mindRows}>{pages.map((p, i) => <PageTree key={p.id} ctx={ctx} col={col} page={p} i={i} />)}</div>}
      <ItemList ctx={ctx} blocks={blocks} empty={`Nothing in ${col.name} matches “${q}”.`} />
    </div>
  );
}

function toggleItem(update: Ctx["update"], b: Block) {
  if (b.kind === "todo") {
    const done = !b.done;
    update((m) => patchBlock(m, b.id, { done, status: b.status ? (done ? "done" : "todo") : undefined }));
  } else if (b.kind === "habit") {
    const today = todayKey();
    const has = b.days?.includes(today);
    update((m) => {
      const next = patchBlock(m, b.id, { days: has ? (b.days ?? []).filter((d) => d !== today) : [...(b.days ?? []), today] });
      const at = locate(next, b.id);
      return !has && at ? logPractice(next, at.collection.id) : next;
    });
  }
}

/* ===========================================================================
   A page — sections, views, sub-pages, quick add, drag and drop
   =========================================================================== */

type Target = { sid?: string; before?: string | null; col?: TaskStatus } | null;

const PLACEHOLDER: Partial<Record<BlockKind, string>> = {
  flashcard: "New card: word = meaning",
  todo: "New task",
  link: "Paste a link, or a title",
  quote: "A sentence worth keeping",
  video: "Video title",
  book: "Book title",
  image: "Write a note, or tap + for a photo",
  amount: "What for, and how much? e.g. Invoice 044 1200",
};

function PageScreen({ ctx, col, pageId, leaving, onBack, onOpen }: { ctx: Ctx; col: Collection; pageId: string; leaving: boolean; onBack: () => void; onOpen: (id: string) => void }) {
  const page = col.pages.find((p) => p.id === pageId)!;
  const parent = page.parentId ? col.pages.find((p) => p.id === page.parentId) : null;
  const kids = childrenOf(col, page.id);
  const [tag, setTag] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x0: number; y0: number; offX: number; offY: number; active: boolean; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; w: number; h: number } | null>(null);
  const [target, setTarget] = useState<Target>(null);
  const targetRef = useRef<Target>(null);
  const suppressClick = useRef(false);

  const all = pageItems(ctx.mind, page);
  const pageTags = tagsOf(all);
  const visible = (id: string) => { const b = ctx.mind.blocks[id]; return !!b && (!tag || b.tags.includes(tag)); };
  const setView = (view: MindView) => ctx.update((m) => patchPage(m, page.id, (p) => ({ ...p, view })));
  const due = all.filter((b) => b.kind === "flashcard" && b.due).length;

  /* ---- quick add, like the composer ---- */
  const quickAdd = () => {
    const text = draft.trim();
    if (!text) return;
    const kind: BlockKind = ["image", "file", "palette", "progress", "habit", "date", "chat"].includes(page.defaultKind) ? "note" : page.defaultKind;
    const id = newId();
    const b: Block = { id, kind, title: text, tags: [], createdAt: nowMs() };
    if (kind === "flashcard") {
      const [front, ...rest] = text.split(/\s*(?:=|—|–| - |:)\s*/);
      b.title = front;
      b.back = rest.join(" ") || "…";
      b.due = true;
    } else if (kind === "link") {
      const url = text.match(/(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?/i)?.[0];
      b.source = url ? url.replace(/^https?:\/\//, "").split("/")[0] : "link";
      b.url = url ? (url.startsWith("http") ? url : `https://${url}`) : undefined;
      b.title = text.replace(url ?? "", "").trim() || b.source;
    } else if (kind === "todo") {
      if (page.view === "board" || all.some((x) => x.status)) b.status = "todo";
    } else if (kind === "amount") {
      const n = text.match(/\d+(?:[.,]\d+)?(?!.*\d)/)?.[0];
      b.amount = n ? Number(n.replace(",", ".")) : 0;
      b.title = text.replace(n ?? "", "").trim() || "Amount";
      b.paid = false;
    } else if (kind === "book") {
      b.shelf = "want";
    }
    ctx.update((m) => place({ ...m, blocks: { ...m.blocks, [id]: b } }, id, { collectionId: col.id, pageId: page.id, sectionId: page.sections[page.sections.length - 1]?.id }));
    setDraft("");
  };

  /* ---- drag and drop ---- */
  const moveGhost = (x: number, y: number) => {
    const root = rootRef.current?.getBoundingClientRect();
    const d = drag.current;
    if (!root || !d || !ghostRef.current) return;
    ghostRef.current.style.transform = `translate(${x - root.left - d.offX}px, ${y - root.top - d.offY}px) rotate(-1.5deg) scale(1.04)`;
  };
  const onBlockDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const pointerId = e.pointerId;
    drag.current = {
      id, x0: e.clientX, y0: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, active: false,
      timer: setTimeout(() => {
        const d = drag.current;
        if (!d) return;
        d.active = true;
        suppressClick.current = true;
        try { el.setPointerCapture(pointerId); } catch { /* pointer gone */ }
        navigator.vibrate?.(8);
        setDragging({ id, w: r.width, h: r.height });
        requestAnimationFrame(() => moveGhost(d.x0, d.y0));
      }, HOLD_MS),
    };
  };
  const findTarget = (x: number, y: number): Target => {
    const d = drag.current!;
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const colEl = hit?.closest<HTMLElement>("[data-col]");
    if (colEl) return { col: colEl.dataset.col as TaskStatus };
    const over = hit?.closest<HTMLElement>("[data-bid]");
    if (over && over.dataset.bid !== d.id) {
      const sid = over.dataset.sid!;
      const r = over.getBoundingClientRect();
      const after = over.dataset.axis === "x" ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
      const list = (page.sections.find((s) => s.id === sid)?.blockIds ?? []).filter((id) => id !== d.id);
      const at = list.indexOf(over.dataset.bid!);
      return { sid, before: after ? list[at + 1] ?? null : over.dataset.bid! };
    }
    const zone = hit?.closest<HTMLElement>("[data-drop-sid]");
    if (zone) return { sid: zone.dataset.dropSid!, before: null };
    return null;
  };
  const onRootMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) { clearTimeout(d.timer); drag.current = null; }
      return;
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    const t = findTarget(e.clientX, e.clientY);
    if (JSON.stringify(t) !== JSON.stringify(targetRef.current)) { targetRef.current = t; setTarget(t); }
    const s = scrollRef.current?.getBoundingClientRect();
    if (s) {
      if (e.clientY < s.top + 70) scrollRef.current!.scrollTop -= 10;
      else if (e.clientY > s.bottom - 70) scrollRef.current!.scrollTop += 10;
    }
  };
  const onRootUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (!d.active) return;
    const t = targetRef.current;
    targetRef.current = null;
    setTarget(null);
    setDragging(null);
    if (!t) return;
    if (t.col) {
      ctx.update((m) => patchBlock(m, d.id, { status: t.col, done: t.col === "done" }));
      ctx.flash(`Moved to ${COLUMNS.find((c) => c.id === t.col)!.label}`);
    } else if (t.sid) {
      const from = locate(ctx.mind, d.id);
      ctx.update((m) => place(m, d.id, { collectionId: col.id, pageId: page.id, sectionId: t.sid, beforeId: t.before }));
      const to = page.sections.find((s) => s.id === t.sid);
      if (from?.section?.id !== t.sid && to) ctx.flash(`Moved to ${to.title || page.title}`);
    }
  };

  const wrap = (b: Block, sid: string, preferred: "tile" | "row", axis: "x" | "y") => {
    const shape = b.kind === "chat" ? "tile" : preferred;
    return (
      <div
        key={b.id}
        data-bid={b.id}
        data-sid={sid}
        data-axis={axis}
        className={[
          styles.mindBlockWrap,
          dragging?.id === b.id ? styles.mindDragSource : "",
          target?.before === b.id ? (axis === "x" ? styles.mindDropLeft : styles.mindDropAbove) : "",
        ].filter(Boolean).join(" ")}
        onPointerDown={(e) => onBlockDown(e, b.id)}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <BlockView block={b} shape={shape} onToggle={() => toggleItem(ctx.update, b)} />
      </div>
    );
  };

  const renderSection = (s: Page["sections"][number], view: MindView) => {
    const ids = s.blockIds.filter(visible);
    if (tag && !ids.length) return null;
    const blocks = ids.map((id) => ctx.mind.blocks[id]);
    const headless = !s.title;
    return (
      <section key={s.id} className={styles.mindSection}>
        {!headless && (
          <div className={`${styles.mindSectionHead} ${target?.sid === s.id && target.before === null ? styles.mindDropInto : ""}`} data-drop-sid={s.id}>
            <button
              className={styles.mindSectionToggle}
              aria-expanded={!s.collapsed}
              onClick={() => ctx.update((m) => patchPage(m, page.id, (p) => ({ ...p, sections: p.sections.map((x) => (x.id === s.id ? { ...x, collapsed: !x.collapsed } : x)) })))}
            >
              <span className={`${styles.mindChevron} ${s.collapsed ? styles.mindChevronShut : ""}`}><IconChevronDown size={14} /></span>
              {s.emoji && <Emoji char={s.emoji} />}
              <b>{s.title}</b>
              <em>{ids.length}</em>
            </button>
            <button className={styles.mindAdd} onClick={() => ctx.openSheet(<AddItemSheet ctx={ctx} to={{ collectionId: col.id, pageId: page.id, sectionId: s.id }} kind={page.defaultKind} />)} aria-label={`Add to ${s.title}`}>
              <IconPlus size={14} />
            </button>
          </div>
        )}
        <div className={`${styles.mindFoldBody} ${s.collapsed && !headless ? styles.mindFolded : ""}`}>
          <div
            data-drop-sid={s.id}
            className={[
              view === "shelf" ? styles.mindShelf : view === "grid" ? styles.mindGridView : styles.mindListView,
              target?.sid === s.id && target.before === null && headless ? styles.mindDropInto : "",
            ].join(" ")}
          >
            {blocks.map((b) => wrap(b, s.id, view === "list" ? "row" : "tile", view === "list" || view === "board" ? "y" : "x"))}
            {!blocks.length && <p className={styles.mindColumnEmpty}>Empty. Use the field below, or drop something here.</p>}
          </div>
        </div>
      </section>
    );
  };

  const boardTasks = all.filter((b) => b.kind === "todo" && b.status && visible(b.id));
  const draggingBlock = dragging ? ctx.mind.blocks[dragging.id] : null;

  return (
    <div
      ref={rootRef}
      className={`${styles.screen} ${styles.chatScreen} ${styles.mindPageScreen} ${leaving ? styles.leaving : ""}`}
      onPointerMove={onRootMove}
      onPointerUp={onRootUp}
      onPointerCancel={onRootUp}
      style={{ ["--tone" as string]: page.tone }}
    >
      <div className={styles.edgeTop} />
      <header className={styles.chatHeader}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label={`Back to ${col.name}`}><IconBack /></button>
        <div className={styles.titleCapsule}>
          <span className={styles.mindPageBadge}><Emoji char={page.emoji} /></span>
          <div className={`${styles.tcName} ${styles.glass}`}><span>{page.title}</span></div>
          <span className={styles.tcPresence}>{col.name}{parent ? ` › ${parent.title}` : ""} · {all.length} items</span>
        </div>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => ctx.openSheet(<PageSheet ctx={ctx} col={col} pageId={page.id} onDeleted={onBack} />)} aria-label="Page settings"><IconMore /></button>
      </header>

      <div className={styles.mindPageScroll} ref={scrollRef}>
        <div className={styles.mindToolbar}>
          {page.views.length > 1 ? (
            <div className={styles.mindViews} role="tablist" aria-label="View">
              {page.views.map((v) => (
                <button key={v} role="tab" aria-selected={page.view === v} className={page.view === v ? styles.mindViewOn : undefined} onClick={() => setView(v)}>
                  {VIEW_META[v].icon}{VIEW_META[v].label}
                </button>
              ))}
            </div>
          ) : <span />}
          {due > 0 && <button className={styles.mindPrimary} onClick={() => ctx.openSheet(<ReviewSheet ctx={ctx} col={col} pageId={page.id} />)}>Review {due}</button>}
        </div>

        {(kids.length > 0 || parent) && (
          <div className={styles.mindSubpages}>
            {parent && <button onClick={() => onOpen(parent.id)}><IconBack size={13} /> {parent.title}</button>}
            {kids.map((k) => <button key={k.id} onClick={() => onOpen(k.id)}><Emoji char={k.emoji} /> {k.title} <em>{pageItems(ctx.mind, k).length}</em></button>)}
          </div>
        )}

        {pageTags.length > 0 && (
          <div className={styles.chips}>
            <button className={`${styles.chip} ${!tag ? styles.chipOn : ""}`} onClick={() => setTag(null)}>All</button>
            {pageTags.map((t) => (
              <button key={t} className={`${styles.chip} ${tag === t ? styles.chipOn : ""}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
            ))}
          </div>
        )}

        {page.view === "board" ? (
          <>
            <div className={styles.mindBoardView}>
              {COLUMNS.map((c) => {
                const list = boardTasks.filter((b) => b.status === c.id);
                return (
                  <div key={c.id} className={`${styles.mindColumn} ${target?.col === c.id ? styles.mindDropInto : ""}`} data-col={c.id}>
                    <p className={styles.mindColumnHead}><span className={styles[`mindCol_${c.id}`]} />{c.label}<em>{list.length}</em></p>
                    {list.map((b) => wrap(b, locate(ctx.mind, b.id)?.section?.id ?? "", "tile", "y"))}
                    {!list.length && <p className={styles.mindColumnEmpty}>Drop a task here</p>}
                  </div>
                );
              })}
            </div>
            {page.sections.map((s) => {
              const rest = s.blockIds.filter((id) => !(ctx.mind.blocks[id]?.kind === "todo" && ctx.mind.blocks[id]?.status));
              if (!rest.length && s.blockIds.length) return null;
              return renderSection({ ...s, blockIds: rest }, "list");
            })}
          </>
        ) : page.sections.map((s) => renderSection(s, page.view))}
      </div>

      <div className={styles.mindCompose}>
        <div className={`${styles.mindComposeField} ${styles.glassStrong}`}>
          <button className={styles.mindComposePlus} onClick={() => ctx.openSheet(<PageAddSheet ctx={ctx} col={col} page={page} />)} aria-label={`Add to ${page.title}`}>
            <IconPlus size={18} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }}
            placeholder={PLACEHOLDER[page.defaultKind] ?? `Add to ${page.title}`}
            aria-label={`Quick add to ${page.title}`}
          />
          <button className={`${styles.mindComposeSend} ${draft.trim() ? styles.mindComposeReady : ""}`} onClick={quickAdd} disabled={!draft.trim()} aria-label="Add">
            <IconArrowUp size={16} />
          </button>
        </div>
      </div>

      {draggingBlock && dragging && (
        <div ref={ghostRef} className={styles.mindGhost} style={{ width: dragging.w, height: dragging.h }} aria-hidden="true">
          <BlockView block={draggingBlock} shape={page.view === "list" ? "row" : "tile"} />
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   The + sheets
   =========================================================================== */

function KindGrid({ onPick, first }: { onPick: (k: BlockKind) => void; first?: BlockKind }) {
  const ordered = first ? [...KINDS.filter((k) => k.kind === first), ...KINDS.filter((k) => k.kind !== first)] : KINDS;
  return (
    <>
      {(["Capture", "Track"] as const).map((g, gi) => (
        <div key={g} className={styles.addGroup}>
          <p className={styles.sheetLabel}>{g === "Capture" ? "Keep" : "Track"}</p>
          <div className={styles.addGrid}>
            {ordered.filter((k) => k.group === g).map((k, i) => (
              <button key={k.kind} className={styles.addTile} style={{ ["--i" as string]: gi * 5 + i }} onClick={() => onPick(k.kind)}>
                <span className={`${styles.addIcon} ${styles.mindKindIcon} ${k.kind === first ? styles.mindKindFirst : ""}`}><Emoji char={k.emoji} /></span>
                {k.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** + on a collection's home: structure, a carousel of live widgets, and capture into the Vault. */
function HomeAddSheet({ ctx, focus }: { ctx: Ctx; focus?: "widgets" }) {
  const { mind, update } = useMind(ctx.me);
  const carousel = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (focus === "widgets") carousel.current?.scrollIntoView({ block: "start" }); }, [focus]);
  const col = mind ? collectionOf(mind, ctx.col?.id ?? null) : null;
  if (!mind || !col) return null;
  const live: Ctx = { ...ctx, mind, col, update };
  const has = (k: WidgetKind) => col.widgets.some((w) => w.kind === k);
  return (
    <Sheet title={`Add to ${col.name}`} onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <p className={styles.sheetLabel}>Structure</p>
          <div className={styles.mindStructure}>
            <button onClick={() => close(() => ctx.openSheet(<NewPageSheet ctx={live} col={col} />))}><Emoji char="📄" /><b>Page</b><small>One topic</small></button>
            <button onClick={() => close(() => ctx.openSheet(<NewPageSheet ctx={live} col={col} sub />))} disabled={!col.pages.length}><Emoji char="📑" /><b>Sub-page</b><small>Inside a page</small></button>
            <button onClick={() => close(() => ctx.openSheet(<NewCollectionSheet ctx={live} />))}><Emoji char="🗂️" /><b>Collection</b><small>A new area</small></button>
          </div>

          <p className={styles.sheetLabel} ref={carousel}>Widgets for your home · scroll sideways</p>
          <div className={styles.mindCarousel}>
            {WIDGETS.map((w) => (
              <div key={w.kind} className={styles.mindCarouselItem}>
                <div className={styles.mindCarouselPreview} aria-hidden="true"><WidgetView ctx={live} col={col} kind={w.kind} preview /></div>
                <span className={styles.mindCarouselText}><b>{w.label}</b><small>{w.blurb}</small></span>
                <button
                  className={has(w.kind) ? styles.mindSecondary : styles.mindPrimary}
                  onClick={() => {
                    update((m) => patchCollection(m, col.id, (c) => ({
                      ...c, widgets: has(w.kind) ? c.widgets.filter((x) => x.kind !== w.kind) : [...c.widgets, { id: newId("w"), kind: w.kind }],
                    })));
                    ctx.flash(has(w.kind) ? `${w.label} removed from home` : `${w.label} added to your home`);
                  }}
                >
                  {has(w.kind) ? <><IconCheck size={12} /> On home</> : "Add"}
                </button>
              </div>
            ))}
          </div>

          <p className={styles.sheetLabel}>Or drop something in the Vault</p>
          <KindGrid onPick={(k) => close(() => ctx.openSheet(<AddItemSheet ctx={live} to={{ collectionId: col.id }} kind={k} />))} />
        </>
      )}
    </Sheet>
  );
}

/** + inside a page: items first (this page's kind leads), then structure. */
function PageAddSheet({ ctx, col, page }: { ctx: Ctx; col: Collection; page: Page }) {
  const [sectionName, setSectionName] = useState("");
  return (
    <Sheet title={`Add to ${page.title}`} onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <KindGrid first={page.defaultKind} onPick={(k) => close(() => ctx.openSheet(<AddItemSheet ctx={ctx} to={{ collectionId: col.id, pageId: page.id, sectionId: page.sections[page.sections.length - 1]?.id }} kind={k} />))} />
          <p className={styles.sheetLabel}>Structure</p>
          <div className={styles.mindStructure}>
            <button onClick={() => close(() => ctx.openSheet(<NewPageSheet ctx={ctx} col={col} parentId={page.id} />))}><Emoji char="📑" /><b>Sub-page</b><small>Inside {page.title}</small></button>
          </div>
          <div className={styles.mindAddRow}>
            <input className={styles.plainInput} placeholder="New section, e.g. Everyday" value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
            <button
              className={styles.mindPrimary}
              disabled={!sectionName.trim()}
              onClick={() => close(() => {
                ctx.update((m) => patchPage(m, page.id, (p) => {
                  // A page's first section stays untitled until there's a second one; name it now.
                  const sections = p.sections.length === 1 && !p.sections[0].title ? [{ ...p.sections[0], title: "General", emoji: "📁" }] : p.sections;
                  return { ...p, sections: [...sections, { id: newId("s"), title: sectionName.trim(), emoji: "📁", collapsed: false, blockIds: [] }] };
                }));
                ctx.flash("Section added");
              })}
            >
              Add section
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

const PALETTES: { name: string; colors: string[] }[] = [
  { name: "Sage & oak", colors: ["#8A9A7B", "#C9B79C", "#EDE6DA", "#5B4636", "#2F3A2F"] },
  { name: "Terracotta", colors: ["#C4573F", "#E2A07D", "#F3E3D3", "#7A4A36", "#2B2B2B"] },
  { name: "Coastal", colors: ["#3E67A6", "#8DB3D9", "#EAF1F7", "#C9B79C", "#1F2A36"] },
  { name: "Plum night", colors: ["#86507A", "#C79BBE", "#F2E6EF", "#3C2A38", "#C99432"] },
];
const SAMPLE_IMAGES = ["photo-1586023492125-27b2c045efd7", "photo-1616137466211-f939a420be84", "photo-1519710164239-da123dc03ef4", "photo-1505693416388-ac5ce068fe85"];

function AddItemSheet({ ctx, to, kind: initial }: { ctx: Ctx; to: { collectionId: string; pageId?: string; sectionId?: string }; kind: BlockKind }) {
  const [kind, setKind] = useState<BlockKind>(initial === "chat" ? "note" : initial);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [flag, setFlag] = useState(false);
  const [palette, setPalette] = useState(0);
  const [image, setImage] = useState<string>(SAMPLE_IMAGES[0]);
  const [upload, setUpload] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const col = ctx.mind.collections.find((x) => x.id === to.collectionId);
  const page = col?.pages.find((p) => p.id === to.pageId);
  const where = page ? page.title : `${col?.name} Vault`;
  const meta = KINDS.find((k) => k.kind === kind)!;

  const fields: Record<BlockKind, [string, string?, string?]> = {
    note: ["Title", "Write something…"], todo: ["What needs doing?"], link: ["Title", "Website, e.g. dw.com"],
    video: ["Video title", "Channel", "Length, e.g. 12:04 (optional)"], book: ["Book title", "Author"], quote: ["The quote", "Who said it, or what it means"],
    flashcard: ["Front, e.g. gemütlich", "Back, e.g. cosy"], image: ["Caption"], file: ["Name (optional)"], palette: ["Palette name (optional)"],
    progress: ["What are you tracking?", "Done so far", "Out of"], habit: ["A habit, e.g. Review for 10 minutes"],
    amount: ["What for? e.g. Invoice 044", "From whom? e.g. Acme Co", "Amount in €"], date: ["What's happening? e.g. Pitch day"], chat: [""],
  };
  const [f1, f2, f3] = fields[kind];
  const ready = kind === "file" ? !!upload : kind === "palette" || kind === "image" ? true : !!a.trim();

  const create = async () => {
    const id = newId();
    const t = a.trim();
    const base: Block = { id, kind, title: t, tags: [], createdAt: Date.now() };
    let block: Block = base;
    if (kind === "note") block = { ...base, body: b.trim() };
    if (kind === "todo") block = { ...base, status: page?.view === "board" ? "todo" : undefined };
    if (kind === "link") { const site = b.trim().replace(/^https?:\/\//, ""); block = { ...base, source: site.split("/")[0] || "link", url: site ? `https://${site}` : undefined }; }
    if (kind === "video") block = { ...base, source: b.trim(), duration: c.trim() || undefined };
    if (kind === "book") block = { ...base, source: b.trim(), shelf: "want" };
    if (kind === "quote") block = { ...base, body: b.trim() };
    if (kind === "flashcard") block = { ...base, back: b.trim() || "…", due: true };
    if (kind === "progress") block = { ...base, value: Number(b) || 0, total: Math.max(1, Number(c) || 10) };
    if (kind === "habit") block = { ...base, days: [] };
    if (kind === "amount") block = { ...base, source: b.trim(), amount: Number(c.replace(",", ".")) || 0, paid: flag, at: new Date(`${date}T12:00`).getTime() };
    if (kind === "date") block = { ...base, at: new Date(`${date}T09:00`).getTime() };
    if (kind === "palette") block = { ...base, title: t || PALETTES[palette].name, colors: PALETTES[palette].colors };
    if (kind === "image") {
      if (upload) {
        const att = await toAttachment(upload);
        block = { ...base, title: t || upload.name.replace(/\.[^.]+$/, ""), attachment: att ?? undefined, source: "Uploaded by you" };
      } else {
        block = { ...base, title: t || "Saved image", image: `https://images.unsplash.com/${image}?w=700&q=70&fm=jpg`, source: "Saved by you" };
      }
    }
    if (kind === "file" && upload) {
      const att = await toAttachment(upload);
      block = { ...base, title: t || upload.name, size: upload.size, attachment: att ?? undefined };
    }
    ctx.update((m) => place({ ...m, blocks: { ...m.blocks, [id]: block } }, id, { collectionId: to.collectionId, pageId: to.pageId, sectionId: to.sectionId }));
    ctx.closeSheet();
    ctx.flash(`${meta.emoji} Added to ${where}`);
  };

  return (
    <Sheet title={`${meta.label} · ${where}`} onClose={ctx.closeSheet} action={{ label: "Add", disabled: !ready, onClick: () => { void create(); } }}>
      <div className={styles.chipGrid}>
        {KINDS.map((k) => (
          <button key={k.kind} className={`${styles.choice} ${kind === k.kind ? styles.choiceOn : ""}`} onClick={() => setKind(k.kind)}>{k.label}</button>
        ))}
      </div>
      <input className={`${styles.plainInput} ${styles.mindTitleInput}`} autoFocus placeholder={f1} value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ready) void create(); }} />
      {f2 && (kind === "note"
        ? <textarea className={`${styles.plainInput} ${styles.mindNote}`} placeholder={f2} value={b} onChange={(e) => setB(e.target.value)} rows={3} />
        : <input className={styles.plainInput} placeholder={f2} value={b} onChange={(e) => setB(e.target.value)} inputMode={kind === "progress" ? "numeric" : undefined} />)}
      {f3 && <input className={styles.plainInput} placeholder={f3} value={c} onChange={(e) => setC(e.target.value)} inputMode={kind === "progress" || kind === "amount" ? "decimal" : undefined} />}
      {(kind === "date" || kind === "amount") && (
        <label className={styles.mindField}><span>{kind === "date" ? "On" : "Due"}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      )}
      {kind === "amount" && <div className={styles.mindField}><span>Already paid</span><Toggle on={flag} onChange={setFlag} label="Already paid" /></div>}
      {kind === "palette" && (
        <div className={styles.mindPalettes}>
          {PALETTES.map((p, i) => (
            <button key={p.name} className={palette === i ? styles.mindPickOn : undefined} onClick={() => setPalette(i)}>
              <span className={styles.mbSwatches}>{p.colors.map((c2) => <i key={c2} style={{ background: c2 }} />)}</span>
              <small>{p.name}</small>
            </button>
          ))}
        </div>
      )}
      {(kind === "image" || kind === "file") && (
        <>
          <input ref={fileRef} type="file" accept={kind === "image" ? "image/*" : undefined} hidden onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />
          <button className={styles.secondaryWide} onClick={() => fileRef.current?.click()}>
            {upload ? `✓ ${upload.name}` : kind === "image" ? "Upload a photo" : "Choose a file"}
          </button>
          {kind === "image" && !upload && (
            <>
              <p className={styles.sheetLabel}>Or pick a sample</p>
              <div className={styles.mindPickImages}>
                {SAMPLE_IMAGES.map((src) => (
                  <button key={src} className={image === src ? styles.mindPickOn : undefined} onClick={() => setImage(src)} aria-label="Choose image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://images.unsplash.com/${src}?w=200&q=60&fm=jpg`} alt="" />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

const PAGE_EMOJIS = ["📄", "🃏", "🔁", "📚", "🎧", "💬", "🗂️", "📎", "💶", "💡", "🌐", "📱", "🚀", "🛋️", "🛏️", "🌿", "🏠", "✈️", "🍳", "🎯", "✂️", "⚡️", "📝", "📅"];
const PAGE_KINDS: BlockKind[] = ["note", "flashcard", "todo", "link", "image", "book", "video", "quote", "amount"];
const viewFor = (k: BlockKind): { view: MindView; views: MindView[] } =>
  k === "todo" ? { view: "board", views: ["board", "list"] }
  : k === "flashcard" || k === "image" ? { view: "grid", views: ["grid", "list", "shelf"] }
  : k === "book" || k === "video" ? { view: "shelf", views: ["shelf", "list"] }
  : { view: "list", views: ["list", "grid", "shelf"] };

function NewPageSheet({ ctx, col, parentId, sub = false }: { ctx: Ctx; col: Collection; parentId?: string; sub?: boolean }) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📄");
  const [kind, setKind] = useState<BlockKind>("note");
  const [parent, setParent] = useState<string | undefined>(parentId ?? (sub ? col.pages.find((p) => !p.parentId)?.id : undefined));
  const create = () => {
    const page = { ...blankPage(title.trim() || "Untitled", emoji, col.tone, kind, parent), ...viewFor(kind) };
    ctx.update((m) => patchCollection(m, col.id, (c) => ({ ...c, pages: [...c.pages, page] })));
    ctx.closeSheet();
    ctx.openPage(page.id);
  };
  return (
    <Sheet title={parent ? "New sub-page" : "New page"} onClose={ctx.closeSheet} action={{ label: "Create", disabled: !title.trim(), onClick: create }}>
      <input className={`${styles.plainInput} ${styles.mindTitleInput}`} autoFocus placeholder={parent ? "e.g. Separable verbs" : "e.g. Vocab"} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) create(); }} />
      {(sub || parentId) && (
        <>
          <p className={styles.sheetLabel}>Inside</p>
          <div className={styles.chipGrid}>
            {col.pages.filter((p) => !p.parentId).map((p) => (
              <button key={p.id} className={`${styles.choice} ${parent === p.id ? styles.choiceOn : ""}`} onClick={() => setParent(p.id)}><Emoji char={p.emoji} /> {p.title}</button>
            ))}
          </div>
        </>
      )}
      <p className={styles.sheetLabel}>Mostly holds</p>
      <div className={styles.chipGrid}>
        {PAGE_KINDS.map((k) => (
          <button key={k} className={`${styles.choice} ${kind === k ? styles.choiceOn : ""}`} onClick={() => setKind(k)}><Emoji char={KIND_EMOJI[k]} /> {KIND_LABEL[k]}s</button>
        ))}
      </div>
      <p className={styles.sheetNote}>This sets the quick-add field and the first view ({VIEW_META[viewFor(kind).view].label}). Any page can hold anything.</p>
      <p className={styles.sheetLabel}>Icon</p>
      <div className={styles.mindEmojiGrid}>
        {PAGE_EMOJIS.map((e) => <button key={e} className={emoji === e ? styles.mindPickOn : undefined} onClick={() => setEmoji(e)}><Emoji char={e} /></button>)}
      </div>
    </Sheet>
  );
}

function NewCollectionSheet({ ctx, template: t0, name: n0, widgets: w0 }: { ctx: Ctx; template?: string; name?: string; widgets?: WidgetKind[] }) {
  const [template, setTemplate] = useState(t0 ?? "language");
  const [lang, setLang] = useState("de");
  const tpl = COLLECTION_TEMPLATES.find((t) => t.id === template)!;
  const language = LANGUAGES.find((l) => l.code === lang)!;
  const [name, setName] = useState(n0 ?? "");
  const [widgets, setWidgets] = useState<WidgetKind[]>(w0 ?? tpl.widgets);
  const pick = (id: string) => {
    setTemplate(id);
    setWidgets(COLLECTION_TEMPLATES.find((t) => t.id === id)!.widgets);
  };
  const create = () => {
    const isLang = !!tpl.askLanguage;
    const c = makeCollection(template, name.trim() || (isLang ? language.name : tpl.name), { emoji: isLang ? language.emoji : undefined, lang: isLang ? lang : undefined, widgets });
    ctx.update((m) => ({ ...m, collections: [...m.collections, c], current: c.id }));
    ctx.closeSheet();
    ctx.go({ kind: "home" });
    ctx.flash(`${c.emoji} ${c.name} is ready`);
  };
  return (
    <Sheet title="New collection" onClose={ctx.closeSheet} action={{ label: "Create", onClick: create }}>
      <p className={styles.sheetLabel}>Start from</p>
      <div className={styles.listGroup}>
        {COLLECTION_TEMPLATES.map((t) => (
          <button key={t.id} className={styles.actionRow} onClick={() => pick(t.id)} aria-pressed={template === t.id}>
            <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${t.tone} 16%, transparent)` }}><Emoji char={t.emoji} /></span>
            <span className={styles.contactText}><b>{t.name}</b><small>{t.blurb}</small></span>
            <span className={`${styles.pickCircle} ${template === t.id ? styles.pickOn : ""}`}>{template === t.id && <IconCheck size={12} />}</span>
          </button>
        ))}
      </div>
      {tpl.askLanguage && (
        <>
          <p className={styles.sheetLabel}>Which language?</p>
          <div className={styles.chipGrid}>
            {LANGUAGES.map((l) => <button key={l.code} className={`${styles.choice} ${lang === l.code ? styles.choiceOn : ""}`} onClick={() => setLang(l.code)}><Emoji char={l.emoji} /> {l.name}</button>)}
          </div>
        </>
      )}
      <p className={styles.sheetLabel}>Name</p>
      <input className={styles.plainInput} placeholder={tpl.askLanguage ? language.name : tpl.name} value={name} onChange={(e) => setName(e.target.value)} aria-label="Collection name" />
      <p className={styles.sheetLabel}>Pages you&apos;ll start with</p>
      <div className={styles.chipGrid}>{tpl.pages.map((p) => <span key={p.title} className={styles.mindTagStatic}><Emoji char={p.emoji} /> {p.title}</span>)}</div>
      <p className={styles.sheetLabel}>Suggested for your home</p>
      <div className={styles.chipGrid}>
        {WIDGETS.map((w) => {
          const on = widgets.includes(w.kind);
          return <button key={w.kind} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} onClick={() => setWidgets((l) => (on ? l.filter((x) => x !== w.kind) : [...l, w.kind]))}>{w.label}</button>;
        })}
      </div>
    </Sheet>
  );
}

function CollectionsSheet({ ctx }: { ctx: Ctx }) {
  return (
    <Sheet title="Collections" onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <div className={styles.listGroup}>
            {ctx.mind.collections.map((c) => {
              const count = collectionItems(ctx.mind, c).length;
              const on = c.id === ctx.col?.id;
              return (
                <button key={c.id} className={styles.actionRow} onClick={() => close(() => { ctx.update((m) => ({ ...m, current: c.id })); ctx.go({ kind: "home" }); })}>
                  <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${c.tone} 16%, transparent)` }}><Emoji char={c.emoji} /></span>
                  <span className={styles.contactText}><b>{c.name}</b><small>{c.pages.length} pages · {count} items{c.vault.length ? ` · ${c.vault.length} in Vault` : ""}</small></span>
                  <span className={`${styles.pickCircle} ${on ? styles.pickOn : ""}`}>{on && <IconCheck size={12} />}</span>
                </button>
              );
            })}
            <button className={styles.actionRow} onClick={() => close(() => ctx.openSheet(<NewCollectionSheet ctx={ctx} />))}>
              <span className={styles.actionIcon}><IconPlus size={18} /></span>
              <span className={styles.contactText}><b>New collection</b><small>A language, a client, a room…</small></span>
              <IconChevron size={16} />
            </button>
          </div>
          {ctx.col && <CollectionSettings ctx={ctx} colId={ctx.col.id} onDeleted={() => close()} />}
        </>
      )}
    </Sheet>
  );
}

function CollectionSettings({ ctx, colId, onDeleted }: { ctx: Ctx; colId: string; onDeleted: () => void }) {
  const { mind, update } = useMind(ctx.me);
  const live = mind?.collections.find((c) => c.id === colId);
  if (!live) return null;
  const set = (patch: Partial<Collection>) => update((m) => patchCollection(m, colId, (c) => ({ ...c, ...patch })));
  return (
    <>
      <p className={styles.sheetLabel}>This collection</p>
      <input className={styles.plainInput} value={live.name} onChange={(e) => set({ name: e.target.value })} aria-label="Collection name" />
      <input className={styles.plainInput} placeholder="A short line, e.g. A2 → B1 by March" value={live.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value })} />
      <div className={styles.mindSwatches}>
        {Object.values(TONES).map((c) => <button key={c} style={{ background: c }} className={live.tone === c ? styles.mindPickOn : undefined} onClick={() => set({ tone: c })} aria-label={`Colour ${c}`} />)}
      </div>
      <button
        className={styles.mindDanger}
        onClick={() => {
          update((m) => {
            const ids = collectionItems(m, live).map((b) => b.id);
            const blocks = { ...m.blocks };
            ids.forEach((id) => delete blocks[id]);
            const collections = m.collections.filter((c) => c.id !== colId);
            return { ...m, blocks, collections, current: collections[0]?.id ?? null };
          });
          onDeleted();
          ctx.flash(`${live.name} deleted`);
        }}
      >
        Delete {live.name}
      </button>
    </>
  );
}

/* ===========================================================================
   Item, page and move sheets
   =========================================================================== */

function BlockSheet({ ctx, id }: { ctx: Ctx; id: string }) {
  const { mind, update } = useMind(ctx.me);
  const [newTag, setNewTag] = useState("");
  const b = mind?.blocks[id];
  if (!mind || !b) return null;
  const at = locate(mind, id);
  const tags = at ? tagsOf(collectionItems(mind, at.collection)) : [];
  const set = (patch: Partial<Block>) => update((m) => patchBlock(m, id, patch));

  return (
    <Sheet title={KIND_LABEL[b.kind]} onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <div className={styles.mindDetail}><BlockView block={b} shape="detail" onToggle={() => toggleItem(update, b)} /></div>
          {b.kind === "book" && <Segmented value={b.shelf ?? "want"} options={[{ id: "want", label: "Want" }, { id: "reading", label: "Reading" }, { id: "read", label: "Finished" }]} onChange={(v) => set({ shelf: v })} />}
          {b.kind === "todo" && b.status && <Segmented value={b.status} options={COLUMNS} onChange={(v) => set({ status: v, done: v === "done" })} />}
          {b.kind === "flashcard" && <Segmented value={b.due ? "due" : "known"} options={[{ id: "due", label: "Still learning" }, { id: "known", label: "I know it" }]} onChange={(v) => set({ due: v === "due" })} />}
          {b.kind === "amount" && <Segmented value={b.paid ? "paid" : "unpaid"} options={[{ id: "unpaid", label: "Unpaid" }, { id: "paid", label: "Paid" }]} onChange={(v) => set({ paid: v === "paid" })} />}
          {b.kind === "progress" && (
            <div className={styles.mindStepper}>
              <button onClick={() => set({ value: Math.max(0, (b.value ?? 0) - 1) })} aria-label="Back one">−</button>
              <span>{b.value} of {b.total}</span>
              <button onClick={() => set({ value: Math.min(b.total ?? 1, (b.value ?? 0) + 1) })} aria-label="Forward one">+</button>
            </div>
          )}
          {b.ref && <button className={styles.secondaryWide} onClick={() => close(() => ctx.openChat(b.ref!.chatId))}>Open in chat</button>}
          {b.url && <a className={styles.secondaryWide} href={b.url} target="_blank" rel="noopener noreferrer">Open {b.source}</a>}

          <p className={styles.sheetLabel}>Your note</p>
          <textarea className={`${styles.plainInput} ${styles.mindNote}`} placeholder="Why did you keep this?" value={b.note ?? ""} onChange={(e) => set({ note: e.target.value })} rows={2} />

          <p className={styles.sheetLabel}>Tags</p>
          <div className={styles.chipGrid}>
            {[...new Set([...b.tags, ...tags])].slice(0, 12).map((t) => (
              <button key={t} className={`${styles.choice} ${b.tags.includes(t) ? styles.choiceOn : ""}`} onClick={() => set({ tags: b.tags.includes(t) ? b.tags.filter((x) => x !== t) : [...b.tags, t] })}>#{t}</button>
            ))}
            <input
              className={styles.mindTagInput}
              placeholder="+ New tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value.replace(/\s+/g, "-").toLowerCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) { set({ tags: [...new Set([...b.tags, newTag.trim().replace(/^#/, "")])] }); setNewTag(""); }
              }}
            />
          </div>

          <p className={styles.sheetLabel}>Lives in</p>
          <button className={styles.mindLocation} onClick={() => close(() => ctx.openSheet(<MoveSheet me={ctx.me} id={id} onClose={ctx.closeSheet} onMoved={ctx.flash} />))}>
            <span>{emojify(at ? `${at.collection.emoji} ${at.collection.name} › ${at.page ? `${at.page.title}${at.section?.title ? ` › ${at.section.title}` : ""}` : "Vault"}` : "Nowhere")}</span>
            <em>Move</em>
          </button>
          <button className={styles.mindDanger} onClick={() => close(() => { update((m) => removeBlock(m, id)); ctx.flash("Removed from Mind"); })}>Remove from Mind</button>
        </>
      )}
    </Sheet>
  );
}

function WhereRow({ depth, emoji, title, count, on, onPick }: { depth: number; emoji: string; title: string; count: number; on: boolean; onPick: () => void }) {
  return (
    <button className={styles.actionRow} style={{ paddingLeft: 14 + depth * 22 }} onClick={onPick}>
      <span className={styles.mindEmoji}><Emoji char={emoji} /></span>
      <span className={styles.contactText}><b>{title}</b><small>{count} items</small></span>
      <span className={`${styles.pickCircle} ${on ? styles.pickOn : ""}`}>{on && <IconCheck size={12} />}</span>
    </button>
  );
}

/**
 * Where should this go? Sorts the Vault, moves items, and backs the chat's
 * "Edit location" after Save to Mind. Picking a different collection for a
 * chat item teaches Mind where that chat's saves belong.
 */
export function MoveSheet({ me, id, onClose, onMoved, title = "Move to" }: { me: string; id: string; onClose: () => void; onMoved?: (text: string) => void; title?: string }) {
  const { mind, update } = useMind(me);
  const current = mind ? locate(mind, id) : null;
  const [colId, setColId] = useState(current?.collection.id ?? mind?.current ?? "");
  if (!mind) return null;
  const col = mind.collections.find((c) => c.id === colId) ?? mind.collections[0];
  const b = mind.blocks[id];
  if (!col || !b) return null;

  const roots = col.pages.filter((p) => !p.parentId);
  const rows = (p: Page, depth: number, close: (after?: () => void) => void): React.ReactNode[] => [
    ...p.sections.map((s) => {
      const label = p.sections.length > 1 && s.title ? `${p.title} › ${s.title}` : p.title;
      return (
        <WhereRow
          key={s.id}
          depth={depth}
          emoji={p.emoji}
          title={label}
          count={s.blockIds.length}
          on={current?.section?.id === s.id}
          onPick={() => close(() => move(p.id, s.id, label))}
        />
      );
    }),
    ...childrenOf(col, p.id).flatMap((k) => rows(k, depth + 1, close)),
  ];
  const move = (pageId: string | null, sectionId: string | null, label: string) => {
    update((m) => {
      let next = place(m, id, { collectionId: col.id, pageId, sectionId });
      if (b.ref && current?.collection.id !== col.id) next = learnChat(next, col.id, b.ref.chatId);
      return next;
    });
    onMoved?.(`Moved to ${col.emoji} ${col.name} › ${label}`);
  };

  return (
    <Sheet title={title} onClose={onClose}>
      {(close) => (
        <>
          <div className={styles.mindDetail}><BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} /></div>
          {mind.collections.length > 1 && (
            <div className={styles.chipGrid}>
              {mind.collections.map((c) => (
                <button key={c.id} className={`${styles.choice} ${c.id === col.id ? styles.choiceOn : ""}`} onClick={() => setColId(c.id)}><Emoji char={c.emoji} /> {c.name}</button>
              ))}
            </div>
          )}
          <div className={styles.listGroup}>
            <WhereRow depth={0} emoji="🗄️" title="Vault" count={col.vault.length} on={!!current && current.collection.id === col.id && !current.page} onPick={() => close(() => move(null, null, "Vault"))} />
            {roots.flatMap((p) => rows(p, 0, close))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function PageSheet({ ctx, col, pageId, onDeleted }: { ctx: Ctx; col: Collection; pageId: string; onDeleted: () => void }) {
  const { mind, update } = useMind(ctx.me);
  const page = mind?.collections.find((c) => c.id === col.id)?.pages.find((p) => p.id === pageId);
  if (!mind || !page) return null;
  const set = (fn: (p: Page) => Page) => update((m) => patchPage(m, pageId, fn));
  const moveSection = (i: number, dir: -1 | 1) => set((p) => {
    const list = [...p.sections];
    const j = i + dir;
    if (j < 0 || j >= list.length) return p;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...p, sections: list };
  });

  return (
    <Sheet title="Customise page" onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} value={page.title} onChange={(e) => set((p) => ({ ...p, title: e.target.value }))} aria-label="Page name" />
          <div className={styles.mindField}><span>Pin to home</span><Toggle on={!!page.pinned} onChange={(v) => set((p) => ({ ...p, pinned: v }))} label="Pin to home" /></div>
          <p className={styles.sheetLabel}>Icon</p>
          <div className={styles.mindEmojiGrid}>
            {PAGE_EMOJIS.map((e) => <button key={e} className={page.emoji === e ? styles.mindPickOn : undefined} onClick={() => set((p) => ({ ...p, emoji: e }))}><Emoji char={e} /></button>)}
          </div>
          <p className={styles.sheetLabel}>Colour</p>
          <div className={styles.mindSwatches}>
            {Object.values(TONES).map((c) => <button key={c} style={{ background: c }} className={page.tone === c ? styles.mindPickOn : undefined} onClick={() => set((p) => ({ ...p, tone: c }))} aria-label={`Colour ${c}`} />)}
          </div>
          <p className={styles.sheetLabel}>Views</p>
          <div className={styles.chipGrid}>
            {(Object.keys(VIEW_META) as MindView[]).map((v) => {
              const on = page.views.includes(v);
              return (
                <button key={v} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} onClick={() => set((p) => {
                  const views = on ? p.views.filter((x) => x !== v) : [...p.views, v];
                  return views.length ? { ...p, views, view: views.includes(p.view) ? p.view : views[0] } : p;
                })}>{VIEW_META[v].label}</button>
              );
            })}
          </div>
          <p className={styles.sheetLabel}>The quick-add field makes</p>
          <div className={styles.chipGrid}>
            {PAGE_KINDS.map((k) => <button key={k} className={`${styles.choice} ${page.defaultKind === k ? styles.choiceOn : ""}`} onClick={() => set((p) => ({ ...p, defaultKind: k }))}>{KIND_LABEL[k]}</button>)}
          </div>
          {page.sections.length > 1 && (
            <>
              <p className={styles.sheetLabel}>Sections</p>
              <div className={styles.listGroup}>
                {page.sections.map((s, i) => (
                  <div key={s.id} className={styles.actionRow}>
                    <span className={styles.mindEmoji}><Emoji char={s.emoji || "📁"} /></span>
                    <span className={styles.contactText}><b>{s.title || "Untitled"}</b><small>{s.blockIds.length} items</small></span>
                    <span className={styles.mindReorder}>
                      <button onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button onClick={() => moveSection(i, 1)} disabled={i === page.sections.length - 1} aria-label="Move down">↓</button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          <button
            className={styles.mindDanger}
            onClick={() => close(() => {
              update((m) => {
                const c = m.collections.find((x) => x.id === col.id)!;
                const doomed = [pageId, ...c.pages.filter((p) => p.parentId === pageId).map((p) => p.id)];
                const ids = c.pages.filter((p) => doomed.includes(p.id)).flatMap((p) => pageItems(m, p).map((b) => b.id));
                let next = m;
                ids.forEach((bid) => { next = detach(next, bid); });
                return patchCollection(next, col.id, (x) => ({ ...x, pages: x.pages.filter((p) => !doomed.includes(p.id)), vault: [...ids, ...x.vault] }));
              });
              onDeleted();
              ctx.flash("Page deleted · its items went to the Vault");
            })}
          >
            Delete page
          </button>
        </>
      )}
    </Sheet>
  );
}

/** Flashcard review: flip, then say how it went. Finishing counts as practice. */
function ReviewSheet({ ctx, col, pageId }: { ctx: Ctx; col: Collection; pageId?: string }) {
  const { mind, update } = useMind(ctx.me);
  const initial = useMemo(() => {
    if (!mind) return [];
    const c = mind.collections.find((x) => x.id === col.id)!;
    const pool = pageId ? pageItems(mind, c.pages.find((p) => p.id === pageId)!) : collectionItems(mind, c);
    return pool.filter((b) => b.kind === "flashcard" && b.due).map((b) => b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [queue, setQueue] = useState(initial);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const finished = queue.length === 0;
  const counted = useRef(false);
  useEffect(() => {
    if (finished && initial.length && !counted.current) {
      counted.current = true;
      update((m) => logPractice(m, col.id));
    }
  }, [finished, initial.length, update, col.id]);
  if (!mind) return null;
  const card = mind.blocks[queue[0]];
  const liveCol = mind.collections.find((x) => x.id === col.id);
  const streak = liveCol ? streakOf(liveCol.activity) : 0;

  const answer = (gotIt: boolean) => {
    const id = queue[0];
    if (gotIt) {
      update((m) => patchBlock(m, id, { due: false }));
      setKnown((k) => k + 1);
      setQueue((q) => q.slice(1));
    } else {
      setQueue((q) => [...q.slice(1), id]);
    }
    setFlipped(false);
  };

  return (
    <Sheet title="Review" onClose={ctx.closeSheet}>
      {finished ? (
        <div className={styles.mindReviewDone}>
          <span><Emoji char="🎉" /></span>
          <h3>All caught up</h3>
          <p>{known} cards learned · <Emoji char="🔥" /> {streak}-day streak</p>
        </div>
      ) : card && (
        <>
          <p className={styles.mindReviewCount}>{Math.min(known + 1, initial.length)} of {initial.length}</p>
          <button className={`${styles.mindReviewCard} ${flipped ? styles.mbFlipped : ""}`} onClick={() => setFlipped((f) => !f)}>
            <span className={styles.mbCardInner}>
              <span className={styles.mbFace}><b>{card.title}</b><small>Tap to flip</small></span>
              <span className={`${styles.mbFace} ${styles.mbBack}`}><b>{card.back}</b></span>
            </span>
          </button>
          <div className={styles.mindReviewActions}>
            <button className={styles.secondaryWide} onClick={() => answer(false)}>Again</button>
            <button className={styles.primaryWide} onClick={() => answer(true)} disabled={!flipped}>Got it</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
