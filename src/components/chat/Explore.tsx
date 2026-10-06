"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import type { DiscoverCard, DiscoverReason } from "@/lib/chat/discover";
import { discoverFeed, saveDiscoverItem } from "@/lib/chat/discover";
import {
  collectionItemCount, followedCollections, isFollowingCollection, mindOf, pageItems, toggleFollowCollection,
  toggleSaveExploreCollection, useMindVersion, type Block, type Collection,
} from "@/lib/chat/mind";
import type { Attachment, Chat } from "@/lib/chat/types";
import { useChat, userById } from "@/lib/chat/store";
import Avatar from "./Avatar";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import { Photo } from "./Media";
import { Emoji } from "@/lib/chat/emoji";
import { IconBookmark, IconCheck, IconChevron, IconClock, IconGrid, IconLocation, IconPlus, IconSearch, IconSparkles, IconTag, IconUserGroup } from "./Icons";
import Logo from "./Logo";
import { relative, Sheet, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./explore.module.css";

/**
 * Explore: a discovery feed, not an archive — everything here is something
 * the user does NOT already have, ranked by `discoverFeed` (lib/chat/discover)
 * against their own collections' topics, recent saves, contacts, city and
 * language. Every card carries its own "why" and exactly one primary action
 * (Save / Follow / Join); the old kind-grouped "things you already saved"
 * sections are gone — that's what the Mind tab is for.
 */

const ago = (ts: number, now: number) => (now - ts < 60_000 ? "just now" : `${relative(now - ts)} ago`);

const LANGUAGE_NAME: Record<string, string> = { en: "English", de: "German" };

const BUCKET_LABEL: Record<DiscoverCard["bucket"], string> = {
  follow: "Collections to follow",
  "for-your-collections": "New for your collections",
  spaces: "Public Spaces to join",
  popular: "Popular with people you know",
  "because-you-saved": "Because you saved",
  trending: "Trending now",
};
const BUCKET_ORDER: DiscoverCard["bucket"][] = ["follow", "for-your-collections", "spaces", "popular", "because-you-saved", "trending"];

function reasonCopy(r: DiscoverReason): { icon: React.ReactNode; text: string } {
  switch (r.kind) {
    case "tag-match": return { icon: <IconTag size={12} />, text: `Because you collect ${r.collectionName}` };
    case "recent-save": return { icon: <IconBookmark size={12} />, text: `Because you saved ${r.blockTitle}` };
    case "contact": {
      const names = r.userIds.map((id) => userById(id).name);
      const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} more`;
      const verb = r.action === "joined" ? "joined this" : r.action === "published" ? "shared this" : "saved this";
      return { icon: <IconUserGroup size={12} />, text: `${who} ${verb}` };
    }
    case "city": return { icon: <IconLocation size={12} />, text: `Near you in ${r.city}` };
    case "language": return { icon: <IconSparkles size={12} />, text: `In ${LANGUAGE_NAME[r.language] ?? r.language}` };
    case "trending": return { icon: <IconClock size={12} />, text: `Trending · ${r.saves} people saved this` };
    case "fresh": return { icon: <IconSparkles size={12} />, text: "New" };
  }
}

/** A category's dot/icon colour, picked deterministically so it's stable across renders and reloads. */
const CATEGORY_TONES = Object.values(TONES);
function toneFor(category: string) {
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[h % CATEGORY_TONES.length];
}

/** Resolved, render-ready data for one card — computed once so both the feed and search can share it. */
interface Resolved {
  key: string;
  card: DiscoverCard;
  title: string;
  tag: string;
  cover: { image?: string; attachment?: Attachment } | null;
  emoji: string | null;
  tone: string | null;
  when: number | null;
  metaText: string;
  searchText: string;
  category: string;
}

function resolve(card: DiscoverCard, chats: Chat[]): Resolved | null {
  if (card.type === "collection") {
    const collection = mindOf(card.sourceUserId).collections.find((c) => c.id === card.collectionId);
    if (!collection?.public) return null;
    const publisher = userById(card.sourceUserId);
    return {
      key: `c-${card.sourceUserId}-${card.collectionId}`, card, title: collection.name, tag: "Folder",
      cover: collection.public.image || collection.public.attachment ? { image: collection.public.image, attachment: collection.public.attachment } : null,
      emoji: collection.emoji, tone: collection.tone, when: collection.public.publishedAt,
      metaText: `By ${publisher.name} · ${collectionItemCount(mindOf(card.sourceUserId), collection)} items`,
      searchText: `${collection.name} ${publisher.name}`.toLowerCase(),
      category: collection.public.category,
    };
  }
  if (card.type === "item") {
    const block = mindOf(card.sourceUserId).blocks[card.blockId];
    if (!block?.public) return null;
    const publisher = userById(card.sourceUserId);
    return {
      key: `b-${card.sourceUserId}-${card.blockId}`, card, title: block.title, tag: KIND_LABEL[block.kind],
      cover: { image: block.public.image, attachment: block.public.attachment }, emoji: null, tone: null,
      when: block.public.publishedAt, metaText: `By ${publisher.name}`,
      searchText: `${block.title} ${publisher.name} ${block.kind}`.toLowerCase(),
      category: block.public.category,
    };
  }
  const chat = chats.find((c) => c.id === card.chatId);
  if (!chat?.space) return null;
  return {
    key: `s-${card.chatId}`, card, title: chat.name, tag: "Space", cover: null, emoji: null, tone: null, when: null,
    metaText: `${chat.memberIds.length} ${chat.memberIds.length === 1 ? "member" : "members"}`,
    searchText: chat.name.toLowerCase(),
    category: chat.space.category,
  };
}

/** Whether `blockId` (published by `sourceUserId`) already has a saved copy in my Mind. */
function isItemSaved(me: string, sourceUserId: string, blockId: string): boolean {
  return Object.values(mindOf(me).blocks).some((b) => b.savedFrom?.userId === sourceUserId && b.savedFrom?.blockId === blockId);
}

function CoverOrTile({ cover, emoji, tone, icon }: { cover: Resolved["cover"]; emoji: string | null; tone: string | null; icon: React.ReactNode }) {
  if (cover?.attachment) return <Photo a={cover.attachment} className={s.img} />;
  if (cover?.image) {
    // eslint-disable-next-line @next/next/no-img-element -- a remote sample photo, never optimisable
    return <img src={cover.image} alt="" className={s.img} draggable={false} />;
  }
  return (
    <div className={s.tile} style={{ background: tone ? `color-mix(in srgb, ${tone} 18%, var(--surface))` : "var(--fill)" }}>
      {emoji ? <span className={s.tileEmoji}><Emoji char={emoji} /></span> : icon}
    </div>
  );
}

/** A rotating banner over the top-ranked cards that have a real cover photo — tap it to open whichever one is showing. */
function FeaturedCarousel({ items, now, onOpen }: { items: Resolved[]; now: number; onOpen: (r: Resolved) => void }) {
  const slides = items.filter((r) => r.cover).slice(0, 8);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [slides.length]);
  if (!slides.length) return null;
  const r = slides[Math.min(index, slides.length - 1)];

  return (
    <div className={s.featured}>
      <button className={s.featuredSlide} onClick={() => onOpen(r)} aria-label={r.title}>
        <CoverOrTile cover={r.cover} emoji={r.emoji} tone={r.tone} icon={<IconTag size={24} />} />
        <span className={s.featuredScrim} aria-hidden="true" />
        <span className={s.featuredTag}>{r.category}</span>
        <span className={s.featuredText}>
          <b>{r.title}</b>
          <small>{r.metaText}{r.when !== null ? ` · ${ago(r.when, now)}` : ""}</small>
        </span>
        <span className={s.featuredCta}>View</span>
      </button>
      {slides.length > 1 && (
        <div className={s.featuredDots} role="tablist" aria-label="Featured items">
          {slides.map((sl, i) => (
            <button
              key={sl.key}
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

/** Every category with something in the feed right now, plus "All" to clear the filter. */
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

function DiscoverCardView({ r, now, onOpen, onPrimaryAction, primaryOn }: {
  r: Resolved; now: number; onOpen: () => void; onPrimaryAction: () => void; primaryOn: boolean;
}) {
  const reasons = r.card.reasons.slice(0, 1).map(reasonCopy);
  const icon = r.card.type === "space" ? <IconUserGroup size={20} /> : <IconTag size={20} />;
  return (
    <div className={s.card}>
      <div className={s.imageWrap}>
        <button className={s.imageBtn} onClick={onOpen} aria-label={r.title}>
          <CoverOrTile cover={r.cover} emoji={r.emoji} tone={r.tone} icon={icon} />
        </button>
        <button
          className={`${s.saveBtn} ${primaryOn ? s.saveBtnOn : ""}`}
          onClick={onPrimaryAction}
          aria-pressed={r.card.type === "item" ? primaryOn : undefined}
          aria-label={r.card.type === "item" ? (primaryOn ? "Remove from your Mind" : "Save to your Mind") : r.card.type === "collection" ? (primaryOn ? "Following" : "Follow") : "Join"}
        >
          {r.card.type === "item" ? <IconBookmark size={15} /> : primaryOn ? <IconCheck size={15} /> : <IconPlus size={15} />}
        </button>
        {r.when !== null && <span className={s.when}>{ago(r.when, now)}</span>}
      </div>
      <button className={s.body} onClick={onOpen}>
        <div className={s.infoRow}><span className={s.tag}>{r.tag}</span></div>
        {reasons.map((rc, i) => (
          <p key={i} className={s.reasonRow}>{rc.icon}<span>{rc.text}</span></p>
        ))}
        <h4 className={s.title}>{r.title}</h4>
        <div className={s.meta}><span className={s.metaText}>{r.metaText}</span></div>
      </button>
    </div>
  );
}

/** A published folder, read-only: every page it holds, flattened. Following or copying it (from Explore) is how it becomes yours. */
export function CollectionViewSheet({ userId, collection, me, following, onClose, onToggleFollow, onCopy }: {
  userId: string; collection: Collection; me: string; following: boolean;
  onClose: () => void; onToggleFollow: () => void; onCopy: () => void;
}) {
  const mind = mindOf(userId);
  const publisher = userById(userId);
  const mine = userId === me;
  return (
    <Sheet title={collection.name} onClose={onClose}>
      <div className={styles.actionRow}>
        <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${collection.tone} 16%, transparent)` }}>
          <Emoji char={collection.emoji} />
        </span>
        <span className={styles.contactText}>
          <b>{collection.name}</b>
          <small>{collection.savedFrom ? `Saved from ${userById(collection.savedFrom.userId).name}` : `Published by ${mine ? "you" : publisher.name}`}</small>
        </span>
      </div>
      {!mine && (
        <div className={s.sheetActions}>
          <button className={styles.secondaryWide} onClick={onToggleFollow}>{following ? "Following" : "Follow"}</button>
          <button className={styles.primaryWide} onClick={onCopy}>Copy to Mind</button>
        </div>
      )}
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

function FollowingSheet({ me, onClose, onOpenCollection }: { me: string; onClose: () => void; onOpenCollection: (userId: string, collection: Collection) => void }) {
  const follows = followedCollections(me);
  const rows = follows
    .map((f) => ({ f, collection: mindOf(f.sourceUserId).collections.find((c) => c.id === f.collectionId) }))
    .filter((r): r is { f: typeof follows[number]; collection: Collection } => !!r.collection);
  return (
    <Sheet title="Following" onClose={onClose}>
      {rows.length === 0 ? (
        <p className={styles.emptyInbox}>Nothing followed yet. Follow a collection from Explore and it shows up here.</p>
      ) : (
        <div className={styles.mindRows}>
          {rows.map(({ f, collection }) => (
            <button key={f.collectionId} className={styles.mindTileBtn} onClick={() => onOpenCollection(f.sourceUserId, collection)}>
              <span className={styles.actionRow}>
                <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${collection.tone} 16%, transparent)` }}>
                  <Emoji char={collection.emoji} />
                </span>
                <span className={styles.contactText}>
                  <b>{collection.name}</b>
                  <small>By {userById(f.sourceUserId).name}</small>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export default function ExploreTab({ onOpenChat }: { onOpenChat: (chat: Chat, messageId?: string) => void }) {
  const { me, state, joinSpace } = useChat();
  const meUser = userById(me);
  const version = useMindVersion();
  const now = useNow(60_000);
  const [detailBlock, setDetailBlock] = useState<{ userId: string; block: Block } | null>(null);
  const [detailCollection, setDetailCollection] = useState<{ userId: string; collection: Collection } | null>(null);
  const [showFollowing, setShowFollowing] = useState(false);
  const [expanded, setExpanded] = useState<Set<DiscoverCard["bucket"]>>(new Set());
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const flash = useCallback((text: string) => {
    const id = Date.now();
    setToast({ text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 1800);
  }, []);

  // `version` bumps on any publish, save, follow or unfollow, by anyone — that's the point of depending on it here.
  const resolved = useMemo(() => {
    void version;
    const cards = discoverFeed(me, state.data.chats);
    return cards.map((c) => resolve(c, state.data.chats)).filter((r): r is Resolved => !!r);
  }, [version, me, state.data.chats]);

  const followCount = followedCollections(me).length;
  const coldStart = mindOf(me).collections.length === 0;

  const categoryList = useMemo(() => [...new Set(resolved.map((r) => r.category))].sort(), [resolved]);

  const q = query.trim().toLowerCase();
  const visible = resolved.filter((r) =>
    (!categoryFilter || r.category === categoryFilter) && (!q || r.searchText.includes(q)));

  const sections = BUCKET_ORDER.map((bucket) => ({ bucket, label: BUCKET_LABEL[bucket], items: visible.filter((r) => r.card.bucket === bucket) }))
    .filter((sec) => sec.items.length > 0);

  const openCard = (r: Resolved) => {
    const card = r.card;
    if (card.type === "collection") {
      const collection = mindOf(card.sourceUserId).collections.find((c) => c.id === card.collectionId);
      if (collection) setDetailCollection({ userId: card.sourceUserId, collection });
      return;
    }
    if (card.type === "item") {
      const block = mindOf(card.sourceUserId).blocks[card.blockId];
      if (!block) return;
      if (block.url) { window.open(block.url, "_blank", "noopener"); return; }
      setDetailBlock({ userId: card.sourceUserId, block });
      return;
    }
    // Space: browsing from the feed opens the same detail as tapping "Join" would confirm — a preview, not a join.
  };

  const primaryAction = (r: Resolved) => {
    if (r.card.type === "item") {
      const result = saveDiscoverItem(me, r.card.sourceUserId, r.card.blockId);
      if (result.status === "no-collection") flash("Make a collection in Mind first");
      else if (result.status === "saved") flash(`Saved to ${result.collectionName}`);
      else flash("Removed from your Mind");
      return;
    }
    if (r.card.type === "collection") {
      const result = toggleFollowCollection(me, r.card.sourceUserId, r.card.collectionId);
      flash(result === "followed" ? "Following — new items show up here, not copied to Mind" : "Unfollowed");
      return;
    }
    const chat = joinSpace(r.card.chatId);
    if (chat) { flash(`Joined ${chat.name}`); onOpenChat(chat); }
  };

  const total = resolved.length;

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
              <span>{total ? "New things worth your time" : "Discover public spaces and people on NOD"}</span>
            </div>
          </div>
          {followCount > 0 && (
            <button className={s.followingChip} onClick={() => setShowFollowing(true)}>Following {followCount}</button>
          )}
        </div>
        <label className={styles.searchBar}>
          <IconSearch size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Explore..." />
        </label>
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll}>
          {total === 0 ? (
            <div className={styles.mindStarter}>
              <Logo size={36} />
              <h2>Nothing public yet</h2>
              <p>Once anyone publishes a collection or a Space opens up, new things worth your time show up here.</p>
            </div>
          ) : (
            <>
              {/* <FeaturedCarousel items={resolved} now={now} onOpen={openCard} /> */}
              <CategoryRow categories={categoryList} active={categoryFilter} onPick={setCategoryFilter} />
              {coldStart && (
                <p className={s.coldPrompt}>Make a collection in Mind and picks made for you start showing up here.</p>
              )}
              {sections.length === 0 && <p className={styles.emptyInbox}>{`Nothing matches "${query}".`}</p>}
              {sections.map((sec) => {
                const isOpen = expanded.has(sec.bucket);
                return (
                <section key={sec.bucket} className={s.section}>
                  <div className={s.sectionHead}>
                    <b>{sec.label}</b>
                    {sec.items.length > 2 && (
                      <button
                        className={s.seeAll}
                        onClick={() => setExpanded((set) => { const next = new Set(set); if (next.has(sec.bucket)) next.delete(sec.bucket); else next.add(sec.bucket); return next; })}
                      >
                        {isOpen ? "Show less" : "See all"}
                        <IconChevron size={12} />
                      </button>
                    )}
                  </div>
                  <div className={isOpen ? s.grid : s.row}>
                    {sec.items.map((r) => (
                      <DiscoverCardView
                        key={r.key}
                        r={r}
                        now={now}
                        onOpen={() => openCard(r)}
                        onPrimaryAction={() => primaryAction(r)}
                        primaryOn={
                          r.card.type === "collection" ? isFollowingCollection(me, r.card.sourceUserId, r.card.collectionId)
                          : r.card.type === "item" ? isItemSaved(me, r.card.sourceUserId, r.card.blockId)
                          : false
                        }
                      />
                    ))}
                  </div>
                </section>
                );
              })}
            </>
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
        <CollectionViewSheet
          userId={detailCollection.userId}
          collection={detailCollection.collection}
          me={me}
          following={isFollowingCollection(me, detailCollection.userId, detailCollection.collection.id)}
          onClose={() => setDetailCollection(null)}
          onToggleFollow={() => {
            const result = toggleFollowCollection(me, detailCollection.userId, detailCollection.collection.id);
            flash(result === "followed" ? "Following — new items show up here, not copied to Mind" : "Unfollowed");
          }}
          onCopy={() => {
            const result = toggleSaveExploreCollection(me, detailCollection.userId, detailCollection.collection.id);
            flash(result === "saved" ? "Copied to your Mind" : "Removed from your Mind");
            setDetailCollection(null);
          }}
        />
      )}
      {showFollowing && (
        <FollowingSheet
          me={me}
          onClose={() => setShowFollowing(false)}
          onOpenCollection={(userId, collection) => { setShowFollowing(false); setDetailCollection({ userId, collection }); }}
        />
      )}

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong}`} role="status">
          <span className={styles.toastText}>{toast.text}</span>
        </div>
      )}
    </>
  );
}
