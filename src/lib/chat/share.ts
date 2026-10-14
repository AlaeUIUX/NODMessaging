import {
  isUnassigned, makeCollection, mindOf, newId, place, updateMind,
  type Block, type Collection, type Mind, type ShareRole, type Sharing,
} from "./mind";
import type { Card } from "./types";

/**
 * Sharing from Mind, the way Drive shares a file. A collection (or one item
 * in it) goes to specific people, each of whom can view or edit, or to
 * anyone with the link; people it's shared with can also make their own
 * copy. Whatever is shared stays its owner's: a share card in a chat is a
 * pointer, and always shows the thing as it is now, to whoever may see it.
 *
 * Everything here reads and writes the owner's Mind in this browser's store.
 * With a server these would be calls that check the same rules.
 */

/** A shared thing: a whole collection, or one item in it. */
export interface ShareRef { owner: string; collectionId: string; blockId?: string }

/** What you may do with something: it's yours, you may change it, or you may look. */
export type Access = "owner" | ShareRole | null;

export const NO_SHARING: Sharing = { link: "off", people: {}, emails: {}, copy: true, requests: [] };

export const refOf = (card: Extract<Card, { type: "mind" }>): ShareRef => ({ owner: card.owner, collectionId: card.collectionId, blockId: card.blockId });

/** The thing a reference points at, in its owner's Mind as it is now. Null when it's gone. */
export function resolveShare(mind: Mind | null, ref: ShareRef) {
  const collection = mind?.collections.find((c) => c.id === ref.collectionId);
  if (!mind || !collection) return null;
  if (!ref.blockId) return { mind, collection, block: null };
  const block = mind.blocks[ref.blockId];
  // An item moved to another collection of the owner's is still the same item. One waiting in
  // Unassigned isn't shared at all: that's the owner's inbox.
  const home = block ? mind.collections.find((c) => !isUnassigned(c) && c.items.includes(block.id)) : null;
  return block && home ? { mind, collection: home, block } : null;
}
export type Shared = NonNullable<ReturnType<typeof resolveShare>>;

/**
 * The settings of the thing itself: the item's own, or the collection's. An
 * item without settings of its own yet follows its collection on copying, so
 * giving someone access to one item doesn't quietly allow copies again.
 */
export function sharingOf(s: Shared): Sharing {
  const collection = { ...NO_SHARING, ...s.collection.sharing };
  return s.block ? { ...NO_SHARING, copy: collection.copy, ...s.block.sharing } : collection;
}

/** Whether people may copy it: an item shared on its own decides for itself, else its collection does. Saves from chats never travel. */
export const copyAllowed = (s: Shared) => sharingOf(s).copy && s.block?.kind !== "chat";

const rank = (a: Access) => (a === "owner" ? 3 : a === "edit" ? 2 : a === "view" ? 1 : 0);
const best = (...xs: Access[]) => xs.reduce<Access>((acc, x) => (rank(x) > rank(acc) ? x : acc), null);

function grantedBy(sharing: Sharing | undefined, me: string): Access {
  if (!sharing) return null;
  return best(sharing.people[me] ?? null, sharing.link === "off" ? null : sharing.link);
}

/**
 * What `me` may do with what `ref` points at. The owner owns; anyone else
 * gets the best of being named, of the link (a share card carries it), and,
 * for an item, of the whole collection it's in being shared.
 */
export function accessOf(ref: ShareRef, s: Shared, me: string): Access {
  if (me === ref.owner) return "owner";
  return best(grantedBy(s.block?.sharing, me), grantedBy(s.collection.sharing, me));
}

/** Looks a share up in its owner's Mind as stored right now. */
export const lookUp = (ref: ShareRef) => resolveShare(mindOf(ref.owner), ref);

/** Who it's shared with, in a few words: "Only you", "Charles and 2 others", "Anyone with the link". */
export function audienceLabel(sharing: Sharing, name: (id: string) => string) {
  const people = Object.keys(sharing.people);
  const emails = Object.keys(sharing.emails);
  if (sharing.link !== "off") return `Anyone with the link can ${sharing.link}`;
  const count = people.length + emails.length;
  if (!count) return "Only you";
  const first = people[0] ? name(people[0]) : emails[0];
  return count === 1 ? `Shared with ${first}` : `Shared with ${first} and ${count - 1} ${count === 2 ? "other" : "others"}`;
}

/* ---------------------------------------------------------------------------
   Changing who has access (the owner), and asking for it (anyone else)
--------------------------------------------------------------------------- */

/** Changes the sharing of the thing a reference points at, in its owner's Mind. */
export function updateSharing(ref: ShareRef, fn: (s: Sharing) => Sharing) {
  updateMind(ref.owner, (m) => {
    const s = resolveShare(m, ref);
    if (!s) return m;
    if (s.block) {
      const block: Block = { ...s.block, sharing: fn(sharingOf(s)) };
      return { ...m, blocks: { ...m.blocks, [block.id]: block } };
    }
    return { ...m, collections: m.collections.map((c) => (c.id === s.collection.id ? { ...c, sharing: fn({ ...NO_SHARING, ...c.sharing }) } : c)) };
  });
}

/** Gives people a role, unless they already have that or more (a request they made is answered by it). */
export function grant(ref: ShareRef, userIds: string[], role: ShareRole) {
  updateSharing(ref, (s) => {
    const people = { ...s.people };
    userIds.filter((id) => id !== ref.owner).forEach((id) => { if (rank(people[id] ?? null) < rank(role)) people[id] = role; });
    return { ...s, people, requests: s.requests.filter((r) => !userIds.includes(r.userId) || rank(people[r.userId]) < rank(r.role)) };
  });
}

/** The owner sets (or with null, removes) one person's role; a request it answers goes with it. */
export function setRole(ref: ShareRef, userId: string, role: ShareRole | null) {
  updateSharing(ref, (s) => {
    const people = { ...s.people };
    if (role) people[userId] = role; else delete people[userId];
    return { ...s, people, requests: role ? s.requests.filter((r) => r.userId !== userId || rank(role) < rank(r.role)) : s.requests };
  });
}

export function requestAccess(ref: ShareRef, userId: string, role: ShareRole) {
  updateSharing(ref, (s) => ({ ...s, requests: [...s.requests.filter((r) => r.userId !== userId), { userId, role, at: Date.now() }] }));
}
export function withdrawRequest(ref: ShareRef, userId: string) {
  updateSharing(ref, (s) => ({ ...s, requests: s.requests.filter((r) => r.userId !== userId) }));
}
/** The owner allows a request (with the role asked for, never less than they have) or declines it. */
export function answerRequest(ref: ShareRef, userId: string, allow: boolean) {
  updateSharing(ref, (s) => {
    const r = s.requests.find((x) => x.userId === userId);
    const people = allow && r ? { ...s.people, [userId]: best(s.people[userId] ?? null, r.role) as ShareRole } : s.people;
    return { ...s, people, requests: s.requests.filter((x) => x.userId !== userId) };
  });
}

/* ---------------------------------------------------------------------------
   Links: nod.app/m/<token> (here ?mind=<token>)
--------------------------------------------------------------------------- */

export const shareToken = (ref: ShareRef) => [ref.owner, ref.collectionId, ref.blockId].filter(Boolean).join("~");
export function parseShareToken(token: string): ShareRef | null {
  const [owner, collectionId, blockId] = token.split("~");
  return owner && collectionId ? { owner, collectionId, blockId: blockId || undefined } : null;
}
export function shareLink(ref: ShareRef) {
  const base = typeof window === "undefined" ? "https://nod-messaging.vercel.app/" : `${window.location.origin}${window.location.pathname}`;
  return `${base}?mind=${encodeURIComponent(shareToken(ref))}`;
}

/* ---------------------------------------------------------------------------
   Copies: a whole collection into your Mind, or one item into a collection
--------------------------------------------------------------------------- */

/** A copy of an item, new and yours: none of the original's sharing comes along. */
const copyOf = (b: Block): Block => {
  const out: Block = { ...b, id: newId(), createdAt: Date.now(), updatedAt: undefined };
  delete out.sharing;
  return out;
};

/** The copy of a shared collection someone already made, if they did. */
export const copyIn = (mind: Mind | null, ref: ShareRef) => mind?.collections.find((c) => c.from?.id === `share:${shareToken(ref)}`) ?? null;

/**
 * Copies a shared collection into `to`'s Mind: every item (tags and all) and
 * its layout, all theirs to change. Saves from chats stay behind: they point
 * at messages the copy's owner may not be part of. Returns the new collection.
 */
export function cloneCollection(ref: ShareRef, to: string): Collection | null {
  const s = lookUp(ref);
  if (!s) return null;
  const { mind: from, collection: src } = s;
  const blocks: Record<string, Block> = {};
  const keep = (ids: string[]) => ids.flatMap((id) => {
    const b = from.blocks[id];
    if (!b || b.kind === "chat") return [];
    const copy = copyOf(b);
    blocks[copy.id] = copy;
    return [copy.id];
  });
  const col: Collection = {
    ...makeCollection(src.name, src.emoji, src.tone),
    items: keep(src.items), view: src.view,
    from: { id: `share:${shareToken(ref)}`, by: ref.owner },
  };
  updateMind(to, (m) => ({ ...m, blocks: { ...m.blocks, ...blocks }, collections: [...m.collections, col] }));
  return col;
}

/** Copies one shared item to the top of one of your collections. Returns the new item's id. */
export function copyItem(ref: ShareRef, to: string, collectionId: string) {
  const s = lookUp(ref);
  // A save from a chat stays behind, as it does when a whole collection is copied.
  if (!s?.block || s.block.kind === "chat") return null;
  const copy = copyOf(s.block);
  updateMind(to, (m) => place({ ...m, blocks: { ...m.blocks, [copy.id]: copy } }, copy.id, { collectionId }));
  return copy.id;
}

/** A collection for things shared with you, made the first time it's needed. */
export function sharedWithYou(me: string) {
  const mind = mindOf(me);
  const existing = mind.collections.find((c) => c.from?.id === "shared-with-you");
  if (existing) return existing.id;
  const col: Collection = { ...makeCollection("Shared with you", "📥", "#3E67A6"), from: { id: "shared-with-you", by: me } };
  updateMind(me, (m) => ({ ...m, collections: [...m.collections, col] }));
  return col.id;
}
