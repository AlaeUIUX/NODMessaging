"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Attachment } from "@/lib/chat/types";
import { initials, TONES } from "@/lib/chat/avatar";
import {
  mindOf, pageItems, publicBlocks, publicCollections, toggleSaveExploreCollection, toggleSaveExploreItem, useMindVersion,
  type Block, type Collection,
} from "@/lib/chat/mind";
import { USERS } from "@/lib/chat/seed";
import { useChat, userById } from "@/lib/chat/store";
import Avatar from "./Avatar";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import { Photo } from "./Media";
import { Emoji } from "@/lib/chat/emoji";
import { IconBookmark, IconChevron, IconGrid, IconSearch, IconTag } from "./Icons";
import Logo from "./Logo";
import { relative, Sheet, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./explore.module.css";

/** A category's dot/icon colour, picked deterministically so it's stable across renders and reloads. */
const CATEGORY_TONES = Object.values(TONES);
function toneFor(category: string) {
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[h % CATEGORY_TONES.length];
}

/**
 * Explore: anything published from anyone's Mind, across the whole cast —
 * a single item, or a whole folder — grouped into horizontally-scrolling
 * sections (a "See all" expands one to a grid), styled after a discovery
 * feed: a big cover photo with a quiet save button, a kind tag and a
 * timestamp under it, the title, then who shared it and who else saved it.
 */

const SECTION_ORDER: Block["kind"][] = [
  "image", "link", "book", "video", "quote", "flashcard", "note", "amount", "date", "progress", "habit", "palette", "file",
];

/** Both a published block and a published folder render the same card — this is the shape it needs. */
interface Entry {
  userId: string;
  target: { kind: "block"; id: string } | { kind: "collection"; id: string };
  title: string;
  tag: string;
  category: string;
  cover: { image?: string; attachment?: Attachment };
  publishedAt: number;
  savedBy: string[];
}

const ago = (ts: number, now: number) => (now - ts < 60_000 ? "just now" : `${relative(now - ts)} ago`);

function CoverPhoto({ cover }: { cover: Entry["cover"] }) {
  if (cover.attachment) return <Photo a={cover.attachment} className={s.img} />;
  // eslint-disable-next-line @next/next/no-img-element -- a remote sample photo, never optimisable
  return <img src={cover.image} alt="" className={s.img} draggable={false} />;
}

/** A rotating banner for a handful of recent items — tap it to open whichever one is showing. */
function FeaturedCarousel({ entries, now, onOpen }: { entries: Entry[]; now: number; onOpen: (entry: Entry) => void }) {
  const slides = entries.slice(0, 8);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [slides.length]);
  if (!slides.length) return null;
  const entry = slides[Math.min(index, slides.length - 1)];
  const publisher = userById(entry.userId);

  return (
    <div className={s.featured}>
      <button className={s.featuredSlide} onClick={() => onOpen(entry)} aria-label={entry.title}>
        <CoverPhoto cover={entry.cover} />
        <span className={s.featuredScrim} aria-hidden="true" />
        <span className={s.featuredTag}>{entry.category}</span>
        <span className={s.featuredText}>
          <b>{entry.title}</b>
          <small>By {publisher.name} · {ago(entry.publishedAt, now)}</small>
        </span>
        <span className={s.featuredCta}>View</span>
      </button>
      {slides.length > 1 && (
        <div className={s.featuredDots} role="tablist" aria-label="Featured items">
          {slides.map((sl, i) => (
            <button
              key={`${sl.target.kind}-${sl.target.id}`}
              role="tab"
              aria-selected={i === index}
              aria-label={`Featured item ${i + 1}`}
              className={i === index ? s.featuredDotOn : s.featuredDot}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Every category with something published right now, plus "All" to clear the filter. */
function CategoryRow({ categories, active, onPick }: { categories: string[]; active: string | null; onPick: (c: string | null) => void }) {
  return (
    <div className={s.catRow}>
      <button className={s.catTile} onClick={() => onPick(null)} aria-pressed={active === null}>
        <span className={`${s.catIcon} ${active === null ? s.catIconOn : ""}`}><IconGrid size={18} /></span>
        <span className={s.catLabel}>All</span>
      </button>
      {categories.map((c) => (
        <button key={c} className={s.catTile} onClick={() => onPick(active === c ? null : c)} aria-pressed={active === c}>
          <span
            className={`${s.catIcon} ${active === c ? s.catIconOn : ""}`}
            style={{ "--tone": toneFor(c) } as React.CSSProperties}
          >
            <IconTag size={18} />
          </span>
          <span className={s.catLabel}>{c}</span>
        </button>
      ))}
    </div>
  );
}

function ExploreCard({ entry, me, now, onOpen, onSave }: { entry: Entry; me: string; now: number; onOpen: () => void; onSave: () => void }) {
  const publisher = userById(entry.userId);
  const mine = entry.userId === me;
  const saved = entry.savedBy.includes(me);
  // "You" already shows via the bookmark itself — the face-pile is who *else* saved it.
  const others = entry.savedBy.filter((id) => id !== me);
  const faces = others.slice(0, 3);
  return (
    <div className={s.card}>
      <div className={s.imageWrap}>
        <button className={s.imageBtn} onClick={onOpen} aria-label={entry.title}>
          <CoverPhoto cover={entry.cover} />
        </button>
        {!mine && (
          <button
            className={`${s.saveBtn} ${saved ? s.saveBtnOn : ""}`}
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? "Remove from your Mind" : "Save to your Mind"}
          >
            <IconBookmark size={15} />
          </button>
        )}
      </div>
      <button className={s.body} onClick={onOpen}>
        <div className={s.infoRow}>
          <span className={s.tag}>{entry.tag}</span>
          <span className={s.when}>{ago(entry.publishedAt, now)}</span>
        </div>
        <p className={s.category}>{entry.category}</p>
        <h4 className={s.title}>{entry.title}</h4>
        <div className={s.meta}>
          <span className={s.metaLeft}>
            <Avatar glyph={initials(publisher.fullName)} tone={publisher.tone} size={18} shape="circle" />
            <span className={s.metaText}>{mine ? "You" : publisher.name}</span>
          </span>
          {faces.length > 0 && (
            <div className={s.faces}>
              {faces.map((id) => {
                const u = userById(id);
                return <Avatar key={id} glyph={initials(u.fullName)} tone={u.tone} size={18} shape="circle" />;
              })}
              {others.length > 3 && <em>+{others.length - 3}</em>}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

/** A published folder, read-only: every page it holds, flattened. Saving it (from Explore) is what makes you an editable copy. */
function CollectionViewSheet({ userId, collection, onClose }: { userId: string; collection: Collection; onClose: () => void }) {
  const mind = mindOf(userId);
  const publisher = userById(userId);
  return (
    <Sheet title={collection.name} onClose={onClose}>
      <div className={styles.actionRow}>
        <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${collection.tone} 16%, transparent)` }}>
          <Emoji char={collection.emoji} />
        </span>
        <span className={styles.contactText}>
          <b>{collection.name}</b>
          <small>Published by {publisher.name}</small>
        </span>
      </div>
      {collection.pages.map((page) => {
        const blocks = pageItems(mind, page);
        if (!blocks.length) return null;
        return (
          <div key={page.id}>
            <p className={styles.sheetLabel}><Emoji char={page.emoji} /> {page.title}</p>
            <div className={styles.mindRows}>
              {blocks.map((b) => (
                <div key={b.id} className={styles.mindTileBtn}>
                  <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}

export default function ExploreTab() {
  const { me } = useChat();
  const meUser = userById(me);
  const version = useMindVersion();
  const now = useNow(60_000);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailBlock, setDetailBlock] = useState<{ userId: string; block: Block } | null>(null);
  const [detailCollection, setDetailCollection] = useState<{ userId: string; collection: Collection } | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const flash = useCallback((text: string) => {
    const id = Date.now();
    setToast({ text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 1800);
  }, []);

  // `version` bumps on any publish, unpublish or save, by anyone — that's the point of depending on it here.
  const { blockEntries, collectionEntries } = useMemo(() => {
    void version;
    const ids = USERS.map((u) => u.id);
    const blockEntries: Entry[] = publicBlocks(ids).map(({ userId, block }) => ({
      userId, target: { kind: "block", id: block.id }, title: block.title, tag: KIND_LABEL[block.kind], category: block.public!.category,
      cover: { image: block.public!.image, attachment: block.public!.attachment }, publishedAt: block.public!.publishedAt, savedBy: block.public!.savedBy,
    }));
    const collectionEntries: Entry[] = publicCollections(ids).map(({ userId, collection }) => ({
      userId, target: { kind: "collection", id: collection.id }, title: collection.name, tag: "Folder", category: collection.public!.category,
      cover: { image: collection.public!.image, attachment: collection.public!.attachment }, publishedAt: collection.public!.publishedAt, savedBy: collection.public!.savedBy,
    }));
    return { blockEntries, collectionEntries };
  }, [version]);

  const total = blockEntries.length + collectionEntries.length;
  const allEntries = useMemo(
    () => [...blockEntries, ...collectionEntries].sort((a, b) => b.publishedAt - a.publishedAt),
    [blockEntries, collectionEntries],
  );
  const categoryList = useMemo(() => [...new Set(allEntries.map((e) => e.category))].sort(), [allEntries]);

  const q = query.trim().toLowerCase();
  const matches = (e: Entry) =>
    (!categoryFilter || e.category === categoryFilter)
    && (!q || e.title.toLowerCase().includes(q) || userById(e.userId).name.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
  const visibleCollections = collectionEntries.filter(matches);
  const visibleBlocks = blockEntries.filter(matches);

  const sections = [
    { kind: "__collections", label: "Folders", items: visibleCollections },
    ...SECTION_ORDER.map((kind) => ({ kind, label: `${KIND_LABEL[kind]}s`, items: visibleBlocks.filter((e) => e.target.kind === "block" && KIND_LABEL[kind] === e.tag) })),
  ].filter((sec) => sec.items.length > 0);

  const openItem = (entry: Entry) => {
    if (entry.target.kind === "collection") {
      const collection = mindOf(entry.userId).collections.find((c) => c.id === entry.target.id);
      if (collection) setDetailCollection({ userId: entry.userId, collection });
      return;
    }
    const block = mindOf(entry.userId).blocks[entry.target.id];
    if (!block) return;
    if (block.url) { window.open(block.url, "_blank", "noopener"); return; }
    setDetailBlock({ userId: entry.userId, block });
  };

  const save = (entry: Entry) => {
    const result = entry.target.kind === "collection"
      ? toggleSaveExploreCollection(me, entry.userId, entry.target.id)
      : toggleSaveExploreItem(me, entry.userId, entry.target.id);
    if (result === "no-collection") flash("Make a collection in Mind first");
    else flash(result === "saved" ? "Saved to your Mind" : "Removed from your Mind");
  };

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
              <b>Explore</b>
              <span>{total ? `${total} public item${total === 1 ? "" : "s"}` : "Discover public spaces and people on NOD"}</span>
            </div>
          </div>
        </div>
        {total > 0 && (
          <label className={styles.searchBar}>
            <IconSearch size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Explore..." />
          </label>
        )}
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll}>
          {total === 0 ? (
            <div className={styles.mindStarter}>
              <Logo size={36} />
              <h2>Nothing public yet</h2>
              <p>Publish an item — or a whole folder — from Mind, pick a cover photo, and anyone can find it here.</p>
            </div>
          ) : (
            <>
              <FeaturedCarousel entries={allEntries} now={now} onOpen={openItem} />
              <CategoryRow categories={categoryList} active={categoryFilter} onPick={setCategoryFilter} />
              {sections.length === 0 && (
                <p className={styles.emptyInbox}>{q ? `Nothing matches "${query}".` : `Nothing in ${categoryFilter} yet.`}</p>
              )}
            </>
          )}
          {sections.length > 0 && (
            sections.map((sec) => {
              const isOpen = expanded.has(sec.kind);
              return (
                <section key={sec.kind} className={s.section}>
                  <div className={s.sectionHead}>
                    <b>{sec.label}</b>
                    <button
                      className={s.seeAll}
                      onClick={() => setExpanded((set) => { const next = new Set(set); if (next.has(sec.kind)) next.delete(sec.kind); else next.add(sec.kind); return next; })}
                    >
                      {isOpen ? "Show less" : "See all"}
                      <IconChevron size={12} />
                    </button>
                  </div>
                  <div className={isOpen ? s.grid : s.row}>
                    {sec.items.map((entry) => (
                      <ExploreCard
                        key={`${entry.target.kind}-${entry.target.id}`}
                        entry={entry}
                        me={me}
                        now={now}
                        onOpen={() => openItem(entry)}
                        onSave={() => save(entry)}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>

      {detailBlock && (
        <Sheet title={KIND_LABEL[detailBlock.block.kind]} onClose={() => setDetailBlock(null)}>
          <div className={styles.mindDetail}><BlockView block={detailBlock.block} shape="detail" /></div>
          <div className={s.meta}>
            <Avatar glyph={initials(userById(detailBlock.userId).fullName)} tone={userById(detailBlock.userId).tone} size={20} shape="circle" />
            <span className={s.metaText}>Published by {detailBlock.userId === me ? "you" : userById(detailBlock.userId).name}</span>
          </div>
        </Sheet>
      )}
      {detailCollection && (
        <CollectionViewSheet userId={detailCollection.userId} collection={detailCollection.collection} onClose={() => setDetailCollection(null)} />
      )}

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong}`} role="status">
          <span className={styles.toastText}>{toast.text}</span>
        </div>
      )}
    </>
  );
}
