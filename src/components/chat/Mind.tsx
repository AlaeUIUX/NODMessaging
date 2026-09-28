"use client";

import { useEffect, useRef, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { Emoji, emojify, firstEmoji } from "@/lib/chat/emoji";
import { toAttachment } from "@/lib/chat/media";
import {
  blankPage, childrenOf, collectionItems, detach, learnChat, locate, makeCollection, newId, nowMs, pageItems, patchBlock,
  patchCollection, patchPage, place, removeBlock, tagsOf, todayKey, useMind,
  type Block, type BlockKind, type Collection, type Mind, type MindView, type Page, type TaskStatus,
} from "@/lib/chat/mind";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import {
  IconArrowUp, IconBack, IconBoard, IconCheck, IconChevron, IconChevronDown, IconClose, IconGrid, IconListView,
  IconFolder, IconMore, IconOpen, IconPlus, IconShelf, IconSmile, IconTrash,
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





type ToastAction = { label: string; run: () => void };

interface Ctx {
  mind: Mind;
  /** The collection that's open, if any. */
  col: Collection | null;
  update: (fn: (m: Mind) => Mind) => void;
  me: string;
  flash: (t: string, actions?: ToastAction[]) => void;
  openFolder: (id: string) => void;
  openPage: (id: string) => void;
  openSheet: (n: React.ReactNode) => void;
  closeSheet: () => void;
  openChat: (chatId: string) => void;
}

export default function MindTab({ onOpenChat }: { onOpenChat: (chat: Chat) => void }) {
  const { me, state } = useChat();
  const { mind, update } = useMind(me);
  const meUser = userById(me);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<{ id: string; leaving: boolean } | null>(null);
  const [page, setPage] = useState<{ id: string; leaving: boolean } | null>(null);
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; actions?: ToastAction[] } | null>(null);

  // Switching person (Developer → Signed in as) starts from their Mind.
  const [seenMe, setSeenMe] = useState(me);
  if (seenMe !== me) {
    setSeenMe(me);
    setFolder(null);
    setPage(null);
    setSheet(null);
    setQuery("");
  }

  if (!mind) return <div className={styles.inboxBody} />;
  const col = folder ? mind.collections.find((c) => c.id === folder.id) ?? null : null;

  const ctx: Ctx = {
    mind, col, update, me,
    flash: (text, actions) => {
      const id = nowMs();
      setToast({ text, id, actions });
      // A toast with actions (Undo) waits longer, so there's time to tap them.
      const stay = actions ? 4200 : 1800;
      setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), stay);
      setTimeout(() => setToast((t) => (t?.id === id ? null : t)), stay + 220);
    },
    openFolder: (id) => {
      update((m) => ({ ...m, current: id }));
      setPage(null);
      setFolder({ id, leaving: false });
    },
    openPage: (id) => setPage({ id, leaving: false }),
    openSheet: setSheet,
    closeSheet: () => setSheet(null),
    openChat: (chatId) => {
      const chat = state.data.chats.find((c) => c.id === chatId);
      if (chat) onOpenChat(chat);
    },
  };
  const leave = (set: typeof setFolder) => {
    set((x) => (x ? { ...x, leaving: true } : x));
    // Only clear what's still leaving: something opened meanwhile stays open.
    setTimeout(() => set((x) => (x?.leaving ? null : x)), 220);
  };
  const dismissToast = () => {
    setToast((t) => (t ? { ...t, leaving: true } : t));
    setTimeout(() => setToast((t) => (t?.leaving ? null : t)), 220);
  };

  const itemCount = Object.keys(mind.blocks).length;
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
            <div className={styles.profileText}>
              <b>{me === "me" ? "Your Mind" : `${meUser.name}'s Mind`}</b>
              <span>{mind.collections.length ? `${mind.collections.length} collection${mind.collections.length === 1 ? "" : "s"} · ${itemCount} items` : "Empty for now"}</span>
            </div>
          </div>
          <button className={styles.plusBtn} aria-label="New collection" onClick={() => setSheet(<NewFolderSheet ctx={ctx} />)}>
            <IconPlus size={16} />
          </button>
        </div>
        {mind.collections.length > 0 && (
          <label className={styles.searchBar}>
            <span className={styles.maskIcon} style={{ width: 16, height: 16, ["--src" as string]: "url(/nod/search.svg)" }} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your Mind..." />
            {query && <button className={styles.mindClear} onClick={() => setQuery("")} aria-label="Clear search"><IconClose size={14} /></button>}
          </label>
        )}
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll} key={me}>
          {q ? <SearchResults ctx={ctx} q={q} />
            : mind.collections.length ? <FolderGrid ctx={ctx} />
            : <EmptyMind ctx={ctx} />}
        </div>
      </div>

      {folder && col && <FolderScreen ctx={ctx} col={col} leaving={folder.leaving} onBack={() => leave(setFolder)} />}
      {page && col?.pages.some((p) => p.id === page.id) && (
        <PageScreen ctx={ctx} col={col} pageId={page.id} leaving={page.leaving} onBack={() => leave(setPage)} onOpen={(id) => setPage({ id, leaving: false })} />
      )}
      {sheet}
      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${styles.mindToast} ${toast.actions ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
          <span className={styles.toastText}>{emojify(toast.text)}</span>
          {toast.actions?.map((a) => (
            <button key={a.label} className={styles.toastBtn} onClick={() => { dismissToast(); a.run(); }}>{a.label}</button>
          ))}
        </div>
      )}
    </>
  );
}

/* ===========================================================================
   Collections, shown as folders
   =========================================================================== */

function FolderGrid({ ctx }: { ctx: Ctx }) {
  return (
    <div className={styles.mindStack}>
      <div className={styles.mindSectionBar}>
        <p className={styles.sheetLabel}>Collections</p>
        <button className={styles.mindIconBtn} onClick={() => ctx.openSheet(<NewFolderSheet ctx={ctx} />)} aria-label="New collection" title="New collection"><IconPlus size={16} /></button>
      </div>
      <div className={styles.folderGrid}>
        {ctx.mind.collections.map((c, i) => <FolderCard key={c.id} ctx={ctx} col={c} i={i} />)}
        <button className={styles.folderNew} onClick={() => ctx.openSheet(<NewFolderSheet ctx={ctx} />)}>
          <IconPlus size={18} />
          <span>New collection</span>
        </button>
      </div>
    </div>
  );
}

function FolderCard({ ctx, col, i }: { ctx: Ctx; col: Collection; i: number }) {
  const items = collectionItems(ctx.mind, col);
  const peek = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  return (
    <button className={`${styles.folderCard} ${styles.rowEnter}`} style={{ ["--tone" as string]: col.tone, ["--i" as string]: i }} onClick={() => ctx.openFolder(col.id)}>
      <span className={styles.folderTop}>
        <span className={styles.folderIcon}><Emoji char={col.emoji} /></span>
        {col.vault.length > 0 && <em className={styles.folderBadge}>{col.vault.length} to sort</em>}
      </span>
      <span className={styles.folderText}>
        <b>{col.name}</b>
        <small>{col.pages.length} page{col.pages.length === 1 ? "" : "s"} · {items.length} item{items.length === 1 ? "" : "s"}</small>
      </span>
      <span className={styles.folderPeek} aria-hidden="true">
        {peek.map((b) => (b.kind === "image" && b.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={b.id} src={b.image} alt="" />
          : <span key={b.id}><Emoji char={KIND_EMOJI[b.kind] ?? "💬"} /></span>))}
      </span>
    </button>
  );
}

function EmptyMind({ ctx }: { ctx: Ctx }) {
  return (
    <div className={styles.mindStack}>
      <div className={styles.mindStarter}>
        <Logo size={36} />
        <h2>Your Mind is empty</h2>
        <p>Make a collection for anything: a project, a trip, a room. Then fill it with pages, checklists, links and saves from your chats.</p>
        <button className={styles.mindPrimary} onClick={() => ctx.openSheet(<NewFolderSheet ctx={ctx} />)}>
          <IconPlus size={14} /> New collection
        </button>
      </div>
    </div>
  );
}

/** Inside a collection: its pages (and sub-pages), and its Vault. */
function FolderScreen({ ctx, col, leaving, onBack }: { ctx: Ctx; col: Collection; leaving: boolean; onBack: () => void }) {
  const [tab, setTab] = useState<"pages" | "vault">("pages");
  const roots = col.pages.filter((p) => !p.parentId);
  const count = collectionItems(ctx.mind, col).length;
  return (
    <div className={`${styles.screen} ${styles.chatScreen} ${styles.mindPageScreen} ${styles.mindFolderScreen} ${leaving ? styles.leaving : ""}`} style={{ ["--tone" as string]: col.tone }}>
      <div className={styles.edgeTop} />
      <header className={styles.chatHeader}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label="Back to Mind"><IconBack /></button>
        <div className={styles.titleCapsule}>
          <span className={styles.mindPageBadge}><Emoji char={col.emoji} /></span>
          <div className={`${styles.tcName} ${styles.glass}`}><span>{col.name}</span></div>
          <span className={styles.tcPresence}>{col.pages.length} pages · {count} items</span>
        </div>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => ctx.openSheet(<FolderSheet ctx={ctx} colId={col.id} onDeleted={onBack} />)} aria-label="Collection settings"><IconMore /></button>
      </header>

      <div className={styles.mindPageScroll}>
        <div className={styles.chips} role="tablist">
          <button role="tab" aria-selected={tab === "pages"} className={`${styles.chip} ${tab === "pages" ? styles.chipOn : ""}`} onClick={() => setTab("pages")}>Pages</button>
          <button role="tab" aria-selected={tab === "vault"} className={`${styles.chip} ${tab === "vault" ? styles.chipOn : ""}`} onClick={() => setTab("vault")}>
            Vault{col.vault.length > 0 && <span className={styles.chipBadge}>{col.vault.length}</span>}
          </button>
        </div>

        {tab === "pages" ? (
          <>
            <div className={styles.mindSectionBar}>
              <p className={styles.sheetLabel}>Pages</p>
              <button className={styles.mindIconBtn} onClick={() => ctx.openSheet(<FolderAddSheet ctx={ctx} col={col} />)} aria-label={`Add to ${col.name}`} title="Add"><IconPlus size={16} /></button>
            </div>
            <div className={styles.mindRows}>
              {roots.map((p, i) => <PageTree key={p.id} ctx={ctx} col={col} page={p} i={i} />)}
              {!roots.length && (
                <button className={styles.mindEmptySection} onClick={() => ctx.openSheet(<NewPageSheet ctx={ctx} col={col} />)}>
                  <IconPlus size={14} /> Make the first page
                </button>
              )}
            </div>
          </>
        ) : <VaultView ctx={ctx} col={col} />}
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
          <span className={styles.mindPageSide}><IconChevron size={14} /></span>
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

function VaultView({ ctx, col }: { ctx: Ctx; col: Collection }) {
  const items = col.vault.map((id) => ctx.mind.blocks[id]).filter(Boolean);
  return (
    <div className={styles.mindStack}>
      <p className={styles.mindHint}>Saves from chats land here first. Sort them into a page when you have a minute.</p>
      {items.length === 0 ? (
        <p className={styles.emptyInbox}>All sorted. Hold any message in a chat and choose Save to Mind.</p>
      ) : (
        <div className={styles.mindRows}>
          {items.map((b) => (
            <div key={b.id} className={styles.mindInboxItem}>
              <SwipeItem actions={itemActions(ctx, b)}>
                <Tile onOpen={() => ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />)}>
                  <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} onToggle={() => toggleItem(ctx.update, b)} />
                </Tile>
              </SwipeItem>
              <button className={styles.mindSort} onClick={() => ctx.openSheet(<MoveSheet me={ctx.me} id={b.id} onClose={ctx.closeSheet} onMoved={ctx.flash} title="Sort into" />)}>Sort</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResults({ ctx, q }: { ctx: Ctx; q: string }) {
  const pages = ctx.mind.collections.flatMap((c) => c.pages.filter((p) => p.title.toLowerCase().includes(q)).map((p) => ({ c, p })));
  const folders = ctx.mind.collections.filter((c) => c.name.toLowerCase().includes(q));
  const blocks = Object.values(ctx.mind.blocks).filter((b) =>
    [b.title, b.body, b.source, b.back, b.note, ...b.tags].some((s) => s?.toLowerCase().includes(q)));
  const nothing = !pages.length && !folders.length && !blocks.length;
  return (
    <div className={styles.mindStack}>
      {folders.length > 0 && <div className={styles.folderGrid}>{folders.map((c, i) => <FolderCard key={c.id} ctx={ctx} col={c} i={i} />)}</div>}
      {pages.length > 0 && (
        <div className={styles.mindRows}>
          {pages.map(({ c, p }) => (
            <button key={p.id} className={styles.mindPageRow} onClick={() => { ctx.openFolder(c.id); ctx.openPage(p.id); }}>
              <span className={styles.mindEmoji}><Emoji char={p.emoji} /></span>
              <span className={styles.mindPageText}><b>{p.title}</b><small>{emojify(`${c.emoji} ${c.name}`)}</small></span>
              <span className={styles.mindPageSide}><IconChevron size={14} /></span>
            </button>
          ))}
        </div>
      )}
      {blocks.length > 0 && (
        <div className={styles.mindRows}>
          {blocks.map((b) => {
            const at = locate(ctx.mind, b.id);
            return (
              <Tile key={b.id} onOpen={() => ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />)}>
                <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} onToggle={() => toggleItem(ctx.update, b)} />
                <span className={styles.mindWhere}>{emojify(at ? `${at.collection.emoji} ${at.collection.name} › ${at.page ? at.page.title : "Vault"}` : "")}</span>
              </Tile>
            );
          })}
        </div>
      )}
      {nothing && <p className={styles.emptyInbox}>Nothing in your Mind matches “{q}”.</p>}
    </div>
  );
}

/** A tappable item. Not a <button>: items hold their own controls (a checkbox, a download link). */
function Tile({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.mindTileBtn}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onOpen();
      }}
    >
      {children}
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
    update((m) => patchBlock(m, b.id, { days: has ? (b.days ?? []).filter((d) => d !== today) : [...(b.days ?? []), today] }));
  }
}

/* ===========================================================================
   Collection sheets
   =========================================================================== */

/** + inside a collection: a page, a sub-page, or anything straight into the Vault. */
function FolderAddSheet({ ctx, col }: { ctx: Ctx; col: Collection }) {
  return (
    <Sheet title={`Add to ${col.name}`} onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <p className={styles.sheetLabel}>Structure</p>
          <div className={`${styles.mindStructure} ${styles.mindStructureTwo}`}>
            <button onClick={() => close(() => ctx.openSheet(<NewPageSheet ctx={ctx} col={col} />))}><Emoji char="📄" /><b>Page</b><small>One topic</small></button>
            <button onClick={() => close(() => ctx.openSheet(<NewPageSheet ctx={ctx} col={col} sub />))} disabled={!col.pages.length}><Emoji char="📑" /><b>Sub-page</b><small>Inside a page</small></button>
          </div>
          <p className={styles.sheetLabel}>Or drop something in the Vault</p>
          <KindGrid onPick={(k) => close(() => ctx.openSheet(<AddItemSheet ctx={ctx} to={{ collectionId: col.id }} kind={k} />))} />
        </>
      )}
    </Sheet>
  );
}

const FOLDER_EMOJIS = ["📁", "💼", "🚀", "🏡", "✈️", "📚", "🎓", "💡", "🎨", "🌿", "🍳", "🏃", "🎸", "🛒", "💶", "🌐", "📱", "🇩🇪"];

function NewFolderSheet({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [tone, setTone] = useState<string>(TONES.denim);
  const create = () => {
    const c = makeCollection(name, emoji, tone);
    ctx.update((m) => ({ ...m, collections: [...m.collections, c], current: c.id }));
    ctx.closeSheet();
    ctx.openFolder(c.id);
  };
  return (
    <Sheet title="New collection" onClose={ctx.closeSheet} action={{ label: "Create", disabled: !name.trim(), onClick: create }}>
      <input
        className={`${styles.plainInput} ${styles.mindTitleInput}`}
        data-autofocus
        placeholder="e.g. Trip to Lisbon"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }}
        aria-label="Collection name"
      />
      <p className={styles.sheetLabel}>Icon</p>
      <EmojiPicker value={emoji} options={FOLDER_EMOJIS} onPick={setEmoji} />
      <p className={styles.sheetLabel}>Colour</p>
      <div className={styles.mindSwatches}>
        {Object.values(TONES).map((c) => <button key={c} style={{ background: c }} className={tone === c ? styles.mindPickOn : undefined} onClick={() => setTone(c)} aria-label={`Colour ${c}`} />)}
      </div>
    </Sheet>
  );
}

function FolderSheet({ ctx, colId, onDeleted }: { ctx: Ctx; colId: string; onDeleted: () => void }) {
  const { mind, update } = useMind(ctx.me);
  const col = mind?.collections.find((c) => c.id === colId);
  if (!col) return null;
  const set = (patch: Partial<Collection>) => update((m) => patchCollection(m, colId, (c) => ({ ...c, ...patch })));
  return (
    <Sheet title="Collection" onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} value={col.name} onChange={(e) => set({ name: e.target.value })} aria-label="Collection name" />
          <p className={styles.sheetLabel}>Icon</p>
          <EmojiPicker value={col.emoji} options={FOLDER_EMOJIS} onPick={(e) => set({ emoji: e })} />
          <p className={styles.sheetLabel}>Colour</p>
          <div className={styles.mindSwatches}>
            {Object.values(TONES).map((c) => <button key={c} style={{ background: c }} className={col.tone === c ? styles.mindPickOn : undefined} onClick={() => set({ tone: c })} aria-label={`Colour ${c}`} />)}
          </div>
          <button
            className={styles.mindDanger}
            onClick={() => close(() => {
              // Keep what's deleted, so Undo can put it all back where it was.
              let back: ((m: Mind) => Mind) | null = null;
              update((m) => {
                const at = m.collections.findIndex((c) => c.id === colId);
                const gone = m.collections[at];
                if (!gone) return m;
                const ids = collectionItems(m, gone).map((b) => b.id);
                const kept = Object.fromEntries(ids.map((id) => [id, m.blocks[id]]));
                const wasCurrent = m.current === colId;
                back = (n) => (n.collections.some((c) => c.id === colId) ? n : {
                  ...n,
                  blocks: { ...n.blocks, ...kept },
                  collections: [...n.collections.slice(0, at), gone, ...n.collections.slice(at)],
                  current: wasCurrent ? colId : n.current,
                });
                const blocks = { ...m.blocks };
                ids.forEach((id) => delete blocks[id]);
                const collections = m.collections.filter((c) => c.id !== colId);
                return { ...m, blocks, collections, current: collections[0]?.id ?? null };
              });
              onDeleted();
              const undo = back as ((m: Mind) => Mind) | null;
              ctx.flash(`${col.name} deleted`, undo ? [{ label: "Undo", run: () => { update(undo); ctx.openFolder(colId); } }] : undefined);
            })}
          >
            Delete {col.name}
          </button>
        </>
      )}
    </Sheet>
  );
}


/* ===========================================================================
   Shared pieces: the icon picker, and swipe-to-reveal actions on items
   =========================================================================== */

/**
 * A grid of suggested icons, plus one tile that takes any emoji: tapping it
 * focuses a hidden field, so a phone brings up its keyboard (and its emoji
 * keyboard). On a computer it just waits for an emoji to be typed.
 */
function EmojiPicker({ value, options, onPick }: { value: string; options: string[]; onPick: (e: string) => void }) {
  const custom = !options.includes(value) ? value : null;
  return (
    <div className={styles.mindEmojiGrid}>
      {options.map((e) => <button key={e} className={value === e ? styles.mindPickOn : undefined} onClick={() => onPick(e)} aria-label={`Icon ${e}`}><Emoji char={e} /></button>)}
      <label className={`${styles.mindEmojiCustom} ${custom ? styles.mindPickOn : ""}`} title="Any emoji">
        {custom ? <Emoji char={custom} /> : <IconSmile size={20} />}
        <input
          value=""
          onChange={(e) => {
            const picked = firstEmoji(e.target.value);
            if (picked) onPick(picked);
          }}
          aria-label="Type any emoji"
          autoComplete="off"
          enterKeyHint="done"
        />
      </label>
    </div>
  );
}

type SwipeAction = { id: string; label: string; icon: React.ReactNode; tone: "ink" | "accent" | "danger"; run: () => void };

/** What a swipe on an item offers: open its source, move it, or remove it. */
function itemActions(ctx: Ctx, b: Block): SwipeAction[] {
  const list: SwipeAction[] = [];
  if (b.ref) list.push({ id: "open", label: "Chat", icon: <IconOpen size={18} />, tone: "ink", run: () => ctx.openChat(b.ref!.chatId) });
  else if (b.url) list.push({ id: "open", label: "Open", icon: <IconOpen size={18} />, tone: "ink", run: () => window.open(b.url, "_blank", "noopener") });
  list.push({ id: "move", label: "Move", icon: <IconFolder size={18} />, tone: "accent", run: () => ctx.openSheet(<MoveSheet me={ctx.me} id={b.id} onClose={ctx.closeSheet} onMoved={ctx.flash} />) });
  list.push({ id: "remove", label: "Remove", icon: <IconTrash size={18} />, tone: "danger", run: () => removeItem(ctx.update, ctx.flash, b.id) });
  return list;
}

/** Remove an item, with an Undo that puts it back exactly where it was. */
function removeItem(update: Ctx["update"], flash: Ctx["flash"], id: string) {
  let back: ((m: Mind) => Mind) | null = null;
  update((m) => {
    const b = m.blocks[id];
    const at = locate(m, id);
    if (b) back = (n) => {
      if (n.blocks[id]) return n;
      const next = { ...n, blocks: { ...n.blocks, [id]: b } };
      const c = at && n.collections.find((x) => x.id === at.collection.id);
      if (!at) return next;
      if (!c) return n;
      if (at.section && at.page) {
        const s = c.pages.find((p) => p.id === at.page!.id)?.sections.find((x) => x.id === at.section!.id);
        // Its page or section went meanwhile: the Vault keeps it instead.
        if (!s) return place(next, id, { collectionId: c.id });
        const beforeId = at.section.blockIds.slice(at.section.blockIds.indexOf(id) + 1).find((x) => s.blockIds.includes(x)) ?? null;
        return place(next, id, { collectionId: c.id, pageId: at.page.id, sectionId: s.id, beforeId });
      }
      const i = at.collection.vault.indexOf(id);
      return patchCollection(next, c.id, (x) => ({ ...x, vault: [...x.vault.slice(0, i), id, ...x.vault.slice(i)] }));
    };
    return removeBlock(m, id);
  });
  const undo = back as ((m: Mind) => Mind) | null;
  flash("Removed from Mind", undo ? [{ label: "Undo", run: () => update(undo) }] : undefined);
}

const SWIPE_EVENT = "nod:mind-swipe";

/**
 * Drag an item to the left, like a chat row, to reveal what you can do with
 * it. One item is open at a time; tapping anywhere else closes it. Holding
 * still (without sliding) still picks the item up to drag it elsewhere.
 */
function SwipeItem({ actions, children }: { actions: SwipeAction[]; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null);
  const swiped = useRef(false);
  const [open, setOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const width = actions.length * 60 + 8;

  const apply = (x: number) => {
    if (bodyRef.current) bodyRef.current.style.transform = x ? `translateX(${x}px)` : "";
    wrapRef.current?.style.setProperty("--reveal", String(Math.min(1, -x / width)));
  };
  const settle = (x: number) => {
    setSettling(true);
    apply(x);
    setOpen(x !== 0);
    if (x !== 0) window.dispatchEvent(new CustomEvent(SWIPE_EVENT, { detail: wrapRef.current }));
    setTimeout(() => setSettling(false), 340);
  };

  // Close when another item opens, or on a tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const other = (e: Event) => { if ((e as CustomEvent).detail !== wrapRef.current) settle(0); };
    const outside = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) settle(0); };
    window.addEventListener(SWIPE_EVENT, other);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener(SWIPE_EVENT, other);
      document.removeEventListener("pointerdown", outside, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={styles.mindSwipe} ref={wrapRef}>
      <div className={styles.mindSwipeActions} aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.id}
            className={`${styles.mindSwipeBtn} ${styles[`mindSwipe_${a.tone}`]}`}
            tabIndex={open ? 0 : -1}
            onClick={(e) => { e.stopPropagation(); settle(0); a.run(); }}
          >
            <span>{a.icon}</span>
            <small>{a.label}</small>
          </button>
        ))}
      </div>
      <div
        ref={bodyRef}
        className={`${styles.mindSwipeBody} ${settling ? styles.mindSwipeSettling : ""}`}
        onPointerDown={(e) => {
          swiped.current = false;
          drag.current = { x: e.clientX, y: e.clientY, base: open ? -width : 0, active: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.active) {
            if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
            if (Math.abs(dx) < 8) return;
            d.active = true;
            swiped.current = true;
            try { bodyRef.current?.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
          }
          // Rubber-band past the actions so it never feels like a wall.
          let x = Math.min(0, d.base + dx);
          if (x < -width) x = -width - (-width - x) * .25;
          apply(x);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.active) return;
          const x = Math.min(0, d.base + (e.clientX - d.x));
          settle(x < -width / 2.5 ? -width : 0);
        }}
        onPointerCancel={() => { if (drag.current?.active) settle(open ? -width : 0); drag.current = null; }}
        onClickCapture={(e) => {
          // A swipe (or a tap on an open item) shouldn't also open the item.
          if (swiped.current || open) {
            e.stopPropagation();
            e.preventDefault();
            if (!swiped.current) settle(0);
            swiped.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
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

  // Items allow vertical panning (pan-y), and React's touch listeners are
  // passive, so once a hold picks an item up a native listener stops the
  // page scrolling under the finger (which would also cancel the drag).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const hold = (e: TouchEvent) => { if (drag.current?.active && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, []);

  const all = pageItems(ctx.mind, page);
  const pageTags = tagsOf(all);
  const visible = (id: string) => { const b = ctx.mind.blocks[id]; return !!b && (!tag || b.tags.includes(tag)); };
  const setView = (view: MindView) => ctx.update((m) => patchPage(m, page.id, (p) => ({ ...p, view })));

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
  /** The browser took the pointer (a scroll, a system gesture): put the item down where it was. */
  const onRootCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (!d.active) return;
    suppressClick.current = false;
    targetRef.current = null;
    setTarget(null);
    setDragging(null);
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
        role="button"
        tabIndex={0}
        onPointerDown={(e) => onBlockDown(e, b.id)}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />);
        }}
        onKeyDown={(e) => {
          // Only the item itself; its own controls (a checkbox, a link) keep their keys.
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {axis === "y" && preferred === "row" ? (
          <SwipeItem actions={itemActions(ctx, b)}>
            <BlockView block={b} shape={shape} onToggle={() => toggleItem(ctx.update, b)} />
          </SwipeItem>
        ) : <BlockView block={b} shape={shape} onToggle={() => toggleItem(ctx.update, b)} />}
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
      onPointerCancel={onRootCancel}
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
      <input className={`${styles.plainInput} ${styles.mindTitleInput}`} data-autofocus placeholder={f1} value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ready) void create(); }} />
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
      <input className={`${styles.plainInput} ${styles.mindTitleInput}`} data-autofocus placeholder={parent ? "e.g. Separable verbs" : "e.g. Vocab"} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) create(); }} />
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
      <EmojiPicker value={emoji} options={PAGE_EMOJIS} onPick={setEmoji} />
    </Sheet>
  );
}

/* ===========================================================================
   Item, page and move sheets
   =========================================================================== */

function BlockSheet({ ctx, id }: { ctx: Ctx; id: string }) {
  const { mind, update } = useMind(ctx.me);
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  // Escape discards the tag: the blur that follows mustn't add it anyway.
  const discard = useRef(false);
  const b = mind?.blocks[id];
  if (!mind || !b) return null;
  const at = locate(mind, id);
  const tags = at ? tagsOf(collectionItems(mind, at.collection)) : [];
  const set = (patch: Partial<Block>) => update((m) => patchBlock(m, id, patch));
  const addTag = () => {
    if (discard.current) return;
    const t = newTag.trim().replace(/^#/, "");
    if (t) set({ tags: [...new Set([...b.tags, t])] });
    setNewTag("");
    setAdding(false);
  };

  // Opening the source is a quiet header action, not a big button.
  const action = b.ref
    ? { label: "Open chat", onClick: () => ctx.openChat(b.ref!.chatId) }
    : b.url ? { label: "Open", href: b.url, onClick: () => {} } : undefined;

  return (
    <Sheet title={KIND_LABEL[b.kind]} onClose={ctx.closeSheet} action={action}>
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

          <p className={styles.sheetLabel}>Your note</p>
          <textarea className={`${styles.plainInput} ${styles.mindNote}`} placeholder="Why did you keep this?" value={b.note ?? ""} onChange={(e) => set({ note: e.target.value })} rows={2} />

          <p className={styles.sheetLabel}>Tags</p>
          <div className={styles.chipGrid}>
            {[...new Set([...b.tags, ...tags])].slice(0, 12).map((t) => (
              <button key={t} className={`${styles.choice} ${b.tags.includes(t) ? styles.choiceOn : ""}`} onClick={() => set({ tags: b.tags.includes(t) ? b.tags.filter((x) => x !== t) : [...b.tags, t] })}>#{t}</button>
            ))}
            {adding ? (
              <input
                className={styles.mindTagInput}
                ref={(el) => el?.focus({ preventScroll: true })}
                placeholder="tag"
                value={newTag}
                size={Math.max(4, newTag.length + 1)}
                onChange={(e) => setNewTag(e.target.value.replace(/\s+/g, "-").toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTag();
                  if (e.key === "Escape") {
                    // Cancel the tag only, not the sheet: the sheet listens for Escape on window.
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    discard.current = true;
                    setNewTag("");
                    setAdding(false);
                  }
                }}
                onBlur={addTag}
                aria-label="New tag"
              />
            ) : (
              <button className={`${styles.choice} ${styles.mindAddTag}`} onClick={() => { discard.current = false; setAdding(true); }}><IconPlus size={14} /> Tag</button>
            )}
          </div>

          <div className={styles.mindSectionBar}>
            <p className={styles.sheetLabel}>Lives in</p>
            <button className={styles.mindPill} onClick={() => close(() => ctx.openSheet(<MoveSheet me={ctx.me} id={id} onClose={ctx.closeSheet} onMoved={ctx.flash} />))}>
              <IconFolder size={14} /> Move
            </button>
          </div>
          {at ? (
            <nav className={styles.mindCrumbs} aria-label="Location">
              <ol>
                <li>
                  <button onClick={() => close(() => ctx.openFolder(at.collection.id))}><Emoji char={at.collection.emoji} /> {at.collection.name}</button>
                </li>
                <li className={styles.mindCrumbSep} aria-hidden="true"><IconChevron size={12} /></li>
                {at.page ? (
                  <>
                    {at.section?.title ? (
                      <>
                        <li><button onClick={() => close(() => { ctx.openFolder(at.collection.id); ctx.openPage(at.page!.id); })}>{at.page.title}</button></li>
                        <li className={styles.mindCrumbSep} aria-hidden="true"><IconChevron size={12} /></li>
                        <li aria-current="location"><span>{at.section.title}</span></li>
                      </>
                    ) : <li aria-current="location"><button onClick={() => close(() => { ctx.openFolder(at.collection.id); ctx.openPage(at.page!.id); })}>{at.page.title}</button></li>}
                  </>
                ) : <li aria-current="location"><span>Vault</span></li>}
              </ol>
            </nav>
          ) : <p className={styles.mindHint}>Not in a collection.</p>}

          <button className={styles.mindDanger} onClick={() => close(() => removeItem(update, ctx.flash, id))}>Remove from Mind</button>
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
          <EmojiPicker value={page.emoji} options={PAGE_EMOJIS} onPick={(e) => set((p) => ({ ...p, emoji: e }))} />
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
                // The page and everything under it, however deep.
                const doomed = [pageId];
                for (let i = 0; i < doomed.length; i++) doomed.push(...childrenOf(c, doomed[i]).map((p) => p.id).filter((id) => !doomed.includes(id)));
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

