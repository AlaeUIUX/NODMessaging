"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Attachment } from "./types";

/**
 * Mind — each person's own organising space.
 *
 *   Mind → Collections (folders) → Pages and sub-pages → Sections → Items
 *
 * A collection is a plain folder: a name, an icon, its pages, and a Vault
 * where saves from chats wait to be sorted. Everything inside is made with
 * the + button. Items saved from a chat keep a reference to the message and
 * stay live.
 */

export type MindView = "shelf" | "list" | "grid" | "board";
export type BlockKind =
  | "note" | "todo" | "link" | "video" | "book" | "quote" | "flashcard" | "image" | "file"
  | "palette" | "progress" | "habit" | "amount" | "date" | "chat";
export type TaskStatus = "todo" | "doing" | "done";

export interface Block {
  id: string;
  kind: BlockKind;
  title: string;
  body?: string;
  url?: string;
  source?: string;
  image?: string;
  /** Uploaded image or file, bytes in IndexedDB (see lib/chat/media). */
  attachment?: Attachment;
  tags: string[];
  createdAt: number;
  status?: TaskStatus;
  shelf?: "want" | "reading" | "read";
  done?: boolean;
  back?: string;
  due?: boolean;
  value?: number;
  total?: number;
  colors?: string[];
  duration?: string;
  size?: number;
  amount?: number;
  paid?: boolean;
  /** Amounts: when it's due. Dates: the day itself. */
  at?: number;
  /** Habits: the days it was done (YYYY-MM-DD). */
  days?: string[];
  ref?: { chatId: string; messageId: string };
  note?: string;
}

export interface Section { id: string; title: string; emoji: string; collapsed: boolean; blockIds: string[] }

export interface Page {
  id: string;
  title: string;
  emoji: string;
  tone: string;
  parentId?: string;
  view: MindView;
  views: MindView[];
  sections: Section[];
  /** What the quick-add field makes on this page. */
  defaultKind: BlockKind;
  pinned?: boolean;
  collapsed?: boolean;
}

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  tone: string;
  pages: Page[];
  /** Saves waiting to be sorted into a page. */
  vault: string[];
  /** Chats whose saves usually land here; learned when you correct a save. */
  chatIds: string[];
}

export interface Mind {
  version: 3;
  collections: Collection[];
  /** The collection opened last; saves fall back to it. */
  current: string | null;
  blocks: Record<string, Block>;
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
export function lastSevenDays() {
  return Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - (6 - i) * DAY));
}

/* ---------------------------------------------------------------------------
   Making things
--------------------------------------------------------------------------- */

export const newId = (p = "b") => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A new collection is an empty folder. */
export function makeCollection(name: string, emoji: string, tone: string): Collection {
  return { id: newId("c"), name: name.trim() || "Untitled", emoji, tone, pages: [], vault: [], chatIds: [] };
}

export function blankPage(title: string, emoji: string, tone: string, defaultKind: BlockKind, parentId?: string): Page {
  return {
    id: newId("p"), title, emoji, tone, parentId, view: "list", views: ["list", "grid", "shelf", "board"], defaultKind,
    sections: [{ id: newId("s"), title: "", emoji: "", collapsed: false, blockIds: [] }],
  };
}

/* ---------------------------------------------------------------------------
   Seeds — plain folders, filled the way a person would fill them
--------------------------------------------------------------------------- */

type Item = Omit<Block, "id" | "createdAt" | "tags"> & { tags?: string[] };
type SeedPage = Omit<Page, "id" | "sections" | "parentId" | "views" | "tone"> & { tone?: string; views?: MindView[]; sections: { title: string; emoji: string; collapsed?: boolean; items: Item[] }[]; children?: SeedPage[] };
type SeedCollection = Omit<Collection, "id" | "pages" | "vault"> & { id: string; pages: SeedPage[]; vault: Item[] };

function build(collections: SeedCollection[], current: string | null): Mind {
  const blocks: Record<string, Block> = {};
  let n = 0;
  let t = Date.now();
  const add = (it: Item) => {
    const id = `b${(++n).toString(36)}`;
    t -= 41 * 60_000;
    blocks[id] = { ...it, tags: it.tags ?? [], id, createdAt: t };
    return id;
  };
  const pages = (list: SeedPage[], tone: string, parentId?: string): Page[] => list.flatMap((sp) => {
    const id = `p${(++n).toString(36)}`;
    const page: Page = {
      id, title: sp.title, emoji: sp.emoji, tone: sp.tone ?? tone, parentId, view: sp.view,
      views: sp.views ?? ([sp.view, "list"].filter((v, i, a) => a.indexOf(v) === i) as MindView[]),
      defaultKind: sp.defaultKind, pinned: sp.pinned, collapsed: sp.collapsed,
      sections: sp.sections.map((s) => ({ id: `s${(++n).toString(36)}`, title: s.title, emoji: s.emoji, collapsed: !!s.collapsed, blockIds: s.items.map(add) })),
    };
    return [page, ...pages(sp.children ?? [], tone, id)];
  });
  return {
    version: 3,
    current,
    blocks,
    collections: collections.map((c) => ({ ...c, pages: pages(c.pages, c.tone), vault: c.vault.map(add) })),
  };
}

const photo = (id: string, w = 700) => `https://images.unsplash.com/${id}?w=${w}&q=70&fm=jpg`;
const card = (front: string, back: string, due = false, tags: string[] = []): Item => ({ kind: "flashcard", title: front, back, due, tags });
const one = (items: Item[]) => [{ title: "", emoji: "", items }];

function alaeMind(): Mind {
  return build([
    {
      id: "c-german", name: "German", emoji: "🇩🇪", tone: "#C99432", chatIds: [],
      vault: [{ kind: "link", title: "Tandem: find a language exchange partner", source: "tandem.net", url: "https://tandem.net" }],
      pages: [
        {
          title: "Vocab", emoji: "🃏", view: "grid", views: ["grid", "list", "shelf"], defaultKind: "flashcard",
          sections: [
            { title: "Everyday", emoji: "☕️", items: [
              card("der Feierabend", "the end of the working day"), card("gemütlich", "cosy, comfortable"),
              card("die Verabredung", "an appointment, a date"), card("die Rechnung", "the bill"),
              card("der Bahnhof", "the train station"), card("das Brötchen", "bread roll"),
            ] },
            { title: "Work", emoji: "💼", items: [
              card("unterschreiben", "to sign", false, ["work"]), card("die Besprechung", "the meeting", false, ["work"]), card("der Termin", "the appointment", false, ["work"]),
            ] },
          ],
        },
        {
          title: "Verbs", emoji: "🔁", view: "grid", views: ["grid", "list"], defaultKind: "flashcard",
          sections: one([
            card("sich freuen auf", "to look forward to"), card("etwas vorhaben", "to have plans"),
            { kind: "note", title: "Verb goes last after “weil”", body: "Ich lerne Deutsch, weil ich in Wien arbeite." },
          ]),
          children: [
            { title: "Separable verbs", emoji: "✂️", view: "grid", defaultKind: "flashcard", sections: one([
              card("anrufen", "to call (ruft … an)"), card("aufstehen", "to get up (steht … auf)"), card("einkaufen", "to shop (kauft … ein)"),
            ]) },
            { title: "Irregular verbs", emoji: "⚡️", view: "grid", defaultKind: "flashcard", sections: one([
              card("gehen · ging · gegangen", "to go"), card("sehen · sah · gesehen", "to see"),
            ]) },
          ],
        },
        {
          title: "Grammar", emoji: "📚", view: "shelf", views: ["shelf", "list"], defaultKind: "link",
          sections: [
            { title: "Books", emoji: "📚", items: [
              { kind: "book", title: "Hammer's German Grammar and Usage", source: "Martin Durrell", shelf: "reading" },
              { kind: "book", title: "Grammatik aktiv A1–B1", source: "Cornelsen", shelf: "reading" },
              { kind: "book", title: "Schaum's Outline of German Grammar", source: "Elke Gschossmann-Hendershot", shelf: "want" },
            ] },
            { title: "Links", emoji: "🔗", items: [
              { kind: "link", title: "Dative or accusative? The only chart you need", source: "learngerman.dw.com", url: "https://learngerman.dw.com", tags: ["cases"] },
              { kind: "link", title: "Where the verb goes in a subordinate clause", source: "yourdailygerman.com", url: "https://yourdailygerman.com" },
            ] },
          ],
        },
        {
          title: "Listening", emoji: "🎧", view: "shelf", views: ["shelf", "list"], defaultKind: "video",
          sections: one([
            { kind: "video", title: "German cases in 12 minutes", source: "Learn German with Anja", duration: "12:04", tags: ["cases"] },
            { kind: "video", title: "Street interviews: what do you do after work?", source: "Easy German", duration: "18:32" },
          ]),
        },
      ],
    },
    {
      id: "c-work", name: "Work", emoji: "💼", tone: "#3E67A6", chatIds: ["general", "dm"],
      vault: [],
      pages: [
        { title: "Spaces launch", emoji: "🚀", view: "list", defaultKind: "todo", sections: [
          { title: "From the team chat", emoji: "💬", items: [
            { kind: "chat", title: "Launch checklist", ref: { chatId: "general", messageId: "g-10" } },
            { kind: "chat", title: "Kickoff brief · Spaces v2", ref: { chatId: "general", messageId: "g-7" } },
          ] },
          { title: "My tasks", emoji: "✅", items: [
            { kind: "todo", title: "Mock the QR code on the handoff screen" },
            { kind: "todo", title: "Review Charles's implementation", done: true },
          ] },
        ] },
      ],
    },
    {
      id: "c-trip", name: "Trip ideas", emoji: "✈️", tone: "#5B8A6B", chatIds: [],
      vault: [],
      pages: [
        { title: "Vienna weekend", emoji: "🎡", view: "list", defaultKind: "note", sections: one([
          { kind: "date", title: "Train to Vienna", at: Date.now() + 18 * DAY },
          { kind: "link", title: "Café Sperl", source: "cafesperl.at", url: "https://cafesperl.at" },
          { kind: "note", title: "To try", body: "Sachertorte, the Naschmarkt on Saturday morning, a Heuriger in Grinzing." },
        ]) },
      ],
    },
  ], "c-german");
}

function charlesMind(): Mind {
  const task = (title: string, status: TaskStatus, tags: string[] = []): Item => ({ kind: "todo", title, status, done: status === "done", tags });
  return build([
    {
      id: "c-acme", name: "Acme Co", emoji: "🌐", tone: "#3E67A6", chatIds: [],
      vault: [],
      pages: [
        { title: "Website redesign", emoji: "🗂️", view: "board", views: ["board", "list"], defaultKind: "todo", sections: [
          { title: "Tasks", emoji: "🗂️", items: [
            task("Homepage hero in Figma", "done"), task("Pricing page copy", "doing"), task("CMS migration", "doing"),
            task("Accessibility audit", "todo", ["urgent"]), task("Handoff to Acme's developers", "todo"),
          ] },
          { title: "Dates", emoji: "📅", items: [{ kind: "date", title: "Acme launch", at: Date.now() + 5 * DAY }] },
        ] },
        { title: "References", emoji: "📎", view: "list", defaultKind: "link", sections: one([
          { kind: "link", title: "Acme · Web v3", source: "figma.com", url: "https://figma.com" },
          { kind: "link", title: "Competitor teardown: linear.app", source: "linear.app", url: "https://linear.app" },
          { kind: "note", title: "Call · 12 Sep", body: "They want the hero calmer: less gradient, more product. Dana signs off copy." },
        ]) },
      ],
    },
    {
      id: "c-lumen", name: "Lumen", emoji: "📱", tone: "#86507A", chatIds: [],
      vault: [],
      pages: [
        { title: "iOS app 1.4", emoji: "🗂️", view: "board", views: ["board", "list"], defaultKind: "todo", sections: [
          { title: "Tasks", emoji: "🗂️", items: [
            task("Sign in with Apple", "done"), task("TestFlight build 1.4", "done"), task("Onboarding flow v2", "doing"),
            task("Push notification copy", "todo"), task("App Store screenshots", "todo"),
          ] },
          { title: "Dates", emoji: "📅", items: [{ kind: "date", title: "App review", at: Date.now() + 12 * DAY }] },
        ] },
      ],
    },
    {
      id: "c-nod", name: "NOD", emoji: "🚀", tone: "#C99432", chatIds: ["general", "dm"],
      vault: [
        { kind: "chat", title: "Can you review the latest implementation?", ref: { chatId: "dm", messageId: "dm-5" } },
        { kind: "chat", title: "QR code idea", ref: { chatId: "general", messageId: "g-3" } },
      ],
      pages: [
        { title: "Spaces launch", emoji: "🚀", view: "list", views: ["list", "grid"], defaultKind: "todo", sections: [
          { title: "From the team chat", emoji: "💬", items: [
            { kind: "chat", title: "Launch checklist", ref: { chatId: "general", messageId: "g-10" } },
            { kind: "chat", title: "Where for lunch on Friday?", ref: { chatId: "general", messageId: "g-9" } },
            { kind: "chat", title: "CLAUDE.md", ref: { chatId: "general", messageId: "g-8" } },
          ] },
          { title: "My tasks", emoji: "✅", items: [task("Review Alae's latest implementation", "doing", ["urgent"])] },
        ] },
      ],
    },
    {
      id: "c-money", name: "Money", emoji: "💶", tone: "#5B8A6B", chatIds: [],
      vault: [],
      pages: [
        { title: "Invoices", emoji: "🧾", view: "list", defaultKind: "amount", sections: one([
          { kind: "amount", title: "INV-041", source: "Acme Co", amount: 3200, paid: true, at: Date.now() - 6 * DAY },
          { kind: "amount", title: "INV-042", source: "Lumen", amount: 2400, paid: false, at: Date.now() + 3 * DAY },
          { kind: "amount", title: "INV-043", source: "NOD", amount: 1800, paid: false, at: Date.now() - 2 * DAY, tags: ["urgent"] },
        ]) },
        { title: "Admin", emoji: "📋", view: "list", defaultKind: "todo", sections: one([
          task("File the quarterly VAT return", "todo", ["urgent"]),
          { kind: "note", title: "Rates 2026", body: "€95 an hour · €720 a day · 50% upfront on new clients." },
        ]) },
      ],
    },
  ], "c-acme");
}

function reemaMind(): Mind {
  const img = (id: string, title: string): Item => ({ kind: "image", title, image: photo(id), source: "pinterest.com" });
  return build([
    {
      id: "c-home", name: "Home ideas", emoji: "🏡", tone: "#5B8A6B", chatIds: ["reema"],
      vault: [img("photo-1586023492125-27b2c045efd7", "Green velvet chair")],
      pages: [
        { title: "Living room", emoji: "🛋️", view: "grid", views: ["grid", "list"], defaultKind: "image", sections: one([
          img("photo-1616046229478-9901c5536a45", "Sage walls and a round mirror"),
          { kind: "palette", title: "Sage & oak", colors: ["#8A9A7B", "#C9B79C", "#EDE6DA", "#5B4636", "#2F3A2F"] },
          img("photo-1493663284031-b7e3aefcae8e", "Teal cushions"),
          { kind: "link", title: "Oak side table", source: "hay.com", url: "https://hay.com" },
          img("photo-1484101403633-562f891dc89a", "A soft grey sofa"),
          img("photo-1616137466211-f939a420be84", "All white, lots of light"),
        ]) },
        { title: "Bedroom", emoji: "🛏️", view: "grid", views: ["grid", "list"], defaultKind: "image", tone: "#C99432", sections: one([
          img("photo-1615874959474-d609969a20ed", "Rattan lamp and linen"),
          { kind: "quote", title: "Have nothing in your house that you do not know to be useful, or believe to be beautiful.", body: "William Morris" },
          img("photo-1505693416388-ac5ce068fe85", "Tufted headboard"),
          img("photo-1512918728675-ed5a9ecdebfd", "Low bed, warm wood"),
        ]) },
        { title: "Plants", emoji: "🌿", view: "grid", views: ["grid", "list"], defaultKind: "image", sections: one([
          img("photo-1519710164239-da123dc03ef4", "One plant, one chair"),
          { kind: "note", title: "Monstera", body: "Water every 7 to 10 days. Bright, indirect light." },
          img("photo-1598928506311-c55ded91a20c", "A little jungle"),
        ]) },
        { title: "Dream house", emoji: "🏠", view: "grid", views: ["grid", "list"], defaultKind: "image", tone: "#3E67A6", sections: one([
          img("photo-1600585154340-be6161a56a0c", "Big windows, big tree"),
          img("photo-1502005229762-cf1b2da7c5d6", "Floating stairs"),
          img("photo-1585412727339-54e4bae3bbf9", "Coffered ceiling"),
        ]) },
      ],
    },
  ], "c-home");
}

/** Alae, Charles and Reema have been using Mind for a while; everyone else starts blank. */
export function seedMind(userId: string): Mind {
  if (userId === "me") return alaeMind();
  if (userId === "charles") return charlesMind();
  if (userId === "reema") return reemaMind();
  return { version: 3, collections: [], current: null, blocks: {} };
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
  return cache!;
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
  if (!all[userId] || all[userId].version !== 3) {
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
export function useMind(userId: string) {
  const mind = useSyncExternalStore(subscribe, () => mindOf(userId), () => null);
  const update = useCallback((fn: (m: Mind) => Mind) => updateMind(userId, fn), [userId]);
  return { mind, update };
}

/* ---------------------------------------------------------------------------
   Queries and edits
--------------------------------------------------------------------------- */

export const collectionOf = (mind: Mind, id: string | null) => mind.collections.find((c) => c.id === id) ?? mind.collections[0] ?? null;

export function pageItems(mind: Mind, page: Page) {
  return page.sections.flatMap((s) => s.blockIds.map((id) => mind.blocks[id]).filter(Boolean));
}
export function collectionItems(mind: Mind, c: Collection) {
  return [...c.pages.flatMap((p) => pageItems(mind, p)), ...c.vault.map((id) => mind.blocks[id]).filter(Boolean)];
}
export function childrenOf(c: Collection, pageId: string) {
  return c.pages.filter((p) => p.parentId === pageId);
}
export function tagsOf(items: Block[]) {
  const count = new Map<string, number>();
  items.forEach((b) => b.tags.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Where an item lives: collection, then page and section, or its Vault. */
export function locate(mind: Mind, blockId: string) {
  for (const c of mind.collections) {
    if (c.vault.includes(blockId)) return { collection: c, page: null, section: null };
    for (const page of c.pages) for (const section of page.sections) {
      if (section.blockIds.includes(blockId)) return { collection: c, page, section };
    }
  }
  return null;
}

export function patchCollection(mind: Mind, id: string, fn: (c: Collection) => Collection): Mind {
  return { ...mind, collections: mind.collections.map((c) => (c.id === id ? fn(c) : c)) };
}
export function patchPage(mind: Mind, pageId: string, fn: (p: Page) => Page): Mind {
  return { ...mind, collections: mind.collections.map((c) => ({ ...c, pages: c.pages.map((p) => (p.id === pageId ? fn(p) : p)) })) };
}
export function patchBlock(mind: Mind, id: string, patch: Partial<Block>): Mind {
  return { ...mind, blocks: { ...mind.blocks, [id]: { ...mind.blocks[id], ...patch } } };
}

/** Take an item out of wherever it is. */
export function detach(mind: Mind, blockId: string): Mind {
  return {
    ...mind,
    collections: mind.collections.map((c) => ({
      ...c,
      vault: c.vault.filter((id) => id !== blockId),
      pages: c.pages.map((p) => ({ ...p, sections: p.sections.map((s) => ({ ...s, blockIds: s.blockIds.filter((id) => id !== blockId) })) })),
    })),
  };
}

/** Put an item into a section (before another item, or at the end), or into a collection's Vault. */
export function place(mind: Mind, blockId: string, to: { collectionId: string; pageId?: string | null; sectionId?: string | null; beforeId?: string | null }): Mind {
  const out = detach(mind, blockId);
  return patchCollection(out, to.collectionId, (c) => {
    if (!to.pageId) return { ...c, vault: [blockId, ...c.vault] };
    return {
      ...c,
      pages: c.pages.map((p) => {
        if (p.id !== to.pageId) return p;
        const sid = to.sectionId ?? p.sections[0]?.id;
        return {
          ...p,
          sections: p.sections.map((s) => {
            if (s.id !== sid) return s;
            const list = [...s.blockIds];
            const at = to.beforeId ? list.indexOf(to.beforeId) : -1;
            list.splice(at >= 0 ? at : list.length, 0, blockId);
            return { ...s, blockIds: list };
          }),
        };
      }),
    };
  });
}

export function removeBlock(mind: Mind, id: string): Mind {
  const out = detach(mind, id);
  const blocks = { ...out.blocks };
  delete blocks[id];
  return { ...out, blocks };
}

/* ---------------------------------------------------------------------------
   Save to Mind — work out where a message belongs
--------------------------------------------------------------------------- */

const words = (s: string) => s.toLowerCase().match(/[a-zà-ÿß]{4,}/g)?.map((w) => w.replace(/s$/, "")) ?? [];

export interface Route { collectionId: string; reason: string }

export function routeSave(mind: Mind, input: { text: string; chatId: string; chatName: string; kind: "text" | "card" | "photos" | "file"; cardType?: string }): Route | null {
  if (!mind.collections.length) return null;
  let best: { c: Collection; score: number; reason: string } | null = null;
  const tokens = new Set(words(input.text));
  for (const c of mind.collections) {
    let score = 0;
    let reason = "";
    const bump = (n: number, why: string) => { score += n; if (!reason || n >= 3) reason = why; };
    if (c.chatIds.includes(input.chatId)) bump(3, `you keep ${input.chatName} here`);
    const items = collectionItems(mind, c);
    const vocab = new Set([c.name, ...c.pages.map((p) => p.title), ...tagsOf(items), ...items.slice(0, 80).map((b) => b.title)].flatMap(words));
    const hits = [...tokens].filter((w) => vocab.has(w));
    if (hits.length) bump(Math.min(4, hits.length * 1.5), `it mentions “${hits[0]}”`);
    if (input.kind === "photos" && items.filter((b) => b.kind === "image").length > 2) bump(2, "it's a photo, like the rest");
    if ((input.cardType === "payment" || input.cardType === "bill") && items.some((b) => b.kind === "amount")) bump(3, "it's about money");
    if ((input.cardType === "plan" || input.cardType === "event") && items.some((b) => b.kind === "date")) bump(2, "it's a plan");
    if (input.cardType === "project" && items.some((b) => b.kind === "todo")) bump(1.5, "it's a task list");
    if ((input.cardType === "checklist" || input.cardType === "poll") && items.some((b) => b.kind === "todo")) bump(1.5, "it's a task");
    if (c.id === mind.current) bump(0.5, "it's the collection you had open");
    if (!best || score > best.score) best = { c, score, reason };
  }
  return best ? { collectionId: best.c.id, reason: best.reason || "it's your main collection" } : null;
}

/** Chat → Mind: a live reference lands in a collection's Vault. */
export function saveToMind(userId: string, save: { chatId: string; messageId: string; title: string; text: string; chatName: string; kind: "text" | "card" | "photos" | "file"; cardType?: string }) {
  load(true);
  const mind = mindOf(userId);
  const existing = Object.values(mind.blocks).find((b) => b.ref?.chatId === save.chatId && b.ref?.messageId === save.messageId);
  if (existing) {
    const at = locate(mind, existing.id);
    return { status: "exists" as const, blockId: existing.id, collection: at?.collection ?? null, reason: "" };
  }
  const route = routeSave(mind, save);
  if (!route) return { status: "no-collection" as const, blockId: null, collection: null, reason: "" };
  const id = newId();
  updateMind(userId, (m) => place(
    { ...m, blocks: { ...m.blocks, [id]: { id, kind: "chat", title: save.title, ref: { chatId: save.chatId, messageId: save.messageId }, tags: [], createdAt: Date.now() } } },
    id,
    { collectionId: route.collectionId },
  ));
  return { status: "saved" as const, blockId: id, collection: collectionOf(mindOf(userId), route.collectionId), reason: route.reason };
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
