import {
  blankPage, childrenOf, makeCollection, newId, pageItems, peopleMinds, place, rootItems,
  type Block, type BlockKind, type Collection, type Mind, type MindView, type Page,
} from "./mind";
import { groupInfo } from "./groups";
import type { AvatarTone, Chat } from "./types";

/**
 * Explore: what's public on NOD, ranked for you. Collections other people
 * made, what your friends have been saving and joining, and groups that fit
 * what you keep. The "algorithm" is plain and local: words from your Mind
 * (collection names weigh most), your groups and your friends become topic
 * weights, and everything public is scored against them, with a nudge for
 * friends and for popular things. Every card says why it's there.
 */

export type Topic =
  | "german" | "language" | "travel" | "vienna" | "design" | "work" | "home" | "plants"
  | "coffee" | "food" | "hiking" | "startups" | "reading";

export const TOPIC_LABEL: Record<Topic, string> = {
  german: "German", language: "Languages", travel: "Travel", vienna: "Vienna", design: "Design", work: "Work",
  home: "Home", plants: "Plants", coffee: "Coffee", food: "Food", hiking: "Hiking", startups: "Startups", reading: "Reading",
};

const TOPIC_WORDS: Record<Topic, string[]> = {
  german: ["german", "deutsch", "vocab", "grammar", "verb", "verbs", "flashcard", "goethe", "dative", "separable", "gemütlich"],
  language: ["language", "languages", "vocab", "grammar", "tandem", "words", "listening", "phrases"],
  travel: ["trip", "trips", "travel", "weekend", "holiday", "train", "flight", "lisbon", "ideas"],
  vienna: ["vienna", "wien", "austria", "naschmarkt"],
  design: ["design", "type", "figma", "moodboard", "palette", "inbox", "brand", "redesign", "website", "ui"],
  work: ["work", "launch", "client", "clients", "project", "invoice", "invoices", "board", "admin", "spaces", "ios", "app"],
  home: ["home", "living", "bedroom", "room", "house", "sofa", "interior", "dream", "furniture"],
  plants: ["plant", "plants", "monstera", "garden", "jungle"],
  coffee: ["coffee", "café", "cafe", "espresso"],
  food: ["food", "lunch", "recipe", "recipes", "ramen", "cook", "cooking", "dinner"],
  hiking: ["hike", "hiking", "alps", "mountain", "mountains", "trail"],
  startups: ["startup", "founder", "founders", "investor", "pitch", "launch", "pricing"],
  reading: ["book", "books", "read", "reading", "library"],
};

/* ---------------------------------------------------------------------------
   Who made things: people on NOD (the demo's users) and people you don't know yet
--------------------------------------------------------------------------- */

export interface Stranger { id: string; name: string; username: string; tone: AvatarTone }
export const STRANGERS: Stranger[] = [
  { id: "lena", name: "Lena Vogt", username: "lenavogt", tone: "sage" },
  { id: "tomas", name: "Tomás Rivera", username: "tomas", tone: "clay" },
  { id: "aiko", name: "Aiko Tanaka", username: "aiko", tone: "plum" },
  { id: "nadia", name: "Nadia Haddad", username: "nadiacooks", tone: "ochre" },
];

/* ---------------------------------------------------------------------------
   Public collections
--------------------------------------------------------------------------- */

export type PublicItem = Omit<Block, "createdAt" | "tags">;
export interface PublicStack { title: string; emoji: string; view: MindView; defaultKind: BlockKind; items: PublicItem[] }
export interface PublicCollection {
  id: string;
  name: string;
  emoji: string;
  /** A hex colour, like a Mind collection's. */
  tone: string;
  cover: string;
  by: string;
  description: string;
  topics: Topic[];
  saves: number;
  updatedAt: number;
  stacks: PublicStack[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const pic = (q: string, w = 700) => `https://images.unsplash.com/${q}?w=${w}&q=70&fm=jpg`;
let n = 0;
const it = (col: string, item: Omit<PublicItem, "id">): PublicItem => ({ ...item, id: `${col}:${++n}` });
const fc = (col: string, front: string, back: string): PublicItem => it(col, { kind: "flashcard", title: front, back });
const link = (col: string, title: string, source: string, note?: string): PublicItem => it(col, { kind: "link", title, source, url: `https://${source}`, ...(note ? { note } : {}) });
const img = (col: string, q: string, title: string): PublicItem => it(col, { kind: "image", title, image: pic(q), source: "Explore" });
const note = (col: string, title: string, body: string): PublicItem => it(col, { kind: "note", title, body });
const todo = (col: string, title: string): PublicItem => it(col, { kind: "todo", title });
const book = (col: string, title: string, source: string): PublicItem => it(col, { kind: "book", title, source, shelf: "want" });

const now = Date.now();

export const PUBLIC_COLLECTIONS: PublicCollection[] = [
  {
    id: "pc-german-travel", name: "German for travellers", emoji: "🧳", tone: "#C99432", by: "lena",
    cover: pic("photo-1516550893923-42d28e5677af", 900),
    description: "The 40 phrases that get you through cafés, trains and hotels, as flashcards.",
    topics: ["german", "language", "travel"], saves: 2400, updatedAt: now - 2 * DAY,
    stacks: [
      { title: "At the café", emoji: "☕", view: "grid", defaultKind: "flashcard", items: [
        fc("pc-german-travel", "Einen Kaffee, bitte", "A coffee, please"),
        fc("pc-german-travel", "Die Rechnung, bitte", "The bill, please"),
        fc("pc-german-travel", "Zum Mitnehmen", "To take away"),
        fc("pc-german-travel", "Ist hier noch frei?", "Is this seat free?"),
      ] },
      { title: "On the train", emoji: "🚆", view: "grid", defaultKind: "flashcard", items: [
        fc("pc-german-travel", "das Gleis", "the platform"),
        fc("pc-german-travel", "umsteigen", "to change trains"),
        fc("pc-german-travel", "die Verspätung", "the delay"),
      ] },
      { title: "Worth a look", emoji: "🔗", view: "list", defaultKind: "link", items: [
        link("pc-german-travel", "Ordering at a café, slowly", "youtube.com", "Easy German street interview, with subtitles"),
        link("pc-german-travel", "Train tickets without the stress", "bahn.de"),
      ] },
    ],
  },
  {
    id: "pc-grammar", name: "German grammar, one page each", emoji: "📚", tone: "#3E67A6", by: "jamshad",
    cover: pic("photo-1512820790803-83ca734da794", 900),
    description: "Cases, word order and the verbs that split in two. One note per rule.",
    topics: ["german", "language", "reading"], saves: 860, updatedAt: now - 3 * HOUR,
    stacks: [
      { title: "Cases", emoji: "🧩", view: "list", defaultKind: "note", items: [
        note("pc-grammar", "Always dative", "aus, bei, mit, nach, seit, von, zu: after these, it’s always dative."),
        note("pc-grammar", "Two-way prepositions", "Movement takes the accusative, location takes the dative: in, an, auf, über, unter…"),
      ] },
      { title: "Word order", emoji: "🔀", view: "list", defaultKind: "note", items: [
        note("pc-grammar", "Verb second", "In a main clause the verb sits second, whatever comes first."),
        note("pc-grammar", "Verb last", "After weil, dass and wenn, the verb goes to the end."),
        fc("pc-grammar", "anrufen", "to call (ich rufe dich an)"),
      ] },
    ],
  },
  {
    id: "pc-vienna-coffee", name: "Vienna coffee houses", emoji: "☕", tone: "#86507A", by: "reema",
    cover: pic("photo-1495474472287-4d71bcdd2085", 900),
    description: "Where to sit for an hour with one Melange. Classics first, then the new ones.",
    topics: ["vienna", "coffee", "travel", "food"], saves: 1300, updatedAt: now - 2 * HOUR,
    stacks: [
      { title: "The classics", emoji: "🏛️", view: "list", defaultKind: "link", items: [
        link("pc-vienna-coffee", "Café Sperl", "cafesperl.at", "Billiard tables, newspapers, no hurry"),
        link("pc-vienna-coffee", "Café Hawelka", "hawelka.at", "Buchteln after 8pm"),
        link("pc-vienna-coffee", "Café Central", "cafecentral.wien", "Go early, or go at 4"),
      ] },
      { title: "Newer spots", emoji: "✨", view: "grid", defaultKind: "image", items: [
        img("pc-vienna-coffee", "photo-1495474472287-4d71bcdd2085", "Flat white by the canal"),
        img("pc-vienna-coffee", "photo-1600210492486-724fe5c67fb0", "Light, plants, good chairs"),
      ] },
    ],
  },
  {
    id: "pc-small-space", name: "Small-space living", emoji: "🪴", tone: "#5B8A6B", by: "aiko",
    cover: pic("photo-1616046229478-9901c5536a45", 900),
    description: "Light colours, low furniture and plants that forgive you.",
    topics: ["home", "plants", "design"], saves: 5200, updatedAt: now - DAY,
    stacks: [
      { title: "Rooms", emoji: "🛋️", view: "grid", defaultKind: "image", items: [
        img("pc-small-space", "photo-1616137466211-f939a420be84", "All white, lots of light"),
        img("pc-small-space", "photo-1493663284031-b7e3aefcae8e", "Teal against oak"),
        img("pc-small-space", "photo-1615874959474-d609969a20ed", "Rattan and linen"),
        img("pc-small-space", "photo-1512918728675-ed5a9ecdebfd", "A low bed makes a room taller"),
      ] },
      { title: "Plants that forgive you", emoji: "🌿", view: "list", defaultKind: "note", items: [
        note("pc-small-space", "Snake plant", "Water once a month. Happy in a dark corner."),
        note("pc-small-space", "Pothos", "Trails nicely from a shelf; tells you when it’s thirsty."),
        img("pc-small-space", "photo-1598928506311-c55ded91a20c", "A little jungle by the window"),
      ] },
    ],
  },
  {
    id: "pc-design-reading", name: "Design systems reading list", emoji: "📐", tone: "#3E67A6", by: "charles",
    cover: pic("photo-1497366216548-37526070297c", 900),
    description: "What I hand every new designer and engineer on a team.",
    topics: ["design", "work", "reading"], saves: 3100, updatedAt: now - 5 * HOUR,
    stacks: [
      { title: "Books", emoji: "📖", view: "shelf", defaultKind: "book", items: [
        book("pc-design-reading", "Refactoring UI", "Adam Wathan & Steve Schoger"),
        book("pc-design-reading", "The Design of Everyday Things", "Don Norman"),
        book("pc-design-reading", "Atomic Design", "Brad Frost"),
      ] },
      { title: "Articles", emoji: "📰", view: "list", defaultKind: "link", items: [
        link("pc-design-reading", "Naming colour tokens", "medium.com"),
        link("pc-design-reading", "Spacing systems that scale", "smashingmagazine.com"),
      ] },
    ],
  },
  {
    id: "pc-launch", name: "Launch week, step by step", emoji: "🚀", tone: "#C4573F", by: "tomas",
    cover: pic("photo-1522071820081-009f0129c71c", 900),
    description: "The checklist we use for every launch, from the week before to the week after.",
    topics: ["startups", "work"], saves: 1900, updatedAt: now - 4 * DAY,
    stacks: [
      { title: "The week before", emoji: "🗓️", view: "list", defaultKind: "todo", items: [
        todo("pc-launch", "Freeze scope, write the changelog"),
        todo("pc-launch", "Brief support with the top five questions"),
        todo("pc-launch", "Schedule the announcement"),
      ] },
      { title: "Launch day", emoji: "🎉", view: "list", defaultKind: "todo", items: [
        todo("pc-launch", "Post, then reply to everything for two hours"),
        todo("pc-launch", "Watch sign-ups and errors every hour"),
      ] },
    ],
  },
  {
    id: "pc-alps", name: "Weekend in the Alps", emoji: "🏔️", tone: "#57534E", by: "salman",
    cover: pic("photo-1506905925346-21bda4d32df4", 900),
    description: "Two days, one hut, three routes that don’t need a guide.",
    topics: ["travel", "hiking"], saves: 640, updatedAt: now - 5 * HOUR,
    stacks: [
      { title: "Routes", emoji: "🥾", view: "list", defaultKind: "link", items: [
        link("pc-alps", "Schneeberg loop", "bergfex.at", "5h, steady, best views in Lower Austria"),
        link("pc-alps", "Rax plateau", "bergfex.at", "Take the cable car up, walk down"),
      ] },
      { title: "Pack list", emoji: "🎒", view: "list", defaultKind: "todo", items: [
        todo("pc-alps", "Hut booking printed"),
        todo("pc-alps", "Layers, not a big jacket"),
        img("pc-alps", "photo-1506905925346-21bda4d32df4", "Worth the early start"),
      ] },
    ],
  },
  {
    id: "pc-ramen", name: "Ramen at home", emoji: "🍜", tone: "#C99432", by: "nadia",
    cover: pic("photo-1504674900247-0877df9cc836", 900),
    description: "Broth on Sunday, bowls all week.",
    topics: ["food"], saves: 980, updatedAt: now - 6 * DAY,
    stacks: [
      { title: "Basics", emoji: "🥣", view: "list", defaultKind: "note", items: [
        note("pc-ramen", "Tare first", "Soy, mirin, a little sugar. Make a jar; it keeps for weeks."),
        note("pc-ramen", "Soft eggs", "Six and a half minutes, then ice water, then the marinade overnight."),
        img("pc-ramen", "photo-1504674900247-0877df9cc836", "Sunday table"),
      ] },
    ],
  },
];

/* ---------------------------------------------------------------------------
   What friends have been up to (people you share a chat with)
--------------------------------------------------------------------------- */

export interface Activity {
  id: string;
  by: string;
  kind: "saved" | "made" | "joined";
  collectionId?: string;
  groupId?: string;
  itemIds?: string[];
  at: number;
}

const itemsOf = (colId: string) => PUBLIC_COLLECTIONS.find((c) => c.id === colId)!.stacks.flatMap((s) => s.items).map((i) => i.id);

export const ACTIVITY: Activity[] = [
  { id: "ac-1", by: "reema", kind: "saved", collectionId: "pc-vienna-coffee", itemIds: itemsOf("pc-vienna-coffee").slice(0, 4), at: now - 2 * HOUR },
  { id: "ac-2", by: "jamshad", kind: "made", collectionId: "pc-grammar", itemIds: itemsOf("pc-grammar").slice(0, 3), at: now - 3 * HOUR },
  { id: "ac-3", by: "salman", kind: "saved", collectionId: "pc-alps", itemIds: itemsOf("pc-alps"), at: now - 5 * HOUR },
  { id: "ac-4", by: "reema", kind: "joined", groupId: "pub-design", at: now - 20 * HOUR },
  { id: "ac-5", by: "charles", kind: "saved", collectionId: "pc-design-reading", itemIds: itemsOf("pc-design-reading").slice(0, 3), at: now - 26 * HOUR },
  { id: "ac-6", by: "charles", kind: "joined", groupId: "pub-founders", at: now - 2 * DAY },
];

/* ---------------------------------------------------------------------------
   Collections people published from their own Mind
--------------------------------------------------------------------------- */

export const publishedId = (owner: string, colId: string) => `pub-${owner}-${colId}`;

/**
 * The topics a published collection is about: its own name counts double,
 * its stacks' names once each, and only a topic named twice is kept, so one
 * stray word never tags it with something it isn't.
 */
function topicsOf(c: Collection): Topic[] {
  const score = new Map<Topic, number>();
  const feel = (text: string, weight: number) => {
    const words = new Set(wordsIn(text));
    for (const [t, list] of Object.entries(TOPIC_WORDS) as [Topic, string[]][]) {
      if (list.some((x) => words.has(x))) score.set(t, (score.get(t) ?? 0) + weight);
    }
  };
  feel(c.name, 2);
  for (const p of c.pages) feel(p.title, 1);
  return [...score.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
}

/** A Mind item as Explore shows it (no dates or tags of its owner's). */
function asPublic(pcId: string, b: Block): PublicItem {
  const item: PublicItem & { createdAt?: number; tags?: string[] } = { ...b, id: `${pcId}:${b.id}` };
  delete item.createdAt;
  delete item.tags;
  return item;
}

/**
 * Everyone's published collections, live: what Explore shows is what's in the
 * collection right now. Top-level stacks become its stacks (with whatever is
 * in stacks inside them); things at the top become a first stack of their own.
 */
export function publishedCollections(): PublicCollection[] {
  const minds = peopleMinds();
  const out: PublicCollection[] = [];
  for (const [owner, m] of minds) {
    for (const c of m.collections) {
      if (!c.published) continue;
      const id = publishedId(owner, c.id);
      const itemsOf = (p: Page): Block[] => [...pageItems(m, p), ...childrenOf(c, p.id).flatMap(itemsOf)];
      const stacks: PublicStack[] = c.pages
        .filter((p) => !p.parentId)
        .map((p) => ({ title: p.title, emoji: p.emoji, view: p.view, defaultKind: p.defaultKind, items: itemsOf(p).map((b) => asPublic(id, b)) }));
      const loose = rootItems(m, c);
      if (loose.length) stacks.unshift({ title: c.name, emoji: c.emoji, view: c.view ?? "list", defaultKind: "note", items: loose.map((b) => asPublic(id, b)) });
      const all = stacks.flatMap((x) => x.items);
      const picture = all.find((b) => b.kind === "image" && (b.image || b.attachment?.url || b.attachment?.dataUrl));
      out.push({
        id, name: c.name, emoji: c.emoji, tone: c.tone,
        cover: picture?.image ?? picture?.attachment?.url ?? picture?.attachment?.dataUrl ?? "",
        by: owner,
        description: c.published.description.trim() || `${all.length} ${all.length === 1 ? "thing" : "things"} in ${stacks.length} ${stacks.length === 1 ? "stack" : "stacks"}`,
        topics: topicsOf(c),
        // Saves: how many other people have it in their Mind.
        saves: minds.filter(([who, other]) => who !== owner && other.collections.some((x) => x.from?.id === id)).length,
        updatedAt: c.published.at,
        stacks,
      });
    }
  }
  return out;
}

/** Everything public: the collections made for Explore, and the ones people published. */
export const allPublic = () => [...PUBLIC_COLLECTIONS, ...publishedCollections()];
/** The collections you published, as others see them. */
export const publishedBy = (me: string) => publishedCollections().filter((c) => c.by === me);

export const allPublicItems = () => allPublic().flatMap((c) => c.stacks.flatMap((s) => s.items.map((item) => ({ item, collection: c }))));
export const publicItem = (id: string) => allPublicItems().find((x) => x.item.id === id) ?? null;
export const publicCollection = (id: string) => allPublic().find((c) => c.id === id) ?? null;
/** A public item as a Mind block, for showing it (and saving it). */
export const asBlock = (item: PublicItem, at = now): Block => ({ ...item, tags: [], createdAt: at });

/* ---------------------------------------------------------------------------
   Interests, and the ranking
--------------------------------------------------------------------------- */

const wordsIn = (s: string) => s.toLowerCase().match(/[a-zà-ÿß]{3,}/g) ?? [];

/** Topic weights from your Mind (collection names count most) and the groups you're in. */
export function interestsOf(mind: Mind | null, chats: Chat[], me: string) {
  const w = new Map<Topic, number>();
  const feel = (text: string, weight: number) => {
    const words = new Set(wordsIn(text));
    for (const [t, list] of Object.entries(TOPIC_WORDS) as [Topic, string[]][]) {
      if (list.some((x) => words.has(x))) w.set(t, (w.get(t) ?? 0) + weight);
    }
  };
  for (const c of mind?.collections ?? []) {
    feel(c.name, 4);
    for (const p of c.pages) feel(p.title, 2);
  }
  for (const b of Object.values(mind?.blocks ?? {}).slice(0, 200)) feel(`${b.title} ${b.tags.join(" ")}`, 0.4);
  for (const c of chats) {
    if (c.kind !== "group" || c.groupId || c.removedAt || !c.memberIds.includes(me)) continue;
    feel(`${c.name} ${c.group?.description ?? ""}`, 1.5);
  }
  return w;
}

/** Your collection that a topic most belongs to, for "Because you collect …". */
function collectionFor(mind: Mind | null, topics: Topic[]) {
  let best: { c: Collection; score: number } | null = null;
  for (const c of mind?.collections ?? []) {
    const words = new Set(wordsIn(`${c.name} ${c.pages.map((p) => p.title).join(" ")}`));
    const score = topics.reduce((s, t) => s + (TOPIC_WORDS[t].some((x) => words.has(x)) ? 1 : 0), 0);
    if (score && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}

/** People you share a chat with. */
export function friendsOf(chats: Chat[], me: string) {
  const out = new Set<string>();
  for (const c of chats) if (!c.removedAt && c.memberIds.includes(me)) c.memberIds.forEach((u) => out.add(u));
  out.delete(me);
  return out;
}

export interface Ranked<T> {
  value: T;
  score: number;
  reason: string;
  /** Your collection it fits, if any: Explore shelves things by it ("Because you collect …"). */
  mine?: { id: string; name: string; emoji: string } | null;
}
const shelfOf = (c: Collection | null) => (c ? { id: c.id, name: c.name, emoji: c.emoji } : null);

const match = (interests: Map<Topic, number>, topics: Topic[]) => topics.reduce((s, t) => s + (interests.get(t) ?? 0), 0);

export function rankCollections(mind: Mind | null, chats: Chat[], me: string, nameOf: (id: string) => string): Ranked<PublicCollection>[] {
  const interests = interestsOf(mind, chats, me);
  const friends = friendsOf(chats, me);
  return allPublic()
    .filter((c) => c.by !== me)
    .map((c) => {
      const mine = collectionFor(mind, c.topics);
      const byFriend = friends.has(c.by);
      const fresh = Math.max(0, 1 - (now - c.updatedAt) / (7 * DAY));
      const score = match(interests, c.topics) + (byFriend ? 6 : 0) + Math.log10(c.saves + 1) + fresh * 2;
      const reason = mine ? `Because you collect ${mine.emoji} ${mine.name}` : byFriend ? `${nameOf(c.by)} made this` : c.saves > 2000 ? "Popular on NOD" : `For ${c.topics.map((t) => TOPIC_LABEL[t]).slice(0, 2).join(" & ")}`;
      return { value: c, score, reason, mine: shelfOf(mine) };
    })
    .sort((a, b) => b.score - a.score);
}

/** Groups listed on Explore that you aren't in yet. */
export function rankGroups(mind: Mind | null, chats: Chat[], me: string, nameOf: (id: string) => string): Ranked<Chat>[] {
  const interests = interestsOf(mind, chats, me);
  const friends = friendsOf(chats, me);
  return chats
    .filter((c) => c.kind === "group" && !c.groupId && !c.removedAt && c.group?.discover && !c.memberIds.includes(me))
    .map((c) => {
      const d = c.group!.discover!;
      const inside = c.memberIds.filter((u) => friends.has(u));
      const mine = collectionFor(mind, d.topics as Topic[]);
      const score = match(interests, d.topics as Topic[]) + inside.length * 4 + Math.log10(d.members);
      const reason = inside.length
        ? `${inside.map(nameOf).slice(0, 2).join(" and ")} ${inside.length === 1 ? "is" : "are"} here`
        : mine ? `For your ${mine.emoji} ${mine.name}` : `${d.members.toLocaleString()} people`;
      return { value: c, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

/** Single things worth saving, from collections that fit yours, minus what you already have. */
export function rankItems(mind: Mind | null, chats: Chat[], me: string): Ranked<{ item: PublicItem; collection: PublicCollection }>[] {
  const interests = interestsOf(mind, chats, me);
  const have = new Set(Object.values(mind?.blocks ?? {}).map((b) => `${b.kind}:${b.title.toLowerCase()}`));
  return allPublicItems()
    .filter(({ item, collection }) => collection.by !== me && !have.has(`${item.kind}:${item.title.toLowerCase()}`))
    .map((x) => {
      const mine = collectionFor(mind, x.collection.topics);
      // Pictures and cards make the best tiles; a little variety per collection.
      const kindBoost = x.item.kind === "image" ? 1.2 : x.item.kind === "flashcard" || x.item.kind === "book" ? 0.8 : 0.4;
      const score = match(interests, x.collection.topics) + kindBoost + Math.log10(x.collection.saves + 1) / 2;
      return { value: x, score, reason: mine ? `For ${mine.emoji} ${mine.name}` : `From ${x.collection.emoji} ${x.collection.name}`, mine: shelfOf(mine) };
    })
    .filter((r) => r.score > 1.6)
    .sort((a, b) => b.score - a.score)
    // A mix: no more than two things from any one collection.
    .filter((r, _, all) => all.filter((o) => o.value.collection.id === r.value.collection.id).indexOf(r) < 2);
}

/** Friends' activity, newest first. */
export function friendActivity(chats: Chat[], me: string) {
  const friends = friendsOf(chats, me);
  return ACTIVITY.filter((a) => a.by !== me && friends.has(a.by)).sort((a, b) => b.at - a.at);
}

/** The Mind collection a public thing should go into: the best fit, else the one open last. */
export function suggestCollection(mind: Mind | null, topics: Topic[]) {
  return collectionFor(mind, topics) ?? mind?.collections.find((c) => c.id === mind.current) ?? mind?.collections[0] ?? null;
}

/* ---------------------------------------------------------------------------
   Saving into Mind
--------------------------------------------------------------------------- */

/** One thing, into a collection's top level. Returns the new block id. */
export function saveItem(m: Mind, item: PublicItem, collectionId: string): { mind: Mind; id: string } {
  const id = newId();
  const block: Block = { ...asBlock(item, Date.now()), id, ...(item.kind === "todo" ? { done: false } : {}) };
  return { mind: place({ ...m, blocks: { ...m.blocks, [id]: block } }, id, { collectionId, root: true }), id };
}

/** A whole public collection, copied in: its stacks become stacks, its items yours to change. */
export function addCollection(m: Mind, pc: PublicCollection): { mind: Mind; id: string } {
  const col: Collection = { ...makeCollection(pc.name, pc.emoji, pc.tone), from: { id: pc.id, by: pc.by } };
  const blocks = { ...m.blocks };
  col.pages = pc.stacks.map((s) => {
    const page = { ...blankPage(s.title, s.emoji, pc.tone, s.defaultKind), view: s.view, views: [s.view, ...(["list", "grid", "shelf"] as MindView[]).filter((v) => v !== s.view)] };
    page.sections = [{ ...page.sections[0], blockIds: s.items.map((item) => {
      const id = newId();
      blocks[id] = { ...asBlock(item, Date.now()), id };
      return id;
    }) }];
    return page;
  });
  return { mind: { ...m, blocks, collections: [...m.collections, col] }, id: col.id };
}

/** Already added (by this person) from Explore. */
export const addedFrom = (mind: Mind | null, pcId: string) => mind?.collections.find((c) => c.from?.id === pcId) ?? null;

/** Groups listed on Explore: members can join straight away. */
export const isDiscoverable = (c: Chat) => !!groupInfo(c).discover;
