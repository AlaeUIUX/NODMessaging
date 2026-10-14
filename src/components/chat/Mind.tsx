"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { initials, TONES } from "@/lib/chat/avatar";
import { Emoji, emojify, firstEmoji } from "@/lib/chat/emoji";
import { findUrl, hostOf, normalizeUrl, parseVideo, splitUrl, videoProvider, videoThumb, watchUrl } from "@/lib/chat/links";
import { findBooks, sameTitle, unfurl, type BookHit, type LinkMeta } from "@/lib/chat/lookup";
import { toAttachment } from "@/lib/chat/media";
import {
  amendBlock, collectionItems, commitDraft, commitShareDraft, draftOf, dropDraft, intoUnassigned, isUnassigned, learnChat, locate, makeCollection, newId, nowMs,
  patchBlock, patchCollection, place, projectCollection, removeBlock, tagsOf, todayKey, UNASSIGNED, useMind,
  type Block, type BlockKind, type Collection, type Mind, type MindView, type TaskStatus,
} from "@/lib/chat/mind";
import { paletteName, randomPalette, swatchesOf, type Swatch } from "@/lib/chat/palette";
import { accessOf, audienceLabel, lookUp, NO_SHARING, type ShareRef } from "@/lib/chat/share";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import { DateField } from "./DatePicker";
import { BookSearch, FilePicker, PasteButton, PasteField, PhotoPicker, VideoPreview } from "./MindFields";
import { ActionMenu, FilterBar, FilterMenu, isFiltering, NO_FILTER, passes, ScopeSearch, ScopeTools, type MindFilter } from "./MindFilter";
import PaletteEditor from "./PaletteEditor";
import { SendSheet, ShareSheet } from "./Share";
import {
  IconArrowRight, IconArrowUp, IconBack, IconCheck, IconChevron, IconClose, IconEdit, IconGrid,
  IconFolder, IconGlobe, IconInbox, IconLink, IconListView, IconMessage, IconOpen, IconPalette, IconPlus, IconShare, IconShelf, IconSmile, IconTrash, IconUserGroup, IconVideo,
} from "./Icons";
import { HoldMenu, useHold, type HoldAction, type HoldBind, type HoldSrc } from "./MindHold";
import Logo from "./Logo";
import { getPermission, PermissionAlert, Segmented, setPermission, Sheet, Toggle } from "./ui";
import styles from "./chat.module.css";
import fieldStyles from "./mindfields.module.css";

/**
 * Mind: collections, each holding everything on one level, built one + (or one
 * line of the quick-add field) at a time. What groups things is their tags, and
 * the filter at the top brings any group back. The same parts as the messaging
 * app: collections push in like chats, sheets rise like the Add sheet, the
 * quick-add field works like the composer, and anything held for a moment can
 * be picked up and dropped somewhere else.
 */

const VIEW_META: Record<MindView, { label: string; icon: React.ReactNode }> = {
  shelf: { label: "Shelf", icon: <IconShelf size={15} /> },
  list: { label: "List", icon: <IconListView size={15} /> },
  grid: { label: "Grid", icon: <IconGrid size={15} /> },
};
const COLLECTION_VIEWS: MindView[] = ["list", "grid", "shelf"];
/** Mind's home: the collections as folders, or as a list. */
const HOME_VIEWS: MindView[] = ["grid", "list"];

function ViewSwitch({ views, value, onPick }: { views: MindView[]; value: MindView; onPick: (v: MindView) => void }) {
  return (
    <div className={styles.mindViews} role="tablist" aria-label="View">
      {views.map((v) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? styles.mindViewOn : undefined} onClick={() => onPick(v)}>
          {VIEW_META[v].icon}{VIEW_META[v].label}
        </button>
      ))}
    </div>
  );
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
];

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
export const KIND_EMOJI = Object.fromEntries(KINDS.map((k) => [k.kind, k.emoji])) as Record<BlockKind, string>;
/** The picture an item brings to a folder's peek: a photo, a book's cover, a video's still. */
const peekImage = (b: Block) => (b.kind === "image" || b.kind === "book" || b.kind === "video" ? b.image : undefined);





type ToastAction = { label: string; run: () => void };

interface Ctx {
  mind: Mind;
  /** Which Mind is being changed: yours, or the copy of a group's being edited. */
  store: string;
  /** The collection that's open, if any. */
  col: Collection | null;
  update: (fn: (m: Mind) => Mind) => void;
  me: string;
  flash: (t: string, actions?: ToastAction[]) => void;
  openFolder: (id: string) => void;
  openSheet: (n: React.ReactNode) => void;
  closeSheet: () => void;
  /** Opens a chat. Unset in an editor (a group's or a shared Mind), which can't leave for one without losing its copy. */
  openChat?: (chatId: string) => void;
}

export default function MindTab({ onOpenChat, onSettings }: { onOpenChat: (chat: Chat) => void; onSettings: () => void }) {
  const { me, state } = useChat();
  const { mind, update } = useMind(me);
  const meUser = userById(me);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<{ id: string; leaving: boolean } | null>(null);
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; actions?: ToastAction[] } | null>(null);

  // Switching person (Developer → Signed in as) starts from their Mind.
  const [seenMe, setSeenMe] = useState(me);
  if (seenMe !== me) {
    setSeenMe(me);
    setFolder(null);
    setSheet(null);
    setQuery("");
  }

  if (!mind) return <div className={styles.inboxBody} />;
  const col = folder ? mind.collections.find((c) => c.id === folder.id) ?? null : null;
  if (folder && !col) setFolder(null);

  const ctx: Ctx = {
    mind, col, update, me, store: me,
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
      setFolder({ id, leaving: false });
    },
    openSheet: setSheet,
    closeSheet: () => setSheet(null),
    openChat: (chatId) => {
      const chat = state.data.chats.find((c) => c.id === chatId);
      if (chat) onOpenChat(chat);
    },
  };
  const leave = () => {
    setFolder((x) => (x ? { ...x, leaving: true } : x));
    // Only clear what's still leaving: something opened meanwhile stays open.
    setTimeout(() => setFolder((x) => (x?.leaving ? null : x)), 220);
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
            <button className={`${styles.profileAvatar} ${styles.avatarBtn}`} onClick={onSettings} aria-label="Settings">
              <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} photo={meUser.photo} size={40} shape="circle" />
              <span className={styles.orgBadge}><Logo size={12} /></span>
            </button>
            <div className={styles.profileText}>
              <b>{me === "me" ? "Your Mind" : `${meUser.name}'s Mind`}</b>
              <span>{mind.collections.length ? `${mind.collections.length} collection${mind.collections.length === 1 ? "" : "s"} · ${itemCount} items` : "Empty for now"}</span>
            </div>
          </div>
          <button className={styles.plusBtn} aria-label="Add something" onClick={() => setSheet(<MindAddSheet ctx={ctx} collectionId={UNASSIGNED} />)}>
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

      {folder && col && <FolderScreen ctx={ctx} col={col} leaving={folder.leaving} onBack={leave} />}
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
   Editing a group's Mind, full screen
   =========================================================================== */

/**
 * A group's Mind, or a collection someone shared with you to edit, opened
 * full screen the way a board opens: the same Mind as your own (items,
 * tags, views, the one +, hold and drag), working on a copy made when Edit
 * was tapped (startDraft, startShareDraft). Save puts the copy back for
 * everyone; leaving with changes asks first.
 */
export function MindEditor({ source, title, note = "Editing for everyone", shared, onClose, onSaved }: {
  /** What's being edited: a group's Mind id, or a shared collection's shareKey. Its copy is already made. */
  source: string;
  title: string;
  /** Under the title while nothing has changed. */
  note?: string;
  /** Editing a collection shared with you: whose it is, and which. */
  shared?: { owner: string; collectionId: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { me } = useChat();
  const store = draftOf(source);
  const { mind, update } = useMind(store);
  const { mind: savedMind } = useMind(shared ? shared.owner : source);
  // A shared collection is compared with just that collection of its owner's Mind.
  const saved = shared ? projectCollection(savedMind, shared.collectionId) : savedMind;
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; actions?: ToastAction[] } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const col = mind?.collections[0] ?? null;
  // When an item was last touched isn't a change (ticking a to-do and unticking it leaves nothing to save),
  // and neither is the copy's own note of what it started with.
  const content = (m: Mind) => JSON.stringify(m, (k, v) => (k === "updatedAt" || k === "draftBase" ? undefined : v));
  const dirty = !!mind && !!saved && content(mind) !== content(saved);

  // The copy is forgotten once the screen has slid away, when nothing reads it any more.
  const finish = (save: boolean, after?: () => void) => {
    if (leaving) return;
    if (save) {
      if (shared) commitShareDraft(shared.owner, shared.collectionId, me);
      else commitDraft(source);
    }
    setLeaving(true);
    setTimeout(() => {
      onClose();
      dropDraft(source);
      if (save) onSaved();
      after?.();
    }, 220);
  };
  const cancel = () => (dirty ? setAsking(true) : finish(false));

  if (!mind || !col) return null;
  const flash = (text: string, actions?: ToastAction[]) => {
    const id = nowMs();
    setToast({ text, id, actions });
    const stay = actions ? 4200 : 1800;
    setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), stay);
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), stay + 220);
  };
  // No openChat: going to a chat from here would close the editor, and with it any unsaved changes.
  const ctx: Ctx = {
    mind, col, update, me, store, flash,
    // One collection, already open: there's nowhere else to go.
    openFolder: () => {},
    openSheet: setSheet,
    closeSheet: () => setSheet(null),
  };
  // A shared collection is saved only while you may still edit it: the owner may have changed that meanwhile.
  const save = () => {
    if (shared) {
      const ref = { owner: shared.owner, collectionId: shared.collectionId };
      const now = lookUp(ref);
      const may = now ? accessOf(ref, now, me) : null;
      if (may !== "edit" && may !== "owner") {
        flash(now ? `${userById(shared.owner).name} changed your access: this can't be saved now` : "This collection is gone, so there's nothing to save to");
        return;
      }
    }
    finish(true);
  };

  return (
    <div className={styles.mindEditor}>
      <FolderScreen ctx={ctx} col={col} leaving={leaving} onBack={cancel} edit={{ title, note, dirty, onCancel: cancel, onSave: save }} />
      {sheet}
      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${styles.mindToast} ${toast.actions ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
          <span className={styles.toastText}>{emojify(toast.text)}</span>
          {toast.actions?.map((a) => (
            <button key={a.label} className={styles.toastBtn} onClick={() => { setToast(null); a.run(); }}>{a.label}</button>
          ))}
        </div>
      )}
      {asking && (
        <div className={styles.alertScrim} role="alertdialog" aria-modal="true" aria-label="Discard your changes?">
          <div className={`${styles.alert} ${styles.glassStrong}`}>
            <h4>Discard your changes?</h4>
            <p>Nothing you changed in {title} is saved yet.</p>
            <div className={styles.alertActions}>
              <button data-autofocus onClick={() => setAsking(false)}>Keep editing</button>
              <button className={styles.alertDanger} onClick={() => { setAsking(false); finish(false); }}>Discard changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   Collections, shown as folders
   =========================================================================== */

function FolderGrid({ ctx }: { ctx: Ctx }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cols = ctx.mind.collections;
  // Hold a collection for its menu; hold and move to put it somewhere else in the grid.
  const hold = useHold<Drop>({
    root: rootRef,
    menu: (src, el) => openHoldMenu(ctx, src, el),
    closeMenu: ctx.closeSheet,
    find: (x, y, src) => {
      const el = hitAt(x, y)?.closest<HTMLElement>('[data-hold^="collection:"]');
      const id = el?.dataset.hold?.slice("collection:".length);
      if (!el || !id || id === src.id) return null;
      const list = cols.map((c) => c.id).filter((c) => c !== src.id);
      return { t: "collectionBefore", before: afterHalf(el, x, y) ? list[list.indexOf(id) + 1] ?? null : id };
    },
    drop: (src, t) => {
      if (t.t !== "collectionBefore") return;
      ctx.update((m) => {
        const moving = m.collections.find((c) => c.id === src.id);
        if (!moving) return m;
        const list = m.collections.filter((c) => c.id !== src.id);
        const at = t.before ? list.findIndex((c) => c.id === t.before) : -1;
        list.splice(at >= 0 ? at : list.length, 0, moving);
        return { ...m, collections: list };
      });
    },
  });
  const target = hold.target;
  // Folders side by side, or a list with one per row (like a drive); the same folders either way.
  const home: MindView = ctx.mind.home === "list" ? "list" : "grid";
  const setHome = (v: MindView) => ctx.update((m) => ({ ...m, home: v === "list" ? "list" : "grid" }));
  const newFolder = () => ctx.openSheet(<NewFolderSheet ctx={ctx} />);
  const props = (c: Collection, i: number) => ({
    ctx, col: c, i,
    hold: hold.bind({ kind: "collection", id: c.id }),
    before: target?.t === "collectionBefore" && target.before === c.id,
    lifted: hold.isDragging("collection", c.id),
  });
  return (
    <div className={styles.mindStack} ref={rootRef} style={{ position: "relative" }} {...hold.rootHandlers}>
      <div className={styles.mindSectionBar}>
        <p className={styles.sheetLabel}>Collections</p>
        <span className={styles.mindBarEnd}>
          <ViewSwitch views={HOME_VIEWS} value={home} onPick={setHome} />
          <button className={styles.mindIconBtn} onClick={newFolder} aria-label="New collection" title="New collection"><IconPlus size={16} /></button>
        </span>
      </div>
      {home === "list" ? (
        <div className={styles.folderList}>
          {cols.map((c, i) => <FolderRow key={c.id} {...props(c, i)} />)}
          <button className={styles.folderRowNew} onClick={newFolder}><IconPlus size={16} /> New collection</button>
        </div>
      ) : (
        <div className={styles.folderGrid}>
          {cols.map((c, i) => <FolderCard key={c.id} {...props(c, i)} />)}
          <button className={styles.folderNew} onClick={newFolder}>
            <IconPlus size={18} />
            <span>New collection</span>
          </button>
        </div>
      )}
      {hold.ghost}
    </div>
  );
}

/** A collection as a row: the same little folder, its name, what's in it. */
function FolderRow({ ctx, col, i, hold, before, lifted, q }: { ctx: Ctx; col: Collection; i: number; hold?: HoldBind; before?: boolean; lifted?: boolean; q?: string }) {
  const items = collectionItems(ctx.mind, col);
  return (
    <button
      className={[styles.folderRow, styles.rowEnter, before ? styles.mindDropAbove : "", lifted ? styles.mindDragSource : ""].filter(Boolean).join(" ")}
      style={{ ["--tone" as string]: col.tone, ["--i" as string]: i }}
      {...hold}
      onClick={() => ctx.openFolder(col.id)}
    >
      <span className={styles.folderRowIcon}><Emoji char={col.emoji} /></span>
      <span className={styles.mindPageText}>
        <b>{q ? <Mark text={col.name} q={q} /> : col.name}</b>
        <small>{q ? "Collection · " : ""}{countLabel(col, items.length)}</small>
      </span>
      <span className={styles.mindPageSide}>
        {isShared(col.sharing) && <span className={styles.folderPub} title="Shared"><IconUserGroup size={12} /></span>}
        {col.published && <span className={styles.folderPub} title="On Explore"><IconGlobe size={12} /></span>}
        <IconChevron size={14} />
      </span>
    </button>
  );
}

function FolderCard({ ctx, col, i, hold, before, lifted }: { ctx: Ctx; col: Collection; i: number; hold?: HoldBind; before?: boolean; lifted?: boolean }) {
  const items = collectionItems(ctx.mind, col);
  const peek = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  return (
    <button
      className={[styles.folderCard, styles.rowEnter, before ? styles.mindStackBeforeX : "", lifted ? styles.mindDragSource : ""].filter(Boolean).join(" ")}
      style={{ ["--tone" as string]: col.tone, ["--i" as string]: i }}
      data-axis="x"
      {...hold}
      onClick={() => ctx.openFolder(col.id)}
    >
      <span className={styles.folderTop}>
        <span className={styles.folderIcon}><Emoji char={col.emoji} /></span>
        <span className={styles.folderBadges}>
          {isShared(col.sharing) && <span className={styles.folderPub} title="Shared"><IconUserGroup size={12} /></span>}
          {col.published && <span className={styles.folderPub} title="On Explore"><IconGlobe size={12} /></span>}
        </span>
      </span>
      <span className={styles.folderText}>
        <b>{col.name}</b>
        <small>{countLabel(col, items.length)}</small>
      </span>
      <span className={styles.folderPeek} aria-hidden="true">
        {peek.map((b) => (peekImage(b)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={b.id} src={peekImage(b)} alt="" />
          : <span key={b.id}><Emoji char={KIND_EMOJI[b.kind] ?? "💬"} /></span>))}
      </span>
    </button>
  );
}

/** "12 items", or for Unassigned, how many are waiting for a place. */
const countLabel = (col: Collection, n: number) => (isUnassigned(col) ? `${n} to sort` : `${n} item${n === 1 ? "" : "s"}`);

function EmptyMind({ ctx }: { ctx: Ctx }) {
  return (
    <div className={styles.mindStack}>
      <div className={styles.mindStarter}>
        <Logo size={36} />
        <h2>Your Mind is empty</h2>
        <p>Make a collection for anything: a project, a trip, a room. Or just add something: it waits in Unassigned until you sort it into one.</p>
        <button className={styles.mindPrimary} onClick={() => ctx.openSheet(<NewFolderSheet ctx={ctx} />)}>
          <IconPlus size={14} /> New collection
        </button>
        <button className={styles.mindSecondary} onClick={() => ctx.openSheet(<MindAddSheet ctx={ctx} collectionId={UNASSIGNED} />)}>
          Add something
        </button>
      </div>
    </div>
  );
}

/**
 * Inside a collection: everything in it on one level, laid out by the view picked at the top. Tags group it:
 * the filter at the top right brings any group of them back. The + (or the
 * quick-add field at the bottom) adds to it; anything can be held for its
 * menu, or held and moved between things to reorder.
 */
function FolderScreen({ ctx, col, leaving, onBack, edit }: {
  ctx: Ctx;
  col: Collection;
  leaving: boolean;
  onBack: () => void;
  /** Editing a group's Mind: the header names it and offers Cancel and Save instead of Back and settings. */
  edit?: { title: string; note: string; dirty: boolean; onCancel: () => void; onSave: () => void };
}) {
  const [filter, setFilter] = useState<MindFilter>(NO_FILTER);
  /** Searching inside: null when the field is closed. */
  const [search, setSearch] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLInputElement>(null);
  const all = collectionItems(ctx.mind, col);
  const filtering = isFiltering(filter);
  const has = (b: Block) => passes(filter, b);
  const items = all.filter(has);
  const unsorted = isUnassigned(col);
  const q = search?.trim().toLowerCase() ?? "";
  const view = col.view && COLLECTION_VIEWS.includes(col.view) ? col.view : "list";
  const setView = (v: MindView) => ctx.update((m) => patchCollection(m, col.id, (c) => ({ ...c, view: v })));
  const add = () => ctx.openSheet(<MindAddSheet ctx={ctx} collectionId={col.id} />);
  const sort = () => ctx.openSheet(<SortSheet ctx={ctx} onDone={onBack} />);
  const open = (b: Block) => ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />);

  /* ---- quick add, like the composer: a line becomes a note, a link a link (or a video), "word = meaning" a flashcard; "#words" are its tags ---- */
  const quickAdd = () => {
    const { text, tags } = takeTags(draft);
    if (!text) return;
    const id = newId();
    const { url, rest } = splitUrl(text);
    const video = url ? parseVideo(url) : null;
    const host = url ? hostOf(url) : "";
    // While the filter's on, a new item joins what's shown: it gets the tags being filtered by.
    const b: Block = { id, kind: "note", title: text, tags: [...new Set([...tags, ...filter.tags])], createdAt: nowMs() };
    let standIn = false;
    const card = !url && text.match(/^(.+?)\s+=\s+(.+)$/);
    if (card) {
      b.kind = "flashcard";
      b.title = card[1];
      b.back = card[2];
      b.due = true;
    } else if (url) {
      b.kind = video ? "video" : "link";
      b.url = video ? watchUrl(video) : url;
      if (!video) b.source = host || "link";
      if (video) b.image = videoThumb(video) ?? undefined;
      b.title = rest || (video ? videoProvider(video) : host) || text;
      standIn = !rest;
    }
    ctx.update((m) => place({ ...m, blocks: { ...m.blocks, [id]: b } }, id, { collectionId: col.id }));
    if (b.url) enrich(ctx.store, id, b, standIn);
    setDraft("");
  };

  const hold = useHold<Drop>({
    root: rootRef,
    scroll: scrollRef,
    menu: (src, el) => openHoldMenu(ctx, src, el),
    closeMenu: ctx.closeSheet,
    find: (x, y, src) => {
      if (src.kind !== "item") return null;
      const hit = hitAt(x, y);
      const it = hit?.closest<HTMLElement>("[data-root-item]");
      if (it && it.dataset.rootItem !== src.id) {
        const list = col.items.filter((id) => id !== src.id);
        const id = it.dataset.rootItem!;
        return { t: "rootBefore", before: afterHalf(it, x, y) ? list[list.indexOf(id) + 1] ?? null : id };
      }
      if (hit?.closest("[data-drop-root]")) return { t: "rootBefore", before: null };
      return null;
    },
    drop: (src, t) => {
      if (t.t !== "rootBefore") return;
      ctx.update((m) => place(m, src.id, { collectionId: col.id, beforeId: t.before }));
    },
  });
  const target = hold.target;

  const axis = view === "list" ? "y" : "x";
  const item = (b: Block, body: React.ReactNode) => (
    <div
      key={b.id}
      data-root-item={b.id}
      data-axis={axis}
      className={[
        styles.mindBlockWrap,
        hold.isDragging("item", b.id) ? styles.mindDragSource : "",
        target?.t === "rootBefore" && target.before === b.id ? (axis === "x" ? styles.mindDropLeft : styles.mindDropAbove) : "",
      ].filter(Boolean).join(" ")}
      {...hold.bind({ kind: "item", id: b.id })}
    >
      {body}
    </div>
  );
  const tile = (b: Block) => item(b, <Tile onOpen={() => open(b)}><BlockView block={b} shape="tile" onToggle={() => toggleItem(ctx.update, b)} /></Tile>);
  const row = (b: Block) => item(b, (
    <SwipeItem actions={itemActions(ctx, b)}>
      <Tile onOpen={() => open(b)}>
        <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} onToggle={() => toggleItem(ctx.update, b)} />
      </Tile>
    </SwipeItem>
  ));
  const endDrop = target?.t === "rootBefore" && target.before === null;

  // What's in the collection, as the view and the filter say; a search shows its results instead.
  const contents = (
    <>
      <div className={styles.mindToolbar}>
        <ViewSwitch views={COLLECTION_VIEWS} value={view} onPick={setView} />
        {!unsorted && !edit && canShare(ctx) && (
          <button className={styles.mindPill} onClick={() => openShare(ctx, { owner: ctx.me, collectionId: col.id })}>
            {isShared(col.sharing) ? <IconUserGroup size={14} /> : <IconShare size={14} />} {isShared(col.sharing) ? "Shared" : "Share"}
          </button>
        )}
      </div>

      {unsorted && all.length > 0 && (
        <div className={styles.mindSortHint}>
          <p><b>Waiting for a collection.</b> What you save without picking one lands here. Sort gives each a place.</p>
          <button className={styles.mindSort} onClick={sort}>Sort {all.length}</button>
        </div>
      )}

      <FilterBar filter={filter} onChange={setFilter} />

      <div className={`${styles.mindSectionBar} ${endDrop ? styles.mindDropInto : ""}`} data-drop-root>
        <p className={styles.sheetLabel}>In {col.name}</p>
        <button className={styles.mindIconBtn} onClick={add} aria-label={`Add to ${col.name}`} title="Add"><IconPlus size={16} /></button>
      </div>
      <div data-drop-root>
        {!items.length ? (
          filtering ? <p className={styles.emptyInbox}>Nothing in {col.name} matches the filter.</p> : (
            <button className={styles.mindEmptySection} onClick={add}>
              <IconPlus size={14} /> Add something
            </button>
          )
        ) : view === "shelf" ? (
          <div className={styles.mindShelf}>{items.map(tile)}</div>
        ) : view === "grid" ? (
          <div className={styles.mindGridView}>{items.map(tile)}</div>
        ) : (
          <div className={styles.mindRows}>{items.map(row)}</div>
        )}
      </div>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={`${styles.screen} ${styles.chatScreen} ${styles.mindPageScreen} ${styles.mindFolderScreen} ${leaving ? styles.leaving : ""}`}
      style={{ ["--tone" as string]: col.tone }}
      {...hold.rootHandlers}
    >
      <div className={styles.edgeTop} />
      {edit ? (
        <header className={styles.chatHeader}>
          <div className={styles.headerSide}>
            <button className={`${styles.circleBtn} ${styles.glass}`} onClick={edit.onCancel} aria-label="Cancel editing"><IconClose /></button>
          </div>
          <div className={styles.titleCapsule}>
            <span className={styles.mindPageBadge}><Emoji char={col.emoji} /></span>
            <div className={`${styles.tcName} ${styles.glass}`}><span>{edit.title}</span></div>
            <span className={styles.tcPresence}>{edit.dirty ? "Unsaved changes" : edit.note}</span>
          </div>
          <div className={`${styles.headerSide} ${styles.headerEnd}`}>
            <button className={`${styles.mindSave} ${edit.dirty ? styles.mindSaveOn : styles.glass}`} onClick={edit.onSave}>Save</button>
          </div>
        </header>
      ) : (
        <header className={styles.chatHeader}>
          <div className={`${styles.headerSide} ${styles.mindHeadSide}`}>
            <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label="Back to Mind"><IconBack /></button>
          </div>
          <div className={styles.titleCapsule}>
            <span className={styles.mindPageBadge}><Emoji char={col.emoji} /></span>
            <div className={`${styles.tcName} ${styles.glass}`}><span>{col.name}</span></div>
            <span className={styles.tcPresence}>{countLabel(col, all.length)}</span>
          </div>
          <div className={`${styles.headerSide} ${styles.headerEnd} ${styles.mindHeadSide}`}>
            <ScopeTools
              searching={search !== null}
              filtering={filtering}
              moreLabel="Collection options"
              onSearch={() => setSearch((s) => (s === null ? "" : null))}
              onFilter={(el) => ctx.openSheet(<FilterMenu anchor={el} items={all} filter={filter} onChange={setFilter} onClose={ctx.closeSheet} />)}
              onMore={(el) => ctx.openSheet(<ActionMenu anchor={el} title={emojify(`${col.emoji} ${col.name}`)} actions={collectionActions(ctx, col, onBack)} onClose={ctx.closeSheet} />)}
            />
          </div>
        </header>
      )}

      <div className={styles.mindPageScroll} ref={scrollRef}>
        {search !== null && <ScopeSearch value={search} placeholder={`Search ${col.name}`} onChange={setSearch} onCancel={() => setSearch(null)} />}
        {q ? <SearchResults ctx={ctx} q={q} within={col} keep={filtering ? has : undefined} /> : contents}
      </div>

      <div className={styles.mindCompose}>
        <div className={`${styles.mindComposeField} ${styles.glassStrong}`}>
          <button className={styles.mindComposePlus} onClick={add} aria-label={`Add to ${col.name}`}>
            <IconPlus size={18} />
          </button>
          <input
            ref={composeRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }}
            placeholder="A note, a link, #tags"
            aria-label={`Quick add to ${col.name}`}
          />
          {/* Paste while the field is empty (a link, most often); then it's Add. */}
          {!draft.trim() ? (
            <PasteButton
              onPaste={(t) => { setDraft(findUrl(t) ?? t); composeRef.current?.focus({ preventScroll: true }); }}
              onRefused={() => composeRef.current?.focus({ preventScroll: true })}
            />
          ) : (
            <button className={`${styles.mindComposeSend} ${styles.mindComposeReady}`} onClick={quickAdd} aria-label="Add">
              <IconArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
      {hold.ghost}
    </div>
  );
}

/** The part of a name that matches, marked. */
function Mark({ text, q }: { text: string; q: string }) {
  const at = text.toLowerCase().indexOf(q);
  if (!q || at < 0) return <>{emojify(text)}</>;
  return <>{emojify(text.slice(0, at))}<mark className={styles.searchMark}>{text.slice(at, at + q.length)}</mark>{emojify(text.slice(at + q.length))}</>;
}

/** Where something lives: "In 📁 Collection". */
function Crumbs({ trail }: { trail: { key: string; emoji?: string; label: string }[] }) {
  return (
    <span className={styles.crumbs}>
      <span className={styles.crumbIn}>In</span>
      {trail.map((t, i) => (
        <Fragment key={t.key}>
          {i > 0 && <i aria-hidden="true">›</i>}
          <span>{t.emoji && <Emoji char={t.emoji} />}{t.label}</span>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Search across Mind, sorted by what each result is (collections, then
 * items), each item saying which collection it's in. Tags match too. `within`
 * keeps it to one collection.
 */
function SearchResults({ ctx, q, within, keep }: {
  ctx: Ctx;
  q: string;
  within?: Collection;
  /** The page's filter, when one is on: items it hides stay out of the results too. */
  keep?: (b: Block) => boolean;
}) {
  const folders = within ? [] : ctx.mind.collections.filter((c) => c.name.toLowerCase().includes(q));
  const blocks = Object.values(ctx.mind.blocks).filter((b) => {
    if (keep && !keep(b)) return false;
    if (![b.title, b.body, b.source, b.back, b.note, ...(b.tags ?? [])].some((x) => x?.toLowerCase().includes(q))) return false;
    return !within || locate(ctx.mind, b.id)?.collection.id === within.id;
  });
  const total = folders.length + blocks.length;
  return (
    <div className={styles.mindStack}>
      {total === 0 ? (
        <p className={styles.emptyInbox}>Nothing in {within ? within.name : "your Mind"} matches “{q}”.</p>
      ) : (
        <p className={styles.searchCount}>{total} {total === 1 ? "result" : "results"}</p>
      )}

      {folders.length > 0 && (
        <section className={styles.searchGroup}>
          <p className={styles.searchHead}><IconFolder size={13} /> Collections <em>{folders.length}</em></p>
          <div className={styles.folderList}>
            {folders.map((c, i) => <FolderRow key={c.id} ctx={ctx} col={c} i={i} q={q} />)}
          </div>
        </section>
      )}

      {blocks.length > 0 && (
        <section className={styles.searchGroup}>
          <p className={styles.searchHead}><IconInbox size={13} /> Items <em>{blocks.length}</em></p>
          <div className={styles.mindRows}>
            {blocks.map((b) => {
              const at = locate(ctx.mind, b.id);
              const trail = at ? [{ key: at.collection.id, emoji: at.collection.emoji, label: at.collection.name }] : [];
              return (
                <div key={b.id} className={styles.searchItem}>
                  <span className={styles.searchItemTop}>
                    {trail.length > 0 ? <Crumbs trail={trail} /> : <span className={styles.crumbs}>Not in a collection</span>}
                    <span className={styles.searchKind}>{KIND_LABEL[b.kind]}</span>
                  </span>
                  <Tile onOpen={() => ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />)}>
                    <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} onToggle={() => toggleItem(ctx.update, b)} />
                  </Tile>
                </div>
              );
            })}
          </div>
        </section>
      )}
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

export function toggleItem(update: Ctx["update"], b: Block) {
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

/** The one + in a collection (or on Mind's home, for Unassigned): every kind of item in one grid, so there's never a second menu to find. */
function MindAddSheet({ ctx, collectionId }: { ctx: Ctx; collectionId: string }) {
  return (
    <Sheet title={collectionId === UNASSIGNED ? "Add something" : `Add to ${nameOf(ctx.mind, collectionId)}`} onClose={ctx.closeSheet}>
      {(close) => (
        <>
          {collectionId === UNASSIGNED && <p className={styles.sheetNote}>It waits in Unassigned until you sort it into a collection.</p>}
          <KindGrid onPick={(k) => close(() => ctx.openSheet(<AddItemSheet ctx={ctx} collectionId={collectionId} kind={k} />))} />
        </>
      )}
    </Sheet>
  );
}
const nameOf = (mind: Mind, collectionId: string) => mind.collections.find((x) => x.id === collectionId)?.name ?? (collectionId === UNASSIGNED ? "Unassigned" : "");

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
      <NameIconField
        name={name}
        emoji={emoji}
        options={FOLDER_EMOJIS}
        label="Collection name"
        placeholder="e.g. Trip to Lisbon"
        autoFocus
        onName={setName}
        onEmoji={setEmoji}
        onEnter={() => { if (name.trim()) create(); }}
      />
      <p className={styles.sheetLabel}>Colour</p>
      <div className={styles.mindSwatches}>
        {Object.values(TONES).map((c) => <button key={c} style={{ background: c }} className={tone === c ? styles.mindPickOn : undefined} onClick={() => setTone(c)} aria-label={`Colour ${c}`} />)}
      </div>
    </Sheet>
  );
}

/**
 * Publishing a collection to Explore: anyone on NOD can find it, look inside
 * and add a copy to their Mind. It stays live (what you change shows there)
 * until you turn it off. A collection added from someone else's isn't yours
 * to publish.
 */
function PublishField({ ctx, col, onChange }: { ctx: Ctx; col: Collection; onChange: (p: Collection["published"]) => void }) {
  const theirs = col.from && col.from.by !== ctx.me;
  return (
    <>
      <p className={styles.sheetLabel}>Explore</p>
      {theirs ? (
        <p className={styles.sheetNote}>
          {col.from?.id.startsWith("share:") ? `A copy of ${userById(col.from.by).name}’s collection.` : "Added from Explore."} Only collections you made can be published.
        </p>
      ) : (
        <div className={styles.mindPublish}>
          <div className={styles.mindPublishRow}>
            <span className={styles.mindPublishIcon}><IconGlobe size={18} /></span>
            <span className={styles.contactText}>
              <b>Publish to Explore</b>
              <small>{col.published ? `On Explore since ${new Date(col.published.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "Anyone on NOD can find it and add a copy"}</small>
            </span>
            <Toggle
              on={!!col.published}
              onChange={(v) => {
                onChange(v ? { at: Date.now(), description: "" } : undefined);
                ctx.flash(v ? `${col.emoji} ${col.name} is on Explore` : `${col.emoji} ${col.name} is private again`);
              }}
              label="Publish to Explore"
            />
          </div>
          {col.published && (
            <>
              <input
                className={styles.plainInput}
                value={col.published.description}
                maxLength={120}
                onChange={(e) => onChange({ ...col.published!, description: e.target.value })}
                placeholder="A line about it, e.g. Phrases for cafés and trains"
                aria-label="What it's about"
              />
              <p className={styles.sheetNote}>People see what’s in it as it is now; what you add or change shows on Explore too.</p>
            </>
          )}
        </div>
      )}
    </>
  );
}

function FolderSheet({ ctx, colId, onDeleted }: { ctx: Ctx; colId: string; onDeleted: () => void }) {
  const { mind, update } = useMind(ctx.store);
  const col = mind?.collections.find((c) => c.id === colId);
  if (!col) return null;
  const set = (patch: Partial<Collection>) => update((m) => patchCollection(m, colId, (c) => ({ ...c, ...patch })));
  return (
    <Sheet title="Collection" onClose={ctx.closeSheet}>
      {(close) => (
        <>
          <NameIconField name={col.name} emoji={col.emoji} options={FOLDER_EMOJIS} label="Collection name" onName={(name) => set({ name })} onEmoji={(emoji) => set({ emoji })} />
          <p className={styles.sheetLabel}>Colour</p>
          <div className={styles.mindSwatches}>
            {Object.values(TONES).map((c) => <button key={c} style={{ background: c }} className={col.tone === c ? styles.mindPickOn : undefined} onClick={() => set({ tone: c })} aria-label={`Colour ${c}`} />)}
          </div>
          {canShare(ctx) && (
            <>
              <p className={styles.sheetLabel}>Sharing</p>
              <div className={styles.listGroup}>
                <button className={styles.actionRow} onClick={() => close(() => openShare(ctx, { owner: ctx.me, collectionId: col.id }))}>
                  <span className={styles.mindEmoji}><IconUserGroup size={18} /></span>
                  <span className={styles.contactText}><b>Share {col.name}</b><small>{audienceLabel({ ...NO_SHARING, ...col.sharing }, (id) => userById(id).name)}</small></span>
                  <IconChevron size={14} />
                </button>
              </div>
            </>
          )}
          <PublishField ctx={ctx} col={col} onChange={(published) => set({ published })} />
          <button
            className={styles.mindDanger}
            onClick={() => close(() => {
              deleteCollection(ctx, colId);
              onDeleted();
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
 * A name and its icon as one field: the icon sits at the start of the name.
 * Tapping the icon brings the keyboard straight up (the tap focuses a hidden
 * field, so a phone opens its keyboard on the spot): type any emoji and it
 * becomes the icon, then the name takes the keyboard back. With a mouse there's
 * no emoji keyboard, so a row of suggestions shows under the field too.
 */
function NameIconField({ name, emoji, options, label, placeholder, autoFocus, onName, onEmoji, onEnter }: {
  name: string;
  emoji: string;
  /** Suggestions for a mouse; a phone types its own. */
  options: string[];
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onName: (v: string) => void;
  onEmoji: (e: string) => void;
  onEnter?: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const pick = (e: string) => {
    onEmoji(e);
    // Moving focus from field to field keeps a phone's keyboard up, now for the name.
    nameRef.current?.focus({ preventScroll: true });
  };
  return (
    <div className={styles.nameIcon}>
      <div className={`${styles.nameIconRow} ${picking ? styles.nameIconPicking : ""}`}>
        <label className={styles.nameIconBtn} title="Change icon">
          <Emoji char={emoji} />
          <i aria-hidden="true"><IconSmile size={11} /></i>
          <input
            className={styles.nameIconEmoji}
            value=""
            onFocus={() => setPicking(true)}
            onBlur={() => setPicking(false)}
            onChange={(e) => {
              const picked = firstEmoji(e.target.value);
              if (picked) pick(picked);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); nameRef.current?.focus({ preventScroll: true }); } }}
            aria-label={`Icon, now ${emoji}. Type an emoji to change it`}
            autoComplete="off"
            enterKeyHint="done"
          />
        </label>
        <input
          ref={nameRef}
          className={styles.nameIconInput}
          data-autofocus={autoFocus || undefined}
          value={name}
          placeholder={placeholder}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
          aria-label={label}
        />
      </div>
      {picking && (
        <div className={styles.nameIconPicker}>
          <p>Type an emoji to make it the icon</p>
          {/* Pressing a suggestion mustn't blur the hidden field first, or the row would close before the click lands. */}
          <div className={`${styles.mindEmojiGrid} ${styles.nameIconQuick}`} onMouseDown={(e) => e.preventDefault()}>
            {options.map((e) => <button key={e} className={emoji === e ? styles.mindPickOn : undefined} onClick={() => pick(e)} aria-label={`Icon ${e}`}><Emoji char={e} /></button>)}
          </div>
        </div>
      )}
    </div>
  );
}

type SwipeAction = { id: string; label: string; icon: React.ReactNode; tone: "ink" | "accent" | "danger"; run: () => void };

/** What a swipe on an item offers: open its source, move it, or remove it. */
function itemActions(ctx: Ctx, b: Block): SwipeAction[] {
  const list: SwipeAction[] = [];
  const openChat = ctx.openChat;
  if (b.ref && openChat) list.push({ id: "open", label: "Chat", icon: <IconOpen size={18} />, tone: "ink", run: () => openChat(b.ref!.chatId) });
  else if (b.url) list.push({ id: "open", label: "Open", icon: <IconOpen size={18} />, tone: "ink", run: () => window.open(b.url, "_blank", "noopener") });
  list.push({ id: "move", label: "Move", icon: <IconFolder size={18} />, tone: "accent", run: () => ctx.openSheet(<MoveSheet me={ctx.store} id={b.id} onClose={ctx.closeSheet} onMoved={ctx.flash} />) });
  list.push({ id: "remove", label: "Remove", icon: <IconTrash size={18} />, tone: "danger", run: () => removeItem(ctx.update, ctx.flash, b.id) });
  return list;
}

/** The share sheet for something in your own Mind; "Send in a chat" follows it. */
function openShare(ctx: Ctx, ref: ShareRef) {
  ctx.openSheet(<ShareSheet share={ref} onClose={ctx.closeSheet} onSend={() => ctx.openSheet(<SendSheet share={ref} onClose={ctx.closeSheet} onSent={ctx.flash} />)} />);
}
/** Only your own Mind shares: not a group's, not a copy being edited. */
const canShare = (ctx: Ctx) => ctx.store === ctx.me;
/** Shared with anyone at all: people, emails or the link. */
const isShared = (s: Collection["sharing"]) => !!s && (s.link !== "off" || Object.keys(s.people).length > 0 || Object.keys(s.emails ?? {}).length > 0);

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
      if (!c) return at.unsorted ? intoUnassigned(next, id) : n;
      const i = at.collection.items.indexOf(id);
      return patchCollection(next, c.id, (x) => ({ ...x, items: [...x.items.slice(0, i), id, ...x.items.slice(i)] }));
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
   Holding and moving: drop targets, the hold menus, and what they do
   =========================================================================== */

/** Where a held thing would land if let go now: before an item (null: at the end), or before a collection on Mind's home. */
type Drop =
  | { t: "rootBefore"; before: string | null }
  | { t: "collectionBefore"; before: string | null };

const hitAt = (x: number, y: number) => document.elementFromPoint(x, y) as HTMLElement | null;

/** Past the middle of an element (across for a row of cards, down for a list). */
function afterHalf(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  return el.dataset.axis === "x" ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
}

/** Delete a collection and everything in it, with an Undo that puts it back where it was. */
function deleteCollection(ctx: Ctx, colId: string) {
  let back: ((m: Mind) => Mind) | null = null;
  let name = "";
  ctx.update((m) => {
    const at = m.collections.findIndex((c) => c.id === colId);
    const gone = m.collections[at];
    if (!gone) return m;
    name = gone.name;
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
  const undo = back as ((m: Mind) => Mind) | null;
  ctx.flash(`${name} deleted`, undo ? [{ label: "Undo", run: () => ctx.update(undo) }] : undefined);
}

const renameAction = (ctx: Ctx, what: string, value: string, save: (v: string) => void) => () => ctx.openSheet(<RenameSheet ctx={ctx} what={what} value={value} onSave={save} />);

/** What a collection offers, held on Mind's home or from "…" inside it. `onDeleted` leaves it, when it's open. */
function collectionActions(ctx: Ctx, c: Collection, onDeleted?: () => void): HoldAction[] {
  if (isUnassigned(c)) return [
    { id: "sort", label: "Sort…", icon: <IconFolder />, run: () => ctx.openSheet(<SortSheet ctx={ctx} onDone={onDeleted} />) },
    "sep",
    { id: "delete", label: "Delete everything in it", icon: <IconTrash />, danger: true, run: () => { deleteCollection(ctx, c.id); onDeleted?.(); } },
  ];
  return [
    { id: "rename", label: "Rename", icon: <IconEdit />, run: renameAction(ctx, "collection", c.name, (name) => ctx.update((m) => patchCollection(m, c.id, (x) => ({ ...x, name })))) },
    { id: "style", label: "Icon & colour", icon: <IconPalette />, run: () => ctx.openSheet(<FolderSheet ctx={ctx} colId={c.id} onDeleted={onDeleted ?? (() => {})} />) },
    ...(canShare(ctx) ? [{ id: "share", label: "Share…", icon: <IconShare />, run: () => openShare(ctx, { owner: ctx.me, collectionId: c.id }) }] : []),
    ...(c.from && c.from.by !== ctx.me ? [] : [{
      id: "publish",
      label: c.published ? "Remove from Explore" : "Publish to Explore",
      icon: <IconGlobe />,
      run: () => {
        ctx.update((m) => patchCollection(m, c.id, (x) => ({ ...x, published: c.published ? undefined : { at: Date.now(), description: "" } })));
        ctx.flash(c.published ? `${c.emoji} ${c.name} is private again` : `${c.emoji} ${c.name} is on Explore`);
      },
    }]),
    "sep",
    { id: "delete", label: "Delete collection", icon: <IconTrash />, danger: true, run: () => { deleteCollection(ctx, c.id); onDeleted?.(); } },
  ];
}

/** What holding something offers. Opens as a lifted copy with a menu under it, like a message. */
function openHoldMenu(ctx: Ctx, src: HoldSrc, el: HTMLElement) {
  const show = (title: React.ReactNode, actions: HoldAction[]) => ctx.openSheet(<HoldMenu anchor={el} title={title} actions={actions} onClose={ctx.closeSheet} />);
  const rename = (what: string, value: string, save: (v: string) => void) => renameAction(ctx, what, value, save);

  if (src.kind === "collection") {
    const c = ctx.mind.collections.find((x) => x.id === src.id);
    if (!c) return;
    show(emojify(`${c.emoji} ${c.name}`), [
      { id: "open", label: "Open", icon: <IconArrowRight />, run: () => ctx.openFolder(c.id) },
      ...collectionActions(ctx, c),
    ]);
    return;
  }
  const b = ctx.mind.blocks[src.id];
  if (!b) return;
  const where = locate(ctx.mind, b.id);
  show(KIND_LABEL[b.kind] ?? "Item", [
    { id: "open", label: "Open", icon: <IconArrowRight />, run: () => ctx.openSheet(<BlockSheet ctx={ctx} id={b.id} />) },
    ...(b.kind !== "chat" ? [{ id: "rename", label: "Rename", icon: <IconEdit />, run: rename(KIND_LABEL[b.kind]?.toLowerCase() ?? "item", b.title, (title) => ctx.update((m) => patchBlock(m, b.id, { title }))) }] : []),
    {
      id: "move", label: where?.unsorted ? "Sort into…" : "Move to…", icon: <IconFolder />,
      run: () => ctx.openSheet(<MoveSheet me={ctx.store} id={b.id} onClose={ctx.closeSheet} onMoved={ctx.flash} />),
    },
    ...(canShare(ctx) && where && !where.unsorted && b.kind !== "chat"
      ? [{ id: "share", label: "Share…", icon: <IconShare />, run: () => openShare(ctx, { owner: ctx.me, collectionId: where.collection.id, blockId: b.id }) }]
      : []),
    ...(b.ref ? (ctx.openChat ? [{ id: "chat", label: "Show in chat", icon: <IconMessage />, run: () => ctx.openChat?.(b.ref!.chatId) }] : [])
      : b.url ? [{ id: "link", label: "Open link", icon: <IconOpen />, run: () => window.open(b.url, "_blank", "noopener") }] : []),
    "sep",
    { id: "delete", label: "Delete", icon: <IconTrash />, danger: true, run: () => removeItem(ctx.update, ctx.flash, b.id) },
  ]);
}

function RenameSheet({ ctx, what, value, onSave }: { ctx: Ctx; what: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const save = () => { onSave(v.trim()); ctx.closeSheet(); };
  return (
    <Sheet title={`Rename ${what}`} onClose={ctx.closeSheet} action={{ label: "Save", disabled: !v.trim() || v.trim() === value, onClick: save }}>
      <input
        className={`${styles.plainInput} ${styles.mindTitleInput}`}
        data-autofocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => { if (e.key === "Enter" && v.trim() && v.trim() !== value) save(); }}
        aria-label="Name"
      />
    </Sheet>
  );
}

/* ===========================================================================
   Quick add, and what a new item learns about itself
   =========================================================================== */

/**
 * "#words" typed in the quick-add field are its tags: "Der Hund #animals #a1"
 * adds "Der Hund" tagged animals and a1. Only a # that starts a word and is
 * followed by a letter counts, so a link's #anchor or "#1" stays as typed.
 */
function takeTags(input: string) {
  const tags: string[] = [];
  const text = input
    .replace(/(^|\s)#(\p{L}[\p{L}\p{N}_-]*)/gu, (_, before: string, tag: string) => { tags.push(tag.toLowerCase()); return before; })
    .replace(/\s+/g, " ")
    .trim();
  return { text, tags: [...new Set(tags)] };
}

/** What a found book fills in on an item. */
const bookFields = (hit: BookHit): Partial<Block> => ({
  title: hit.title, source: hit.author || undefined, image: hit.cover, url: hit.url, isbn: hit.isbn, year: hit.year, pages: hit.pages, body: hit.description,
});

/**
 * Looks up what wasn't known yet when an item was made, and fills it in when
 * the answer comes: a link's or a video's title (only while the title is
 * still a stand-in like the site's name), a video's channel and still, a
 * book's cover and author (only when the catalogue's title matches what was
 * typed, or it was an ISBN).
 */
function enrich(store: string, id: string, block: Block, titleStandIn: boolean) {
  if ((block.kind === "link" || block.kind === "video") && block.url) {
    const standIn = block.title;
    void unfurl(block.url).then((meta) => {
      if (!meta) return;
      amendBlock(store, id, (b) => {
        const patch: Partial<Block> = {};
        if (titleStandIn && meta.title && b.title === standIn) patch.title = meta.title;
        if (b.kind === "video") {
          if (!b.source && meta.author) patch.source = meta.author;
          if (!b.image && meta.image) patch.image = meta.image;
          if (!b.duration && meta.duration) patch.duration = meta.duration;
        }
        return Object.keys(patch).length ? patch : null;
      });
    });
  } else if (block.kind === "book" && !block.image) {
    const typed = block.title;
    void findBooks(block.isbn ?? typed).then((hits) => {
      const hit = hits?.[0];
      if (!hit || !(block.isbn || sameTitle(typed, hit))) return;
      amendBlock(store, id, (b) => (b.title === typed ? bookFields(hit) : null));
    });
  }
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

const SAMPLE_IMAGES = ["photo-1586023492125-27b2c045efd7", "photo-1616137466211-f939a420be84", "photo-1519710164239-da123dc03ef4", "photo-1505693416388-ac5ce068fe85"];
const DAY_MS = 86_400_000;
/** A week from now, at this hour: where a new date starts. */
function inAWeek(hour: number) {
  const d = new Date(nowMs() + 7 * DAY_MS);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}
type Shelf = NonNullable<Block["shelf"]>;
const SHELVES: { id: Shelf; label: string }[] = [{ id: "want", label: "Want to read" }, { id: "reading", label: "Reading" }, { id: "read", label: "Finished" }];
const isPhoto = (file: File | null) => (file?.type.startsWith("image/") ? file : null);

/**
 * Making one item. Each kind asks for what it needs, the main thing first: a
 * link to paste, a photo to pick, a book to find, a palette to generate.
 * Links and videos read their own title (and a video its channel and still);
 * books come from Apple Books and Open Library, covers and all.
 */
function AddItemSheet({ ctx, collectionId, kind: picked }: { ctx: Ctx; collectionId: string; kind: BlockKind }) {
  // One kind per sheet: changing your mind is Back, to everything + makes.
  const kind: BlockKind = picked === "chat" ? "note" : picked;
  const [tags, setTags] = useState<string[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  // Once a title or channel is typed, what the link says no longer replaces it.
  const [typedA, setTypedA] = useState(false);
  const [typedB, setTypedB] = useState(false);
  const [url, setUrl] = useState("");
  const [found, setFound] = useState<{ url: string; meta: LinkMeta | null } | null>(null);
  const [book, setBook] = useState<BookHit | null>(null);
  const [byHand, setByHand] = useState(false);
  const [shelf, setShelf] = useState<Shelf>("want");
  const [at, setAt] = useState(() => inAWeek(9));
  const [flag, setFlag] = useState(false);
  const [swatches, setSwatches] = useState<Swatch[]>(() => randomPalette(5));
  const [image, setImage] = useState<string>(SAMPLE_IMAGES[0]);
  const [upload, setUpload] = useState<File | null>(null);
  const [asking, setAsking] = useState<{ host: HTMLElement; answer: (ok: boolean) => void } | null>(null);
  const where = nameOf(ctx.mind, collectionId);
  const info = KINDS.find((k) => k.kind === kind)!;

  // A pasted link is read for its title; a video's for its channel and still too.
  const link = kind === "link" || kind === "video" ? normalizeUrl(url) ?? findUrl(url) : null;
  const video = link ? parseVideo(link) : null;
  useEffect(() => {
    if (!link) return;
    let live = true;
    const wait = setTimeout(() => { void unfurl(link).then((meta) => { if (live) setFound({ url: link, meta }); }); }, 300);
    return () => { live = false; clearTimeout(wait); };
  }, [link]);
  const meta = link && found?.url === link ? found.meta : null;
  const looking = !!link && found?.url !== link;
  const title = typedA ? a : meta?.title || a;
  const channel = typedB ? b : meta?.author || b;
  const still = meta?.image ?? (video ? videoThumb(video) ?? undefined : undefined);
  const photo = isPhoto(upload);

  const fields: Partial<Record<BlockKind, [string, string?, string?]>> = {
    note: ["Title", "Write something…"], todo: ["What needs doing?"],
    quote: ["The quote", "Who said it, or what it means"], flashcard: ["Front, e.g. gemütlich", "Back, e.g. cosy"],
    progress: ["What are you tracking?", "Done so far", "Out of"], habit: ["A habit, e.g. Review for 10 minutes"],
    amount: ["What for? e.g. Invoice 044", "From whom? e.g. Acme Co", "Amount in €"], date: ["What's happening? e.g. Pitch day"],
  };
  const simple = fields[kind];
  const ready = kind === "file" ? !!upload
    : kind === "image" || kind === "palette" ? true
    : kind === "link" ? !!link || !!title.trim()
    : kind === "video" ? !!link
    : kind === "book" ? (byHand ? !!a.trim() : !!book)
    : !!a.trim();

  /** Asks for the photo library the way iOS does, once; then it just opens. */
  const askPhotos = (from: HTMLElement) => new Promise<boolean>((resolve) => {
    if (getPermission("photos") === "granted") { resolve(true); return; }
    const host = (from.closest('[role="dialog"]')?.parentElement ?? document.body) as HTMLElement;
    setAsking({ host, answer: (ok) => { setPermission("photos", ok ? "granted" : "denied"); setAsking(null); resolve(ok); } });
  });

  const create = async () => {
    const id = newId();
    const t = a.trim();
    const base: Block = { id, kind, title: t, tags, createdAt: nowMs() };
    let block: Block = base;
    let standIn = false;
    if (kind === "note") block = { ...base, body: b.trim() };
    if (kind === "link") {
      const site = link ? hostOf(link) : "";
      standIn = !title.trim() && !!link;
      block = { ...base, title: title.trim() || site || "Link", source: site || "link", url: link ?? undefined };
    }
    if (kind === "video") {
      standIn = !title.trim();
      block = {
        ...base,
        title: title.trim() || (video ? videoProvider(video) : link ? hostOf(link) : "Video"),
        source: channel.trim() || undefined,
        url: video ? watchUrl(video) : link ?? undefined,
        image: still,
        duration: meta?.duration,
      };
    }
    if (kind === "book") block = book && !byHand ? { ...base, ...bookFields(book), shelf } : { ...base, source: b.trim(), shelf };
    if (kind === "quote") block = { ...base, body: b.trim() };
    if (kind === "flashcard") block = { ...base, back: b.trim() || "…", due: true };
    if (kind === "progress") block = { ...base, value: Number(b) || 0, total: Math.max(1, Number(c) || 10) };
    if (kind === "habit") block = { ...base, days: [] };
    if (kind === "amount") block = { ...base, source: b.trim(), amount: Number(c.replace(",", ".")) || 0, paid: flag, at };
    if (kind === "date") block = { ...base, at };
    if (kind === "palette") {
      const colors = swatches.map((s) => s.hex);
      block = { ...base, title: t || paletteName(colors), colors };
    }
    if (kind === "image") {
      if (photo) {
        const att = await toAttachment(photo);
        block = { ...base, title: t || photo.name.replace(/\.[^.]+$/, ""), attachment: att ?? undefined, source: "Uploaded by you" };
      } else {
        block = { ...base, title: t || "Saved image", image: `https://images.unsplash.com/${image}?w=700&q=70&fm=jpg`, source: "Saved by you" };
      }
    }
    if (kind === "file" && upload) {
      const att = await toAttachment(upload);
      block = { ...base, title: t || upload.name, size: upload.size, attachment: att ?? undefined };
    }
    ctx.update((m) => place({ ...m, blocks: { ...m.blocks, [id]: block } }, id, { collectionId }));
    // Added before the link answered: its title and still follow when they come.
    if (block.url && (kind === "link" || kind === "video") && (standIn || !meta)) enrich(ctx.store, id, block, standIn);
    ctx.closeSheet();
    ctx.flash(`${info.emoji} Added to ${where}`);
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && ready) void create(); };

  return (
    <Sheet
      title={`${info.label} · ${where}`}
      onClose={ctx.closeSheet}
      onBack={() => ctx.openSheet(<MindAddSheet ctx={ctx} collectionId={collectionId} />)}
      action={{ label: "Add", disabled: !ready, onClick: () => { void create(); } }}
    >

      {(kind === "link" || kind === "video") && (
        <>
          <PasteField
            value={url}
            onChange={setUrl}
            pick={(text) => findUrl(text) ?? text}
            icon={kind === "video" ? <IconVideo size={18} /> : <IconLink size={18} />}
            label={kind === "video" ? "Video link" : "Link"}
            placeholder={kind === "video" ? "Paste a YouTube or Vimeo link" : "Paste a link, e.g. dw.com"}
            autoFocus
            busy={looking}
            onEnter={() => { if (ready) void create(); }}
          />
          {kind === "video" && link && <VideoPreview image={still} duration={meta?.duration} site={video ? videoProvider(video) : meta?.site} />}
          {(kind === "link" || link) && (
            <input
              className={`${styles.plainInput} ${styles.mindTitleInput}`}
              placeholder={looking ? "Reading the title…" : "Title"}
              value={title}
              onChange={(e) => { setTypedA(true); setA(e.target.value); }}
              onKeyDown={enter}
              aria-label="Title"
            />
          )}
          {kind === "video" && link && (
            <input
              className={styles.plainInput}
              placeholder={looking ? "Finding the channel…" : "Channel (optional)"}
              value={channel}
              onChange={(e) => { setTypedB(true); setB(e.target.value); }}
              onKeyDown={enter}
              aria-label="Channel"
            />
          )}
          {kind === "video" && !link && <p className={styles.sheetNote}>The title and channel fill in from the link. Tap the video in Mind and it plays right there.</p>}
        </>
      )}

      {kind === "book" && (byHand ? (
        <>
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} data-autofocus placeholder="Book title" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={enter} aria-label="Book title" />
          <input className={styles.plainInput} placeholder="Author" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={enter} aria-label="Author" />
          <Segmented value={shelf} options={SHELVES} onChange={setShelf} />
          <button type="button" className={fieldStyles.manual} onClick={() => setByHand(false)}>Search Apple Books and Open Library instead</button>
        </>
      ) : (
        <BookSearch picked={book} onPick={setBook} onManual={() => setByHand(true)} autoFocus>
          <Segmented value={shelf} options={SHELVES} onChange={setShelf} />
        </BookSearch>
      ))}

      {kind === "image" && (
        <>
          <PhotoPicker file={photo} onFile={setUpload} before={askPhotos} />
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} placeholder="Title" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={enter} aria-label="Title" />
          {!photo && (
            <>
              <p className={styles.sheetLabel}>Or use a sample</p>
              <div className={styles.mindPickImages}>
                {SAMPLE_IMAGES.map((src) => (
                  <button key={src} className={image === src ? styles.mindPickOn : undefined} onClick={() => setImage(src)} aria-label="Use this sample" aria-pressed={image === src}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://images.unsplash.com/${src}?w=200&q=60&fm=jpg`} alt="" />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {kind === "file" && (
        <>
          <FilePicker file={upload} onFile={setUpload} />
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} placeholder="Name (optional)" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={enter} aria-label="Name" />
        </>
      )}

      {kind === "palette" && (
        <>
          <PaletteEditor value={swatches} onChange={setSwatches} />
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} placeholder={paletteName(swatches.map((s) => s.hex))} value={a} onChange={(e) => setA(e.target.value)} onKeyDown={enter} aria-label="Palette name (optional)" />
        </>
      )}

      {simple && (
        <>
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} data-autofocus placeholder={simple[0]} value={a} onChange={(e) => setA(e.target.value)} onKeyDown={enter} aria-label={simple[0]} />
          {simple[1] && (kind === "note"
            ? <textarea className={`${styles.plainInput} ${styles.mindNote}`} placeholder={simple[1]} value={b} onChange={(e) => setB(e.target.value)} rows={3} aria-label={simple[1]} />
            : <input className={styles.plainInput} placeholder={simple[1]} value={b} onChange={(e) => setB(e.target.value)} inputMode={kind === "progress" ? "numeric" : undefined} aria-label={simple[1]} />)}
          {simple[2] && <input className={styles.plainInput} placeholder={simple[2]} value={c} onChange={(e) => setC(e.target.value)} inputMode={kind === "progress" || kind === "amount" ? "decimal" : undefined} aria-label={simple[2]} />}
          {kind === "date" && <DateField label="Date" value={at} onChange={setAt} />}
          {kind === "amount" && <DateField label="Due" value={at} onChange={setAt} />}
          {kind === "amount" && <div className={styles.mindField}><span>Already paid</span><Toggle on={flag} onChange={setFlag} label="Already paid" /></div>}
        </>
      )}

      <p className={styles.sheetLabel}>Tags</p>
      <TagField value={tags} suggestions={tagsOf(Object.values(ctx.mind.blocks))} onChange={setTags} />

      {asking && createPortal(<PermissionAlert kind="photos" onResolve={asking.answer} />, asking.host)}
    </Sheet>
  );
}

/* ===========================================================================
   Item and move sheets
   =========================================================================== */

function BlockSheet({ ctx, id }: { ctx: Ctx; id: string }) {
  const { mind, update } = useMind(ctx.store);
  const b = mind?.blocks[id];
  if (!mind || !b) return null;
  const at = locate(mind, id);
  const set = (patch: Partial<Block>) => update((m) => patchBlock(m, id, patch));

  // Opening the source is a quiet header action, not a big button.
  const openChat = ctx.openChat;
  const action = b.ref
    ? (openChat ? { label: "Open chat", onClick: () => openChat(b.ref!.chatId) } : undefined)
    : b.url ? { label: "Open", href: b.url, onClick: () => {} } : undefined;

  return (
    <Sheet title={KIND_LABEL[b.kind]} onClose={ctx.closeSheet} action={action}>
      {(close) => (
        <>
          <BlockEditor b={b} set={set} onToggle={() => toggleItem(update, b)} />

          <p className={styles.sheetLabel}>Your note</p>
          <textarea className={`${styles.plainInput} ${styles.mindNote}`} placeholder="Why did you keep this?" value={b.note ?? ""} onChange={(e) => set({ note: e.target.value })} rows={2} />

          <p className={styles.sheetLabel}>Tags</p>
          <TagField value={b.tags} suggestions={tagsOf(Object.values(mind.blocks))} onChange={(tags) => set({ tags })} />

          <div className={styles.mindSectionBar}>
            <p className={styles.sheetLabel}>Lives in</p>
            <span className={styles.mindBarEnd}>
              {canShare(ctx) && at && !at.unsorted && b.kind !== "chat" && (
                <button className={styles.mindPill} onClick={() => close(() => openShare(ctx, { owner: ctx.me, collectionId: at.collection.id, blockId: id }))}>
                  <IconShare size={14} /> Share
                </button>
              )}
              <button className={styles.mindPill} onClick={() => close(() => ctx.openSheet(<MoveSheet me={ctx.store} id={id} onClose={ctx.closeSheet} onMoved={ctx.flash} />))}>
                <IconFolder size={14} /> {at?.unsorted ? "Sort" : "Move"}
              </button>
            </span>
          </div>
          {at ? (
            <nav className={styles.mindCrumbs} aria-label="Location">
              <ol>
                <li>
                  <button onClick={() => close(() => ctx.openFolder(at.collection.id))}><Emoji char={at.collection.emoji} /> {at.collection.name}</button>
                </li>
              </ol>
            </nav>
          ) : <p className={styles.mindHint}>Not in a collection.</p>}

          <button className={styles.mindDanger} onClick={() => close(() => removeItem(update, ctx.flash, id))}>Remove from Mind</button>
        </>
      )}
    </Sheet>
  );
}

/**
 * An item's tags as chips: its own (on), then tags used anywhere in Mind to
 * add with a tap, then "+ Tag" to type a new one (Enter adds it, Escape drops
 * it). Tags aren't places: the same word ties things together across every
 * collection, for search and the filter.
 */
function TagField({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Escape discards the tag: the blur that follows mustn't add it anyway.
  const discard = useRef(false);
  const add = () => {
    if (discard.current) return;
    const t = draft.trim().replace(/^#/, "");
    if (t) onChange([...new Set([...value, t])]);
    setDraft("");
    setAdding(false);
  };
  const shown = [...new Set([...value, ...suggestions])].slice(0, Math.max(12, value.length));
  return (
    <div className={styles.chipGrid}>
      {shown.map((t) => (
        <button key={t} className={`${styles.choice} ${value.includes(t) ? styles.choiceOn : ""}`} aria-pressed={value.includes(t)} onClick={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])}>#{t}</button>
      ))}
      {adding ? (
        <input
          className={styles.mindTagInput}
          ref={(el) => el?.focus({ preventScroll: true })}
          placeholder="tag"
          value={draft}
          size={Math.max(4, draft.length + 1)}
          onChange={(e) => setDraft(e.target.value.replace(/\s+/g, "-").toLowerCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") {
              // Cancel the tag only, not the sheet: the sheet listens for Escape on window.
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              discard.current = true;
              setDraft("");
              setAdding(false);
            }
          }}
          onBlur={add}
          aria-label="New tag"
        />
      ) : (
        <button className={`${styles.choice} ${styles.mindAddTag}`} onClick={() => { discard.current = false; setAdding(true); }}><IconPlus size={14} /> Tag</button>
      )}
    </div>
  );
}

/**
 * An item in detail, with what can be changed right there: the palette
 * maker, a date, a shelf, a status, the stepper. The item sheet shows it, and
 * so does a shared item opened by someone allowed to edit it.
 */
export function BlockEditor({ b, set, onToggle }: { b: Block; set: (patch: Partial<Block>) => void; onToggle: () => void }) {
  return (
    <>
      {b.kind === "palette" ? (
        // A palette opens in the palette maker: lock, generate, add, undo, all saved as you go.
        <>
          <input className={`${styles.plainInput} ${styles.mindTitleInput}`} value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder={paletteName(b.colors ?? [])} aria-label="Palette name" />
          <PaletteSaver key={b.id} colors={b.colors ?? []} onColors={(colors) => set({ colors })} />
        </>
      ) : (
        // Tapping a video means watching it: it plays straight away.
        <div className={styles.mindDetail}><BlockView block={b} shape="detail" onToggle={onToggle} autoPlay /></div>
      )}
      {b.kind === "date" && <DateField label="Date" value={b.at ?? nowMs()} onChange={(at) => set({ at })} />}
      {b.kind === "amount" && <DateField label="Due" value={b.at ?? nowMs()} onChange={(at) => set({ at })} />}
      {b.kind === "book" && <Segmented value={b.shelf ?? "want"} options={SHELVES} onChange={(v) => set({ shelf: v })} />}
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
    </>
  );
}

/** The palette maker on a saved palette: its colours are written back as they change. */
function PaletteSaver({ colors, onColors }: { colors: string[]; onColors: (colors: string[]) => void }) {
  const [swatches, setSwatches] = useState(() => swatchesOf(colors));
  return <PaletteEditor value={swatches} onChange={(next) => { setSwatches(next); onColors(next.map((s) => s.hex)); }} />;
}

function WhereRow({ emoji, title, count, on, onPick }: { emoji: string; title: string; count: number; on: boolean; onPick: () => void }) {
  return (
    <button className={styles.actionRow} onClick={onPick}>
      <span className={styles.mindEmoji}><Emoji char={emoji} /></span>
      <span className={styles.contactText}><b>{title}</b><small>{count} {count === 1 ? "item" : "items"}</small></span>
      <span className={`${styles.pickCircle} ${on ? styles.pickOn : ""}`}>{on && <IconCheck size={12} />}</span>
    </button>
  );
}

/** A collection made on the spot while picking a place: the name's first emoji is its icon, else a folder. */
function quickCollection(name: string, count: number) {
  const icon = firstEmoji(name);
  const tones = Object.values(TONES);
  return makeCollection(icon ? name.replace(icon, "").trim() || name : name, icon ?? "📁", tones[count % tones.length]);
}

/** "New collection" at the end of a list of places: tap it, name it, Enter makes it and puts the thing there. */
function NewPlace({ chip, onCreate }: { chip?: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState<string | null>(null);
  // Escape drops the name: the blur that follows mustn't make the collection anyway.
  const discard = useRef(false);
  const make = () => {
    const n = (name ?? "").trim();
    if (!discard.current && n) onCreate(n);
    setName(null);
  };
  if (name === null) {
    return chip ? (
      <button className={`${styles.choice} ${styles.mindAddTag}`} onClick={() => { discard.current = false; setName(""); }}><IconPlus size={14} /> New</button>
    ) : (
      <button className={styles.actionRow} onClick={() => { discard.current = false; setName(""); }}>
        <span className={styles.mindEmoji}><IconPlus size={16} /></span>
        <span className={styles.contactText}><b>New collection</b><small>Make one and put it there</small></span>
      </button>
    );
  }
  const field = (
    <input
      className={chip ? styles.mindTagInput : `${styles.plainInput} ${styles.mindNewPlace}`}
      ref={(el) => el?.focus({ preventScroll: true })}
      placeholder={chip ? "Name it" : "Name it, e.g. Trip to Lisbon"}
      value={name}
      size={chip ? Math.max(8, name.length + 1) : undefined}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") make();
        if (e.key === "Escape") {
          // Cancel the name only, not the sheet: the sheet listens for Escape on window.
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          discard.current = true;
          setName(null);
        }
      }}
      onBlur={make}
      enterKeyHint="done"
      aria-label="New collection's name"
    />
  );
  return chip ? field : <div className={styles.actionRow}><span className={styles.mindEmoji}><Emoji char={firstEmoji(name) ?? "📁"} /></span>{field}</div>;
}

/**
 * Sorting Unassigned: everything waiting, one under the other, each with your
 * collections to pick from (or a new one, named right there). Pick a place for
 * as many as you like; Done moves them all at once, and anything skipped keeps
 * waiting. Saves from a chat teach Mind where that chat's saves go next time.
 */
function SortSheet({ ctx, onDone }: { ctx: Ctx; onDone?: () => void }) {
  const { mind, update } = useMind(ctx.store);
  /** Item → the collection picked for it. */
  const [picks, setPicks] = useState<Record<string, string>>({});
  /** Collections named here: made on Done, only if something goes in them. */
  const [made, setMade] = useState<Collection[]>([]);
  if (!mind) return null;
  const waiting = mind.collections.find(isUnassigned);
  const items = waiting ? collectionItems(mind, waiting) : [];
  const places = [...mind.collections.filter((c) => !isUnassigned(c)), ...made];
  const count = items.filter((b) => picks[b.id]).length;
  const pick = (blockId: string, colId: string) => setPicks((p) => {
    const next = { ...p };
    if (next[blockId] === colId) delete next[blockId];
    else next[blockId] = colId;
    return next;
  });
  const all = (colId: string) => setPicks(Object.fromEntries(items.map((b) => [b.id, colId])));

  const apply = () => {
    const used = new Set(Object.values(picks));
    update((m) => {
      let next: Mind = { ...m, collections: [...m.collections, ...made.filter((c) => used.has(c.id))] };
      for (const b of items) {
        const to = picks[b.id];
        if (!to || !next.blocks[b.id]) continue;
        next = place(next, b.id, { collectionId: to });
        if (b.ref) next = learnChat(next, to, b.ref.chatId);
      }
      return next;
    });
  };
  const done = () => {
    const left = items.length - count;
    ctx.flash(left ? `Sorted ${count} · ${left} still waiting` : `All sorted: ${count} ${count === 1 ? "item has" : "items have"} a place`);
    // Everything sorted: Unassigned goes away, so its screen slides out first.
    if (!left && onDone) { onDone(); setTimeout(apply, 240); } else apply();
  };

  return (
    <Sheet title="Sort" onClose={ctx.closeSheet} action={{ label: "Done", disabled: !count, onClick: done }}>
      {!items.length ? <p className={styles.emptyInbox}>Nothing is waiting to be sorted.</p> : (
        <>
          <p className={styles.sheetNote}>
            {count === items.length ? `${count === 1 ? "It has" : `All ${count} have`} a place. Done moves ${count === 1 ? "it" : "them"} there.`
              : count ? `${count} of ${items.length} have a place. Anything you skip stays in Unassigned.`
              : "Pick a collection for each one, then Done moves them. Anything you skip stays in Unassigned."}
          </p>
          {places.length > 0 && items.length > 1 && (
            <div className={styles.mindSortAll}>
              <span>All to</span>
              <div className={styles.mindSortPlaces}>
                {places.map((c) => (
                  <button key={c.id} className={`${styles.choice} ${items.every((b) => picks[b.id] === c.id) ? styles.choiceOn : ""}`} onClick={() => all(c.id)}>
                    <Emoji char={c.emoji} /> {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ol className={styles.mindSortList}>
            {items.map((b) => {
              const to = places.find((c) => c.id === picks[b.id]);
              return (
                <li key={b.id} className={`${styles.mindSortItem} ${to ? styles.mindSortDone : ""}`}>
                  <div className={styles.mindSortWhat}>
                    <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} />
                  </div>
                  <div className={styles.mindSortPlaces} role="group" aria-label={`Where ${b.title || KIND_LABEL[b.kind]} goes`}>
                    {places.map((c) => (
                      <button key={c.id} className={`${styles.choice} ${to?.id === c.id ? styles.choiceOn : ""}`} aria-pressed={to?.id === c.id} onClick={() => pick(b.id, c.id)}>
                        <Emoji char={c.emoji} /> {c.name}
                      </button>
                    ))}
                    <NewPlace chip onCreate={(name) => {
                      const c = quickCollection(name, places.length);
                      setMade((x) => [...x, c]);
                      setPicks((p) => ({ ...p, [b.id]: c.id }));
                    }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Sheet>
  );
}

/**
 * Where should this go? Sorts one thing out of Unassigned, moves items between
 * collections, and backs the chat's "Choose collection" after Save to Mind.
 * Picking a collection for a chat item teaches Mind where that chat's saves
 * belong, so the next one goes straight there.
 */
export function MoveSheet({ me, id, onClose, onMoved, title }: { me: string; id: string; onClose: () => void; onMoved?: (text: string) => void; title?: string }) {
  const { mind, update } = useMind(me);
  if (!mind) return null;
  const current = locate(mind, id);
  const b = mind.blocks[id];
  if (!b) return null;
  const sorting = !current || current.unsorted;
  const places = mind.collections.filter((c) => !isUnassigned(c));
  const move = (col: Collection, isNew = false) => {
    update((m) => {
      let next = isNew ? { ...m, collections: [...m.collections, col] } : m;
      next = place(next, id, { collectionId: col.id });
      if (b.ref && current?.collection.id !== col.id) next = learnChat(next, col.id, b.ref.chatId);
      return next;
    });
    onMoved?.(`${sorting ? "Sorted into" : "Moved to"} ${col.emoji} ${col.name}`);
  };

  return (
    <Sheet title={title ?? (sorting ? "Sort into" : "Move to")} onClose={onClose}>
      {(close) => (
        <>
          <div className={styles.mindDetail}><BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} /></div>
          <div className={styles.listGroup}>
            {places.map((c) => (
              <WhereRow
                key={c.id}
                emoji={c.emoji}
                title={c.name}
                count={c.items.length}
                on={current?.collection.id === c.id}
                onPick={() => close(() => move(c))}
              />
            ))}
            <NewPlace onCreate={(name) => close(() => move(quickCollection(name, places.length), true))} />
          </div>
        </>
      )}
    </Sheet>
  );
}
