"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Attachment } from "./types";

/**
 * Mind — each person's own organising space.
 *
 *   Mind → Collections → items, all on one level
 *
 * A collection is a folder: a name, an icon, and whatever you put in it, side
 * by side. There's nothing inside it but items: what groups them is their
 * tags, and the collection's filter brings any group of them back.
 *
 * Something saved without a place (from a chat, or added on Mind's home) goes
 * to Unassigned, a collection Mind makes the first time it's needed. Sort
 * there gives each thing in it a collection; once it's empty, it goes away.
 * Items saved from a chat keep a reference to the message and stay live.
 */

export type MindView = "shelf" | "list" | "grid";
export type BlockKind =
  | "note" | "todo" | "reminder" | "link" | "video" | "book" | "quote" | "flashcard" | "image" | "file"
  | "palette" | "progress" | "habit" | "amount" | "date" | "chat";
export type TaskStatus = "todo" | "doing" | "done";

/** What someone it's shared with may do: look, or change it too. */
export type ShareRole = "view" | "edit";

/** Who may open a collection or an item shared from Mind, the way Drive shares a file (see lib/chat/share.ts). */
export interface Sharing {
  /** Anyone with the link (a chat it was sent into has it): nobody, or what they may do. */
  link: "off" | ShareRole;
  /** Specific people, and what each may do. */
  people: Record<string, ShareRole>;
  /** Invited by email before they're on NOD: the role they get once they are. */
  emails: Record<string, ShareRole>;
  /** Whether people it's shared with may make their own copy. */
  copy: boolean;
  /** Asking for access (or for edit access), waiting for the owner. */
  requests: { userId: string; role: ShareRole; at: number }[];
}

/** One line of a to-do's checklist. */
export interface Step { id: string; text: string; done: boolean }

export interface Block {
  id: string;
  kind: BlockKind;
  title: string;
  /** Notes: the text. Quotes: who said it. Books: what the book is about. */
  body?: string;
  url?: string;
  /** Links: the site. Videos: the channel. Books: the author. */
  source?: string;
  /** A picture: the image itself, a book's cover, a video's still. */
  image?: string;
  /** Uploaded image or file, bytes in IndexedDB (see lib/chat/media). */
  attachment?: Attachment;
  /** Your own words for it, global across Mind (the same tag in any collection), for search and the filter. */
  tags: string[];
  createdAt: number;
  /** Last changed (its title, text, tags, done…); unset until it first is. See modifiedAt. */
  updatedAt?: number;
  status?: TaskStatus;
  shelf?: "want" | "reading" | "read";
  /** To-dos: ticked off (a checklist, once every step is). Reminders: dealt with. */
  done?: boolean;
  /** To-dos: the checklist, when it has steps. One without is a single to-do. */
  checklist?: Step[];
  back?: string;
  due?: boolean;
  /** Progress: how far along, out of the goal (`total`), counted in `unit` ("pages", "km"). */
  value?: number;
  total?: number;
  unit?: string;
  colors?: string[];
  duration?: string;
  size?: number;
  amount?: number;
  paid?: boolean;
  /** Amounts: when it's due. Dates: the day itself. Reminders: when to remind. */
  at?: number;
  /** Habits: the days it was done (YYYY-MM-DD). */
  days?: string[];
  /** Books, as the catalogue knows them. */
  isbn?: string;
  year?: number;
  pages?: number;
  ref?: { chatId: string; messageId: string };
  note?: string;
  /** Shared on its own (a collection shared whole covers its items too). */
  sharing?: Sharing;
}

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  tone: string;
  /** Everything in it, in order. */
  items: string[];
  /** Chats whose saves land here; learned when you sort or move a save from one. */
  chatIds: string[];
  /** How it's laid out: a list, a grid, or a shelf. */
  view?: MindView;
  /** Added from Explore: the public collection it came from, and who made it. */
  from?: { id: string; by: string };
  /** Published to Explore: when, and the line people see under its name. It stays in step with what's in it. */
  published?: { at: number; description: string };
  /** Shared with people, or with anyone who has the link. */
  sharing?: Sharing;
}

export interface Mind {
  version: 6;
  collections: Collection[];
  /** The collection opened last; saves fall back to it. */
  current: string | null;
  blocks: Record<string, Block>;
  /** How Mind's home shows the collections: as folders (the default) or a list, one per row. */
  home?: "grid" | "list";
  /** A shared collection's copy being edited: the items it started with, so saving can tell what the editor removed from what the owner added meanwhile. */
  draftBase?: string[];
}

/* ---------------------------------------------------------------------------
   Dates
--------------------------------------------------------------------------- */

const DAY = 86_400_000;
export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const todayKey = () => dayKey(Date.now());
export const nowMs = () => Date.now();
export function daysUntil(ts: number) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(ts); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}
export function isPast(ts: number) { return ts < Date.now(); }
/**
 * The same time of day, n calendar days on (or back). Not n × 24 hours: the
 * day the clocks change is 23 or 25 hours long, and stepping by 24h there
 * lists one day twice, or skips one.
 */
export function shiftDays(t: number, n: number) {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
export function lastSevenDays() {
  return Array.from({ length: 7 }, (_, i) => dayKey(shiftDays(Date.now(), i - 6)));
}

/* ---------------------------------------------------------------------------
   Making things
--------------------------------------------------------------------------- */

export const newId = (p = "b") => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A new collection is an empty folder. */
export function makeCollection(name: string, emoji: string, tone: string): Collection {
  return { id: newId("c"), name: name.trim() || "Untitled", emoji, tone, items: [], chatIds: [] };
}

/** Where things saved without a place wait to be sorted. One per Mind, at the top, made when it's needed. */
export const UNASSIGNED = "c-unassigned";
export const isUnassigned = (c: Collection | null | undefined) => c?.id === UNASSIGNED;
const unassignedCollection = (): Collection => ({ id: UNASSIGNED, name: "Unassigned", emoji: "🗃️", tone: "#78716C", items: [], chatIds: [] });

/** Puts an item at the top of Unassigned (made first, if there isn't one yet). */
export const intoUnassigned = (mind: Mind, blockId: string) =>
  place(mind, blockId, { collectionId: UNASSIGNED, beforeId: mind.collections.find(isUnassigned)?.items.find((id) => id !== blockId) });

/** Unassigned goes away once everything in it has a place. */
function tidy(mind: Mind): Mind {
  const u = mind.collections.find(isUnassigned);
  if (!u || u.items.some((id) => mind.blocks[id])) return mind;
  const collections = mind.collections.filter((c) => c !== u);
  return { ...mind, collections, current: mind.current === UNASSIGNED ? collections[0]?.id ?? null : mind.current };
}

/** A tag as Mind writes it: lower case, words joined by dashes ("Separable verbs" → "separable-verbs"). */
export const tagOf = (words: string) => words.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");

/* ---------------------------------------------------------------------------
   Seeds — plain folders, filled the way a person would fill them
--------------------------------------------------------------------------- */

type Item = Omit<Block, "id" | "createdAt" | "tags"> & { tags?: string[] };
type SeedCollection = Omit<Collection, "id" | "items"> & { id: string; items: Item[] };

/** `unassigned`: things saved without a place yet, waiting in Unassigned. */
function build(collections: SeedCollection[], current: string | null, unassigned: Item[] = []): Mind {
  const blocks: Record<string, Block> = {};
  let n = 0;
  let t = Date.now();
  const add = (it: Item) => {
    const id = `b${(++n).toString(36)}`;
    t -= 41 * 60_000;
    blocks[id] = { ...it, tags: it.tags ?? [], id, createdAt: t };
    return id;
  };
  const waiting = unassigned.length ? [{ ...unassignedCollection(), items: unassigned.map(add) }] : [];
  return {
    version: 6,
    current,
    blocks,
    collections: [...waiting, ...collections.map((c) => ({ ...c, items: c.items.map(add) }))],
  };
}

/** Things that go together, each tagged with what they're about (and keeping any tags of their own). */
const tagged = (tags: string | string[], items: Item[]): Item[] =>
  items.map((it) => ({ ...it, tags: [...new Set([...[tags].flat(), ...(it.tags ?? [])])] }));

const photo = (id: string, w = 700) => `https://images.unsplash.com/${id}?w=${w}&q=70&fm=jpg`;
/** A cover from Apple Books' image server, at the size Mind asks for (see /api/books). */
const appleCover = (path: string) => `https://is1-ssl.mzstatic.com/image/thumb/${path}/600x600bb.jpg`;
/** A YouTube video as Mind keeps it once its link has been read. */
const youtube = (id: string, title: string, channel: string, duration: string, tags?: string[]): Item => ({
  kind: "video", title, source: channel, duration, tags,
  url: `https://www.youtube.com/watch?v=${id}`, image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});
const card = (front: string, back: string, due = false, tags: string[] = []): Item => ({ kind: "flashcard", title: front, back, due, tags });
/** A to-do with steps; `[x]` at the start of one means it's done. */
const checklist = (title: string, steps: string[], tags?: string[]): Item => {
  const list = steps.map((s, i) => ({ id: `s${i}`, text: s.replace(/^\[x\] /, ""), done: s.startsWith("[x] ") }));
  return { kind: "todo", title, checklist: list, done: list.every((s) => s.done), tags };
};
/** A reminder, `hours` from now. */
const remind = (title: string, hours: number, tags?: string[]): Item => ({ kind: "reminder", title, at: Date.now() + hours * 3_600_000, done: false, tags });

function alaeMind(): Mind {
  return build([
    {
      id: "c-german", name: "German", emoji: "🇩🇪", tone: "#C99432", chatIds: [], view: "grid",
      items: [
        { kind: "date", title: "Goethe B1 exam", at: Date.now() + 46 * DAY },
        { kind: "progress", title: "Hammer's Grammar", value: 7, total: 22, unit: "chapters", tags: ["grammar"] },
        remind("Book a speaking slot with Anja", 3),
        { kind: "habit", title: "Review cards for 10 minutes", days: [dayKey(shiftDays(Date.now(), -1)), dayKey(shiftDays(Date.now(), -2)), dayKey(shiftDays(Date.now(), -3)), dayKey(shiftDays(Date.now(), -5))] },
        ...tagged("vocab", [
          card("der Feierabend", "the end of the working day"), card("gemütlich", "cosy, comfortable"),
          card("die Verabredung", "an appointment, a date"), card("die Rechnung", "the bill"),
          card("der Bahnhof", "the train station"), card("das Brötchen", "bread roll"),
          card("unterschreiben", "to sign", false, ["work"]), card("die Besprechung", "the meeting", false, ["work"]), card("der Termin", "the appointment", false, ["work"]),
        ]),
        ...tagged("verbs", [
          card("sich freuen auf", "to look forward to"), card("etwas vorhaben", "to have plans"),
          { kind: "note", title: "Verb goes last after “weil”", body: "Ich lerne Deutsch, weil ich in Wien arbeite." },
        ]),
        ...tagged(["verbs", "separable-verbs"], [
          card("anrufen", "to call (ruft … an)"), card("aufstehen", "to get up (steht … auf)"), card("einkaufen", "to shop (kauft … ein)"),
        ]),
        ...tagged(["verbs", "irregular-verbs"], [
          card("gehen · ging · gegangen", "to go"), card("sehen · sah · gesehen", "to see"),
        ]),
        ...tagged("grammar", [
          {
            kind: "book", title: "Hammer's German Grammar and Usage", source: "Martin Durrell", shelf: "reading", year: 2002, pages: 616,
            image: appleCover("Publication115/v4/1a/06/77/1a0677dd-d134-82f9-a72e-bc28c8448424/9780429620201.jpg"),
            url: "https://books.apple.com/us/book/hammers-german-grammar-and-usage/id1569162093",
          },
          {
            kind: "book", title: "Grammatik aktiv A1–B1", source: "Friederike Jin", shelf: "reading", year: 2013, pages: 256,
            image: appleCover("Publication116/v4/9a/e0/f4/9ae0f466-952e-1289-a9ae-d34749422ba3/1039550007.jpg"),
            url: "https://books.apple.com/us/book/grammatik-aktiv-deutsch-als-fremdsprache-2-aktualisierte/id6448269689",
          },
          {
            kind: "book", title: "Schaum's Outline of German Grammar", source: "Elke Gschossmann-Hendershot", shelf: "want", year: 1975, pages: 244,
            image: appleCover("Publication/v4/c7/b0/38/c7b038ef-6ce3-4369-f54c-7c9dbc249a92/9780071823357.jpg"),
            url: "https://books.apple.com/us/book/schaums-outline-of-german-grammar/id795267059",
          },
          { kind: "link", title: "Dative or accusative? The only chart you need", source: "learngerman.dw.com", url: "https://learngerman.dw.com", tags: ["cases"] },
          { kind: "link", title: "Where the verb goes in a subordinate clause", source: "yourdailygerman.com", url: "https://yourdailygerman.com" },
        ]),
        ...tagged("listening", [
          youtube("8VowGvnRU_s", "Understand the GERMAN CASES - Accusative, Dative, Nominative, Genitive", "Learn German with Anja", "16:42", ["cases"]),
          youtube("g_h1DtGIAfQ", "Do Germans Like to Work? | Easy German 636", "Easy German", "13:58"),
        ]),
      ],
    },
    {
      id: "c-work", name: "Work", emoji: "💼", tone: "#3E67A6", chatIds: ["general", "dm"],
      items: tagged("spaces-launch", [
        checklist("Launch week", ["[x] Freeze the copy", "[x] QA on iOS", "QA on Android", "Brief support", "Schedule the announcement"]),
        remind("Send the investor update", 26),
        { kind: "chat", title: "Launch checklist", ref: { chatId: "general", messageId: "g-10" } },
        { kind: "chat", title: "Kickoff brief · Spaces v2", ref: { chatId: "general", messageId: "g-7" } },
        { kind: "todo", title: "Mock the QR code on the handoff screen" },
        { kind: "todo", title: "Review Charles's implementation", done: true },
      ]),
    },
    {
      id: "c-trip", name: "Trip ideas", emoji: "✈️", tone: "#5B8A6B", chatIds: [],
      items: [
        checklist("Packing, every time", ["[x] Adapter", "Rail card", "A book for the train", "Headphones"]),
        ...tagged("vienna-weekend", [
          { kind: "date", title: "Train to Vienna", at: Date.now() + 18 * DAY },
          { kind: "link", title: "Café Sperl", source: "cafesperl.at", url: "https://cafesperl.at" },
          { kind: "note", title: "To try", body: "Sachertorte, the Naschmarkt on Saturday morning, a Heuriger in Grinzing." },
        ]),
      ],
    },
  ], "c-german", [
    { kind: "link", title: "Tandem: find a language exchange partner", source: "tandem.net", url: "https://tandem.net" },
    { kind: "note", title: "Ask Reema about the flat in Vienna" },
  ]);
}

function charlesMind(): Mind {
  const task = (title: string, status: TaskStatus, tags: string[] = []): Item => ({ kind: "todo", title, status, done: status === "done", tags });
  return build([
    {
      id: "c-acme", name: "Acme Co", emoji: "🌐", tone: "#3E67A6", chatIds: [],
      items: [
        ...tagged("website-redesign", [
          task("Homepage hero in Figma", "done"), task("Pricing page copy", "doing"), task("CMS migration", "doing"),
          task("Accessibility audit", "todo", ["urgent"]), task("Handoff to Acme's developers", "todo"),
          { kind: "date", title: "Acme launch", at: Date.now() + 5 * DAY },
        ]),
        ...tagged("references", [
          { kind: "link", title: "Acme · Web v3", source: "figma.com", url: "https://figma.com" },
          { kind: "link", title: "Competitor teardown: linear.app", source: "linear.app", url: "https://linear.app" },
          { kind: "note", title: "Call · 12 Sep", body: "They want the hero calmer: less gradient, more product. Dana signs off copy." },
        ]),
      ],
    },
    {
      id: "c-lumen", name: "Lumen", emoji: "📱", tone: "#86507A", chatIds: [],
      items: tagged("ios-app-1.4", [
        task("Sign in with Apple", "done"), task("TestFlight build 1.4", "done"), task("Onboarding flow v2", "doing"),
        task("Push notification copy", "todo"), task("App Store screenshots", "todo"),
        { kind: "date", title: "App review", at: Date.now() + 12 * DAY },
      ]),
    },
    {
      id: "c-nod", name: "NOD", emoji: "🚀", tone: "#C99432", chatIds: ["general", "dm"],
      items: tagged("spaces-launch", [
        { kind: "chat", title: "Launch checklist", ref: { chatId: "general", messageId: "g-10" } },
        { kind: "chat", title: "Where for lunch on Friday?", ref: { chatId: "general", messageId: "g-9" } },
        { kind: "chat", title: "CLAUDE.md", ref: { chatId: "general", messageId: "g-8" } },
        task("Review Alae's latest implementation", "doing", ["urgent"]),
      ]),
    },
    {
      id: "c-money", name: "Money", emoji: "💶", tone: "#5B8A6B", chatIds: [],
      items: [
        ...tagged("invoices", [
          { kind: "amount", title: "INV-041", source: "Acme Co", amount: 3200, paid: true, at: Date.now() - 6 * DAY },
          { kind: "amount", title: "INV-042", source: "Lumen", amount: 2400, paid: false, at: Date.now() + 3 * DAY },
          { kind: "amount", title: "INV-043", source: "NOD", amount: 1800, paid: false, at: Date.now() - 2 * DAY, tags: ["urgent"] },
        ]),
        ...tagged("admin", [
          task("File the quarterly VAT return", "todo", ["urgent"]),
          { kind: "note", title: "Rates 2026", body: "€95 an hour · €720 a day · 50% upfront on new clients." },
        ]),
      ],
    },
  ], "c-acme", [
    { kind: "chat", title: "Can you review the latest implementation?", ref: { chatId: "dm", messageId: "dm-5" } },
    { kind: "chat", title: "QR code idea", ref: { chatId: "general", messageId: "g-3" } },
  ]);
}

function reemaMind(): Mind {
  const img = (id: string, title: string): Item => ({ kind: "image", title, image: photo(id), source: "pinterest.com" });
  return build([
    {
      id: "c-home", name: "Home ideas", emoji: "🏡", tone: "#5B8A6B", chatIds: ["reema"], view: "grid",
      items: [
        { kind: "amount", title: "Furniture budget", source: "This year", amount: 2500, paid: false, at: Date.now() + 60 * DAY },
        ...tagged("living-room", [
          img("photo-1616046229478-9901c5536a45", "Sage walls and a round mirror"),
          { kind: "palette", title: "Sage & oak", colors: ["#8A9A7B", "#C9B79C", "#EDE6DA", "#5B4636", "#2F3A2F"] },
          img("photo-1493663284031-b7e3aefcae8e", "Teal cushions"),
          { kind: "link", title: "Oak side table", source: "hay.com", url: "https://hay.com" },
          img("photo-1484101403633-562f891dc89a", "A soft grey sofa"),
          img("photo-1616137466211-f939a420be84", "All white, lots of light"),
        ]),
        ...tagged("bedroom", [
          img("photo-1615874959474-d609969a20ed", "Rattan lamp and linen"),
          { kind: "quote", title: "Have nothing in your house that you do not know to be useful, or believe to be beautiful.", body: "William Morris" },
          img("photo-1505693416388-ac5ce068fe85", "Tufted headboard"),
          img("photo-1512918728675-ed5a9ecdebfd", "Low bed, warm wood"),
        ]),
        ...tagged("plants", [
          img("photo-1519710164239-da123dc03ef4", "One plant, one chair"),
          { kind: "note", title: "Monstera", body: "Water every 7 to 10 days. Bright, indirect light." },
          img("photo-1598928506311-c55ded91a20c", "A little jungle"),
        ]),
        ...tagged("dream-house", [
          img("photo-1600585154340-be6161a56a0c", "Big windows, big tree"),
          img("photo-1502005229762-cf1b2da7c5d6", "Floating stairs"),
          img("photo-1585412727339-54e4bae3bbf9", "Coffered ceiling"),
        ]),
      ],
    },
  ], "c-home", [img("photo-1586023492125-27b2c045efd7", "Green velvet chair")]);
}

/**
 * A group's Mind: one shared collection everyone in the group can read;
 * people with "Edit the group's Mind" add to it and tag what's in it.
 * Stored like a person's Mind, under its own id.
 */
export const groupMindId = (groupId: string) => `group:${groupId}`;

/** What NOD Team keeps for everyone: the brand kit, launch links and the docs people ask for. */
function nodTeamMind(): Mind {
  return build([
    {
      id: "c-shared", name: "NOD Team", emoji: "🗂️", tone: "#C99432", chatIds: [],
      items: [
        ...tagged("brand-kit", [
          { kind: "palette", title: "NOD colours", colors: ["#1C1917", "#FAFAF9", "#00359E", "#C99432", "#5B8A6B"] },
          { kind: "file", title: "NOD-logo-pack.zip", size: 2_400_000 },
          { kind: "file", title: "Type scale v2.fig", size: 860_000 },
          { kind: "image", title: "Spaces launch moodboard", image: photo("photo-1618221195710-dd6b41faaea6"), source: "Reema" },
        ]),
        ...tagged("launch", [
          { kind: "link", title: "Launch plan", source: "notion.so", url: "https://notion.so" },
          { kind: "link", title: "Press kit", source: "nod.app", url: "https://nod.app" },
          { kind: "date", title: "Launch day", at: Date.now() + 9 * DAY },
          { kind: "file", title: "Investor update – October.pdf", size: 1_200_000 },
        ]),
        ...tagged("how-we-work", [
          { kind: "note", title: "Writing for NOD", body: "Short sentences. Say what happens, not what the button is called. No exclamation marks." },
          { kind: "note", title: "Release checklist", body: "Changelog, QA on iOS and Android, support briefed, announcement scheduled." },
          { kind: "quote", title: "Make it work, make it right, make it fast.", body: "Kent Beck" },
        ]),
      ],
    },
  ], "c-shared");
}

/** Alae, Charles and Reema have been using Mind for a while; everyone else starts blank. */
export function seedMind(userId: string): Mind {
  if (userId === groupMindId("general")) return nodTeamMind();
  if (userId === "me") return alaeMind();
  if (userId === "charles") return charlesMind();
  if (userId === "reema") return reemaMind();
  return { version: 6, collections: [], current: null, blocks: {} };
}

/* ---------------------------------------------------------------------------
   Store — one Mind per person, persisted, shared by every component
--------------------------------------------------------------------------- */

const KEY = "nod.mind.v3";
let cache: Record<string, Mind> | null = null;
/** The stored text the cache was read from (or last written), to tell when another tab changed it. */
let raw: string | null = null;
let watching = false;
const listeners = new Set<() => void>();

/** `fresh` re-reads storage first, so a write never starts from another tab's stale copy. */
function load(fresh = false): Record<string, Mind> {
  if (cache && !fresh) return cache;
  let text = "{}";
  try { text = localStorage.getItem(KEY) || "{}"; } catch { /* storage blocked */ }
  if (cache && text === raw) return cache;
  raw = text;
  try { cache = JSON.parse(text); } catch { cache = {}; }
  // Minds saved before are brought up to date on the way in (and saved that way on the next write):
  // stacks folded into their collection, and each collection's "To sort" pile moved to Unassigned.
  for (const [id, m] of Object.entries(cache!)) {
    const v = (m as { version?: number } | null)?.version;
    if (v === 3 || v === 4) cache![id] = flatten(m as unknown as LegacyMind);
    else if (v === 5) cache![id] = unvault(m as unknown as V5Mind);
  }
  return cache!;
}

/* A Mind as it was stored while each collection had its own "To sort" pile (the vault). */
type V5Collection = Collection & { vault?: string[] };
type V5Mind = Omit<Mind, "version" | "collections"> & { version: 5; collections: V5Collection[] };
/* Before that, while collections held stacks (pages, with sections, inside each other). */
type LegacyPage = { id: string; title: string; parentId?: string; sections?: { blockIds?: string[] }[] };
type LegacyMind = Omit<Mind, "version" | "collections"> & {
  version: 3 | 4;
  collections: (Omit<V5Collection, "items" | "view"> & { items?: string[]; pages?: LegacyPage[]; view?: string })[];
};

/** Everything that was waiting in a collection's "To sort" pile moves to Unassigned, in the order it was. */
export function unvault(old: V5Mind): Mind {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let m: Mind = { ...old, version: 6, collections: old.collections.map(({ vault, ...c }) => c) };
  const waiting = old.collections.flatMap((c) => c.vault ?? []).filter((id) => m.blocks[id]);
  for (const id of [...waiting].reverse()) m = intoUnassigned(m, id);
  return m;
}

/**
 * Folds a Mind from before into one level per collection. Each stack's items
 * move to the end of their collection, tagged with the stack's name and the
 * names of the stacks it sat in, so filtering by that tag gives the stack back.
 */
export function flatten(old: LegacyMind): Mind {
  const blocks = { ...old.blocks };
  const collections: V5Collection[] = old.collections.map(({ pages = [], items = [], view, ...c }) => {
    const ids = new Set(pages.map((p) => p.id));
    const moved: string[] = [];
    const seen = new Set<string>();
    const walk = (list: LegacyPage[], above: string[]) => list.forEach((p) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const tags = [...above, tagOf(p.title)].filter(Boolean);
      for (const id of (p.sections ?? []).flatMap((s) => s.blockIds ?? [])) {
        const b = blocks[id];
        if (!b || moved.includes(id) || items.includes(id)) continue;
        blocks[id] = { ...b, tags: [...new Set([...(b.tags ?? []), ...tags])] };
        moved.push(id);
      }
      walk(pages.filter((k) => k.parentId === p.id), tags);
    });
    // Parents before what's inside them; a stack whose parent is gone counts as top level.
    walk(pages.filter((p) => !p.parentId || !ids.has(p.parentId)), []);
    return { ...c, items: [...items, ...moved], view: view === "grid" || view === "shelf" ? view : "list" };
  });
  return unvault({ ...old, version: 5, collections, blocks });
}
function write() {
  const text = JSON.stringify(cache);
  // Only once it's stored; if it can't be, the next fresh read keeps the in-memory copy.
  try { localStorage.setItem(KEY, text); raw = text; } catch { /* storage full or blocked */ }
}
function notify() { listeners.forEach((l) => l()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  // Watch other tabs for the life of the page, not just while something is mounted.
  if (!watching) {
    watching = true;
    window.addEventListener("storage", (e) => { if (e.key === KEY || e.key === null) { cache = null; notify(); } });
  }
  return () => { listeners.delete(listener); };
}
export function mindOf(userId: string): Mind {
  const all = load();
  const m = all[userId] as Mind | { version: number } | undefined;
  if (!m || m.version !== 6) {
    all[userId] = seedMind(userId);
    write();
  }
  return all[userId];
}
export function updateMind(userId: string, fn: (m: Mind) => Mind) {
  // Read, change and write in one go, from what's stored right now.
  load(true);
  const next = fn(mindOf(userId));
  cache = { ...cache!, [userId]: next };
  write();
  notify();
}
/*
 * Editing a Mind that isn't yours alone (a group's) happens on a copy, kept in
 * the store under its own id so every Mind screen and sheet works on it as
 * usual. Save puts the copy back in one write; Cancel just drops it.
 */
export const draftOf = (id: string) => `draft:${id}`;
/** A fresh copy of `id` to edit; returns the copy's id. Call it before the editor opens. */
export function startDraft(id: string) {
  const copy = JSON.parse(JSON.stringify(mindOf(id))) as Mind;
  updateMind(draftOf(id), () => copy);
  return draftOf(id);
}
/** Puts the edited copy back. */
export function commitDraft(id: string) {
  const draft = load(true)[draftOf(id)];
  if (draft) updateMind(id, () => draft);
}
/** Forgets the copy. Only once its editor is gone: nothing should be reading it, so nothing is told. */
export function dropDraft(id: string) {
  const all = load(true);
  if (!(draftOf(id) in all)) return;
  const rest = { ...all };
  delete rest[draftOf(id)];
  cache = rest;
  write();
}

/*
 * A collection shared with edit access is edited the same way, on a copy:
 * a Mind holding just that collection and its items, stored under a draft id
 * of its own, so the full Mind editor works on it. Save puts it back into
 * the owner's Mind, leaving alone what only the owner sets (sharing,
 * publishing, which chats it collects from).
 */
/** Each person editing a shared collection works on a copy of their own, so two editors never share one. */
export const shareKey = (owner: string, collectionId: string, editor: string) => `share:${owner}:${collectionId}:${editor}`;

/**
 * One collection of a Mind, as the people it's shared with get it: a Mind of
 * its own with only that collection's shared items. Null if it's gone.
 */
export function projectCollection(m: Mind | null | undefined, collectionId: string): Mind | null {
  const found = m?.collections.find((c) => c.id === collectionId);
  if (!m || !found) return null;
  const blocks = Object.fromEntries(collectionItems(m, found).map((b) => [b.id, b]));
  return { version: 6, collections: [found], current: found.id, blocks };
}

/** A fresh copy of someone's collection for `editor` to edit; returns the key the editor works under. */
export function startShareDraft(owner: string, collectionId: string, editor: string) {
  const key = shareKey(owner, collectionId, editor);
  const copy = projectCollection(mindOf(owner), collectionId);
  if (copy) updateMind(draftOf(key), () => ({ ...(JSON.parse(JSON.stringify(copy)) as Mind), draftBase: Object.keys(copy.blocks) }));
  return key;
}

/**
 * Puts `editor`'s edited copy back into its owner's Mind. The copy's items and
 * their order win (the last save does), but what the owner did meanwhile isn't
 * thrown away: items they added stay (at the top of the collection), an item
 * they moved to another collection stays there, and each item's own sharing
 * is theirs.
 */
export function commitShareDraft(owner: string, collectionId: string, editor: string) {
  const draft = load(true)[draftOf(shareKey(owner, collectionId, editor))] as Mind | undefined;
  const edited = draft?.collections[0];
  if (!draft || !edited) return;
  const base = new Set(draft.draftBase ?? []);
  const saved = collectionItems(draft, edited);
  const savedIds = new Set(saved.map((b) => b.id));
  updateMind(owner, (m) => {
    const before = m.collections.find((c) => c.id === collectionId);
    if (!before) return m;
    const blocks = { ...m.blocks };
    const current = collectionItems(m, before);
    // Removed by the editor: there when the copy was made, gone from it now.
    current.forEach((b) => { if (base.has(b.id) && !savedIds.has(b.id)) delete blocks[b.id]; });
    // Added by the owner since: never in the copy.
    const ownerAdded = current.filter((b) => !base.has(b.id) && !savedIds.has(b.id)).map((b) => b.id);
    const elsewhere = new Set(m.collections.filter((c) => c.id !== collectionId).flatMap((c) => collectionItems(m, c).map((b) => b.id)));
    const keep = (ids: string[]) => ids.filter((id) => !elsewhere.has(id));
    saved.forEach((b) => {
      if (!elsewhere.has(b.id)) blocks[b.id] = { ...b, sharing: m.blocks[b.id]?.sharing };
    });
    const col: Collection = {
      ...edited,
      items: [...keep(edited.items), ...ownerAdded],
      sharing: before.sharing, published: before.published, from: before.from, chatIds: before.chatIds,
    };
    return { ...m, blocks, collections: m.collections.map((c) => (c.id === collectionId ? col : c)) };
  });
}

/** Every person's Mind on this device, by whose it is (not group Minds, not copies being edited). */
export function peopleMinds(): [string, Mind][] {
  return Object.entries(load()).filter(([id, m]) => !id.startsWith("draft:") && !id.startsWith("group:") && (m as Mind)?.version === 6) as [string, Mind][];
}

/**
 * Fills in an item after the fact (a title looked up from its link, a book's
 * cover), if it's still there. `fn` sees the item as it is now and returns
 * what to change, or null. A Mind that's gone (a closed editor's copy) is
 * left alone rather than made again.
 */
export function amendBlock(storeId: string, blockId: string, fn: (b: Block) => Partial<Block> | null) {
  const b = (load(true)[storeId] as Mind | undefined)?.blocks?.[blockId];
  const patch = b ? fn(b) : null;
  if (patch) updateMind(storeId, (m) => (m.blocks[blockId] ? patchBlock(m, blockId, patch) : m));
}

export function useMind(userId: string) {
  const mind = useSyncExternalStore(subscribe, () => mindOf(userId), () => null);
  const update = useCallback((fn: (m: Mind) => Mind) => updateMind(userId, fn), [userId]);
  return { mind, update };
}

/* ---------------------------------------------------------------------------
   Queries and edits
--------------------------------------------------------------------------- */

export const collectionOf = (mind: Mind, id: string | null) => mind.collections.find((c) => c.id === id) ?? mind.collections[0] ?? null;

/** Everything in a collection, in order. */
export function collectionItems(mind: Mind, c: Collection) {
  return c.items.map((id) => mind.blocks[id]).filter(Boolean);
}
export function tagsOf(items: Block[]) {
  const count = new Map<string, number>();
  items.forEach((b) => (b.tags ?? []).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Where an item lives: its collection (Unassigned, if it's waiting to be sorted). */
export function locate(mind: Mind, blockId: string) {
  const c = mind.collections.find((x) => x.items.includes(blockId));
  return c ? { collection: c, unsorted: isUnassigned(c) } : null;
}

export function patchCollection(mind: Mind, id: string, fn: (c: Collection) => Collection): Mind {
  return { ...mind, collections: mind.collections.map((c) => (c.id === id ? fn(c) : c)) };
}
export function patchBlock(mind: Mind, id: string, patch: Partial<Block>): Mind {
  // Gone meanwhile (deleted in another tab while a sheet was open): nothing to change, and no half-made item left behind.
  if (!mind.blocks[id]) return mind;
  return { ...mind, blocks: { ...mind.blocks, [id]: { ...mind.blocks[id], ...patch, updatedAt: Date.now() } } };
}
/** When an item last changed: its last edit, or when it was made. */
export const modifiedAt = (b: Block) => b.updatedAt ?? b.createdAt;

/** Take an item out of wherever it is. */
export function detach(mind: Mind, blockId: string): Mind {
  return {
    ...mind,
    collections: mind.collections.map((c) => ({ ...c, items: c.items.filter((id) => id !== blockId) })),
  };
}

/** Put an item in a collection, before another item or at the end. Leaving Unassigned empty clears it away. */
export function place(mind: Mind, blockId: string, to: { collectionId: string; beforeId?: string | null }): Mind {
  let out = detach(mind, blockId);
  if (to.collectionId === UNASSIGNED && !out.collections.some(isUnassigned)) out = { ...out, collections: [unassignedCollection(), ...out.collections] };
  return tidy(patchCollection(out, to.collectionId, (c) => {
    const list = [...c.items];
    const at = to.beforeId ? list.indexOf(to.beforeId) : -1;
    list.splice(at >= 0 ? at : list.length, 0, blockId);
    return { ...c, items: list };
  }));
}

export function removeBlock(mind: Mind, id: string): Mind {
  const out = detach(mind, id);
  const blocks = { ...out.blocks };
  delete blocks[id];
  return tidy({ ...out, blocks });
}

/* ---------------------------------------------------------------------------
   Save to Mind — a message kept from a chat
--------------------------------------------------------------------------- */

/**
 * Chat → Mind: a live reference to the message. It goes where that chat's
 * saves went before (once you've sorted one, Mind remembers), else to
 * Unassigned, to sort when you're ready.
 */
export function saveToMind(userId: string, save: { chatId: string; messageId: string; title: string }) {
  load(true);
  const mind = mindOf(userId);
  const existing = Object.values(mind.blocks).find((b) => b.ref?.chatId === save.chatId && b.ref?.messageId === save.messageId);
  if (existing) return { status: "exists" as const, blockId: existing.id, collection: locate(mind, existing.id)?.collection ?? null };
  const home = mind.collections.find((c) => !isUnassigned(c) && c.chatIds.includes(save.chatId));
  const id = newId();
  updateMind(userId, (m) => {
    const next = { ...m, blocks: { ...m.blocks, [id]: { id, kind: "chat" as const, title: save.title, ref: { chatId: save.chatId, messageId: save.messageId }, tags: [], createdAt: Date.now() } } };
    return home && next.collections.some((c) => c.id === home.id) ? place(next, id, { collectionId: home.id, beforeId: next.collections.find((c) => c.id === home.id)!.items[0] }) : intoUnassigned(next, id);
  });
  return { status: "saved" as const, blockId: id, collection: locate(mindOf(userId), id)?.collection ?? null };
}

/** When a save is moved elsewhere, remember which collection that chat belongs to. */
export function learnChat(mind: Mind, collectionId: string, chatId: string): Mind {
  return {
    ...mind,
    collections: mind.collections.map((c) => ({
      ...c,
      chatIds: c.id === collectionId ? [...new Set([...c.chatIds, chatId])] : c.chatIds.filter((x) => x !== chatId),
    })),
  };
}
