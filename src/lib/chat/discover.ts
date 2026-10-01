import { USERS } from "./seed";
import type { Chat } from "./types";
import {
  collectionItems, isFollowingCollection, mindOf, publicBlocks, publicCollections, tagsOf, toggleSaveExploreItem, words,
  type Block, type Collection, type Mind,
} from "./mind";

/**
 * Explore's ranking: a deterministic, explainable score over everything
 * someone else has published (or an open Space you haven't joined), not a
 * re-listing of what's already yours. Every candidate keeps its own list of
 * reasons — never a bare number — so the UI can render "why" without
 * branching per card type.
 */

export type DiscoverReason =
  | { kind: "tag-match"; tag: string; collectionName: string }
  | { kind: "recent-save"; blockTitle: string }
  | { kind: "contact"; userIds: string[]; action: "saved" | "joined" | "published" }
  | { kind: "city"; city: string }
  | { kind: "language"; language: string }
  | { kind: "trending"; saves: number }
  | { kind: "fresh" };

export type Bucket = "follow" | "for-your-collections" | "spaces" | "popular" | "because-you-saved" | "trending";

interface CardBase { score: number; reasons: DiscoverReason[]; bucket: Bucket }
export type DiscoverCard =
  | (CardBase & { type: "collection"; sourceUserId: string; collectionId: string })
  | (CardBase & { type: "item"; sourceUserId: string; blockId: string })
  | (CardBase & { type: "space"; chatId: string });

const DAY = 86_400_000;

/** Tags plus name/title tokens — the same blended vocabulary `routeSave` already keys off, so under-tagged content still matches. */
function vocabOf(items: Block[], names: string[]): Set<string> {
  return new Set([...tagsOf(items), ...names.flatMap(words)]);
}
function collectionVocab(mind: Mind, c: Collection): Set<string> {
  return vocabOf(collectionItems(mind, c), [c.name, ...c.pages.map((p) => p.title)]);
}
function blockVocab(b: Block): Set<string> {
  return new Set([...b.tags, ...words(b.title)]);
}
function overlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((w) => b.has(w));
}

/** My own collections, each with its vocabulary, for tag-match scoring and naming which collection a hit is "for". */
function myCollectionVocabs(mind: Mind) {
  return mind.collections.map((c) => ({ collection: c, vocab: collectionVocab(mind, c) }));
}

/** Highest-overlap of my collections against a candidate's vocabulary, or null if nothing matches. */
function bestTagMatch(mine: { collection: Collection; vocab: Set<string> }[], candidateVocab: Set<string>) {
  let best: { collection: Collection; hits: string[] } | null = null;
  for (const m of mine) {
    const hits = overlap(candidateVocab, m.vocab);
    if (hits.length && (!best || hits.length > best.hits.length)) best = { collection: m.collection, hits };
  }
  return best;
}

function contactsOf(me: string, allChats: Chat[]): Set<string> {
  const out = new Set<string>();
  for (const chat of allChats) if (chat.memberIds.includes(me)) for (const id of chat.memberIds) if (id !== me) out.add(id);
  return out;
}

const userById = (id: string) => USERS.find((u) => u.id === id);

/**
 * Ranks every candidate — someone else's public collection/item, or an open
 * Space you haven't joined — against your own interests. `allChats` is the
 * live chat list (from `useChat().state.data.chats`), not the static seed,
 * so a just-joined Space stops showing up as joinable immediately.
 */
export function discoverFeed(me: string, allChats: Chat[], opts?: { limit?: number }): DiscoverCard[] {
  const mind = mindOf(me);
  const myUser = userById(me);
  const mine = myCollectionVocabs(mind);
  const contacts = contactsOf(me, allChats);
  const recentBlocks = Object.values(mind.blocks).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const recentVocabs = recentBlocks.map((b) => ({ block: b, vocab: blockVocab(b) }));
  const otherIds = USERS.map((u) => u.id).filter((id) => id !== me);

  // Ids are only unique within one person's Mind (each seed's `build()` counts from scratch), so a
  // "same id" check must always pair it with the source user — otherwise two different people's
  // unrelated "b1" collide.
  const alreadySavedBlockKeys = new Set(
    Object.values(mind.blocks).filter((b) => b.savedFrom).map((b) => `${b.savedFrom!.userId}:${b.savedFrom!.blockId}`),
  );
  const alreadySavedCollectionKeys = new Set(
    mind.collections.filter((c) => c.savedFrom).map((c) => `${c.savedFrom!.userId}:${c.savedFrom!.collectionId}`),
  );

  const cards: DiscoverCard[] = [];

  /** Shared scoring: tag/name overlap, recent-save overlap, contact signal, city/language, trending/fresh — same weights everywhere. */
  function score(vocab: Set<string>, savedByOrMembers: string[], sourceUserId: string | null, publishedAt: number | null, contactVerb: "saved" | "joined") {
    const reasons: DiscoverReason[] = [];
    let total = 0;

    const tag = bestTagMatch(mine, vocab);
    if (tag) { total += tag.hits.length * 4; reasons.push({ kind: "tag-match", tag: tag.hits[0], collectionName: tag.collection.name }); }

    for (const r of recentVocabs) {
      const hits = overlap(vocab, r.vocab);
      if (hits.length) { total += 3; reasons.push({ kind: "recent-save", blockTitle: r.block.title }); break; }
    }

    const contactHits = savedByOrMembers.filter((id) => contacts.has(id));
    let action: "saved" | "joined" | "published" = contactVerb;
    if (!contactHits.length && sourceUserId && contacts.has(sourceUserId)) { contactHits.push(sourceUserId); action = "published"; }
    if (contactHits.length) {
      total += Math.min(3, contactHits.length) * 2;
      reasons.push({ kind: "contact", userIds: contactHits.slice(0, 3), action });
    }

    if (sourceUserId) {
      const author = userById(sourceUserId);
      if (author?.city && myUser?.city && author.city === myUser.city) { total += 2; reasons.push({ kind: "city", city: author.city }); }
      if (author?.language && myUser?.language && author.language === myUser.language) { total += 1; reasons.push({ kind: "language", language: author.language }); }
    }

    const trendingBoost = Math.log2(savedByOrMembers.length + 1) * 1.5;
    const daysOld = publishedAt ? (Date.now() - publishedAt) / DAY : 0;
    total += trendingBoost - daysOld * 0.1;
    if (!reasons.length) {
      if (savedByOrMembers.length >= 2) reasons.push({ kind: "trending", saves: savedByOrMembers.length });
      else reasons.push({ kind: "fresh" });
    }
    return { total, reasons };
  }

  for (const { userId, collection } of publicCollections(otherIds)) {
    if (alreadySavedCollectionKeys.has(`${userId}:${collection.id}`) || isFollowingCollection(me, userId, collection.id)) continue;
    const vocab = collectionVocab(mindOf(userId), collection);
    const { total, reasons } = score(vocab, collection.public!.savedBy, userId, collection.public!.publishedAt, "saved");
    cards.push({ type: "collection", sourceUserId: userId, collectionId: collection.id, score: total, reasons, bucket: "follow" });
  }

  for (const { userId, block } of publicBlocks(otherIds)) {
    if (alreadySavedBlockKeys.has(`${userId}:${block.id}`)) continue;
    const vocab = blockVocab(block);
    const { total, reasons } = score(vocab, block.public!.savedBy, userId, block.public!.publishedAt, "saved");
    const top = reasons[0]?.kind;
    const bucket: Bucket = top === "tag-match" ? "for-your-collections" : top === "recent-save" ? "because-you-saved" : top === "contact" ? "popular" : "trending";
    cards.push({ type: "item", sourceUserId: userId, blockId: block.id, score: total, reasons, bucket });
  }

  for (const chat of allChats) {
    if (!chat.space?.open || chat.memberIds.includes(me)) continue;
    const vocab = new Set([chat.space.category, ...words(chat.name)].map((w) => w.toLowerCase()));
    let { total, reasons } = score(vocab, chat.memberIds, null, chat.space.createdAt, "joined");
    if (chat.space.city && myUser?.city && chat.space.city === myUser.city) {
      total += 2;
      reasons = [{ kind: "city", city: chat.space.city }, ...reasons];
    }
    cards.push({ type: "space", chatId: chat.id, score: total, reasons, bucket: "spaces" });
  }

  // Cap "because-you-saved" so one recent save can't dominate the whole feed.
  const becauseYouSaved = cards.filter((c) => c.bucket === "because-you-saved").sort((a, b) => b.score - a.score);
  const rest = cards.filter((c) => c.bucket !== "because-you-saved");
  const capped = [...rest, ...becauseYouSaved.slice(0, 2)];

  capped.sort((a, b) => b.score - a.score);
  return opts?.limit ? capped.slice(0, opts.limit) : capped;
}

/** One-tap save: routes into whichever of my collections best matches the item, not always "current". */
export function saveDiscoverItem(me: string, sourceUserId: string, blockId: string):
  | { status: "saved"; collectionId: string; collectionName: string }
  | { status: "removed" }
  | { status: "no-collection" } {
  const mind = mindOf(me);
  const source = mindOf(sourceUserId).blocks[blockId];
  const mine = myCollectionVocabs(mind);
  const tag = source ? bestTagMatch(mine, blockVocab(source)) : null;
  const preferred = tag?.collection.id;
  const result = toggleSaveExploreItem(me, sourceUserId, blockId, preferred);
  if (result === "no-collection") return { status: "no-collection" };
  if (result === "removed") return { status: "removed" };
  const landedId = preferred && mind.collections.some((c) => c.id === preferred) ? preferred : (mind.current ?? mind.collections[0]?.id);
  const landed = mindOf(me).collections.find((c) => c.id === landedId);
  return { status: "saved", collectionId: landedId ?? "", collectionName: landed?.name ?? "your Mind" };
}

