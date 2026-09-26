"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Attachment } from "./types";

/**
 * Mind — each person's own organising space.
 *
 *   Mind → Collections (German, French, Freelance…) → Pages (and sub-pages)
 *        → Sections → Items
 *
 * A collection also has a Vault (unsorted saves) and a home made of widgets.
 * Widgets only ever compute from items, so everything on screen is something
 * the person made with the + button. Items saved from a chat keep a reference
 * to the message and stay live.
 */

export type MindView = "shelf" | "list" | "grid" | "board";
export type BlockKind =
  | "note" | "todo" | "link" | "video" | "book" | "quote" | "flashcard" | "image" | "file"
  | "palette" | "progress" | "habit" | "amount" | "date" | "chat";
export type TaskStatus = "todo" | "doing" | "done";
export type WidgetKind =
  | "streak" | "review" | "word" | "progress" | "totals" | "needs" | "countdown"
  | "covers" | "recent" | "pinned" | "vault" | "tags";

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

export interface Widget { id: string; kind: WidgetKind }

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  tone: string;
  tagline?: string;
  pages: Page[];
  vault: string[];
  widgets: Widget[];
  /** Days with practice (reviews, habits) — what streaks are made of. */
  activity: string[];
  /** Chats whose saves usually land here; learned when you correct a save. */
  chatIds: string[];
  /** A language collection's language, for routing saves (de, fr, es, it). */
  lang?: string;
}

export interface Mind {
  version: 2;
  collections: Collection[];
  current: string | null;
  blocks: Record<string, Block>;
  /** A guided setup shown on an empty Mind (Jamshad's demo). */
  guide?: "pitch";
  guideDismissed?: boolean;
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

/** Consecutive days of practice, counting back from today (or yesterday). */
export function streakOf(days: string[]) {
  const set = new Set(days);
  let t = Date.now();
  if (!set.has(dayKey(t))) t -= DAY;
  let n = 0;
  while (set.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}
export function lastSevenDays() {
  return Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - (6 - i) * DAY));
}
/** A stable pick for "of the day" widgets. */
export function dayIndex(n: number) {
  return n ? Math.floor(Date.now() / DAY) % n : 0;
}

/* ---------------------------------------------------------------------------
   Templates — how a collection starts
--------------------------------------------------------------------------- */

type PageSpec = { title: string; emoji: string; view: MindView; views: MindView[]; defaultKind: BlockKind; sections?: [string, string][]; parent?: string };

export interface CollectionTemplate {
  id: string;
  name: string;
  emoji: string;
  tone: string;
  blurb: string;
  pages: PageSpec[];
  widgets: WidgetKind[];
  askLanguage?: boolean;
}

const LIST: MindView[] = ["list", "grid", "shelf"];

export const COLLECTION_TEMPLATES: CollectionTemplate[] = [
  {
    id: "language", name: "Learn a language", emoji: "🗣️", tone: "#C99432", blurb: "Vocab, verbs, grammar, listening and phrases", askLanguage: true,
    pages: [
      { title: "Vocab", emoji: "🃏", view: "grid", views: ["grid", "list", "shelf"], defaultKind: "flashcard" },
      { title: "Verbs", emoji: "🔁", view: "grid", views: ["grid", "list"], defaultKind: "flashcard" },
      { title: "Grammar", emoji: "📚", view: "shelf", views: ["shelf", "list"], defaultKind: "link", sections: [["📚", "Books"], ["🔗", "Links"]] },
      { title: "Listening", emoji: "🎧", view: "shelf", views: ["shelf", "list"], defaultKind: "video" },
      { title: "Phrases", emoji: "💬", view: "list", views: ["list", "grid"], defaultKind: "quote" },
    ],
    widgets: ["streak", "review", "word"],
  },
  {
    id: "project", name: "Client work", emoji: "💼", tone: "#3E67A6", blurb: "Tasks on a board, references, notes and money",
    pages: [
      { title: "Tasks", emoji: "🗂️", view: "board", views: ["board", "list"], defaultKind: "todo" },
      { title: "References", emoji: "📎", view: "list", views: LIST, defaultKind: "link" },
      { title: "Notes", emoji: "📝", view: "list", views: ["list", "grid"], defaultKind: "note" },
      { title: "Money", emoji: "💶", view: "list", views: ["list"], defaultKind: "amount" },
    ],
    widgets: ["needs", "countdown", "totals"],
  },
  {
    id: "moodboard", name: "Moodboard", emoji: "🎨", tone: "#5B8A6B", blurb: "Pictures, colours and a few words",
    pages: [{ title: "Inspiration", emoji: "✨", view: "grid", views: ["grid", "list"], defaultKind: "image" }],
    widgets: ["covers", "recent"],
  },
  {
    id: "reading", name: "Reading list", emoji: "📖", tone: "#86507A", blurb: "Want to read, reading, finished",
    pages: [
      { title: "Reading", emoji: "📖", view: "shelf", views: ["shelf", "list"], defaultKind: "book" },
      { title: "Want to read", emoji: "🔖", view: "shelf", views: ["shelf", "list"], defaultKind: "book" },
      { title: "Highlights", emoji: "✍️", view: "list", views: ["list"], defaultKind: "quote" },
    ],
    widgets: ["recent", "vault"],
  },
  {
    id: "blank", name: "Blank", emoji: "📄", tone: "#2E2D2B", blurb: "One empty page, nothing else",
    pages: [{ title: "Notes", emoji: "📝", view: "list", views: ["list", "grid", "shelf", "board"], defaultKind: "note" }],
    widgets: ["vault"],
  },
];

export const LANGUAGES: { code: string; name: string; emoji: string }[] = [
  { code: "de", name: "German", emoji: "🇩🇪" },
  { code: "fr", name: "French", emoji: "🇫🇷" },
  { code: "es", name: "Spanish", emoji: "🇪🇸" },
  { code: "it", name: "Italian", emoji: "🇮🇹" },
];

export const newId = (p = "b") => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function makePage(spec: PageSpec, tone: string, parentId?: string): Page {
  return {
    id: newId("p"), title: spec.title, emoji: spec.emoji, tone, parentId, view: spec.view, views: spec.views, defaultKind: spec.defaultKind,
    sections: (spec.sections ?? [["", ""]]).map(([emoji, title]) => ({ id: newId("s"), title, emoji, collapsed: false, blockIds: [] })),
  };
}

export function makeCollection(templateId: string, name: string, opts: { emoji?: string; lang?: string; widgets?: WidgetKind[] } = {}): Collection {
  const t = COLLECTION_TEMPLATES.find((x) => x.id === templateId) ?? COLLECTION_TEMPLATES[4];
  return {
    id: newId("c"), name: name.trim() || t.name, emoji: opts.emoji ?? t.emoji, tone: t.tone,
    pages: t.pages.map((p) => makePage(p, t.tone)),
    vault: [], activity: [], chatIds: [], lang: opts.lang,
    widgets: (opts.widgets ?? t.widgets).map((kind) => ({ id: newId("w"), kind })),
  };
}

export function blankPage(title: string, emoji: string, tone: string, defaultKind: BlockKind, parentId?: string): Page {
  return makePage({ title, emoji, view: "list", views: ["list", "grid", "shelf", "board"], defaultKind }, tone, parentId);
}

/* ---------------------------------------------------------------------------
   Seeds — built only from what the + button can make
--------------------------------------------------------------------------- */

type Item = Omit<Block, "id" | "createdAt" | "tags"> & { tags?: string[] };
type SeedPage = Omit<Page, "id" | "sections" | "parentId" | "views" | "tone"> & { tone?: string; views?: MindView[]; sections: { title: string; emoji: string; collapsed?: boolean; items: Item[] }[]; children?: SeedPage[] };
type SeedCollection = Omit<Collection, "id" | "pages" | "vault" | "widgets"> & { id: string; pages: SeedPage[]; vault: Item[]; widgets: WidgetKind[] };

function build(collections: SeedCollection[], current: string): Mind {
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
      id, title: sp.title, emoji: sp.emoji, tone: sp.tone ?? tone, parentId, view: sp.view, views: sp.views ?? [sp.view, "list"].filter((v, i, a) => a.indexOf(v) === i) as MindView[],
      defaultKind: sp.defaultKind, pinned: sp.pinned, collapsed: sp.collapsed,
      sections: sp.sections.map((s) => ({ id: `s${(++n).toString(36)}`, title: s.title, emoji: s.emoji, collapsed: !!s.collapsed, blockIds: s.items.map(add) })),
    };
    return [page, ...pages(sp.children ?? [], tone, id)];
  });
  return {
    version: 2,
    current,
    blocks,
    collections: collections.map((c) => ({
      ...c,
      pages: pages(c.pages, c.tone),
      vault: c.vault.map(add),
      widgets: c.widgets.map((kind, i) => ({ id: `w${i}-${c.id}`, kind })),
    })),
  };
}

const pastDays = (count: number, skipToday = false) => Array.from({ length: count }, (_, i) => dayKey(Date.now() - (i + (skipToday ? 1 : 0)) * DAY));
const photo = (id: string, w = 700) => `https://images.unsplash.com/${id}?w=${w}&q=70&fm=jpg`;
const card = (front: string, back: string, due = false, tags: string[] = []): Item => ({ kind: "flashcard", title: front, back, due, tags });

function alaeMind(): Mind {
  return build([
    {
      id: "c-german", name: "German", emoji: "🇩🇪", tone: "#C99432", tagline: "A2 → B1 by March", lang: "de",
      activity: pastDays(12, true), chatIds: [],
      widgets: ["streak", "review", "word", "progress", "vault"],
      vault: [
        { kind: "link", title: "Tandem: find a language exchange partner", source: "tandem.net", url: "https://tandem.net" },
      ],
      pages: [
        {
          title: "Vocab", emoji: "🃏", view: "grid", views: ["grid", "list", "shelf"], defaultKind: "flashcard", pinned: true,
          sections: [
            { title: "Everyday", emoji: "☕️", items: [
              card("der Feierabend", "the end of the working day", true, ["work"]),
              card("gemütlich", "cosy, comfortable", true),
              card("die Verabredung", "an appointment, a date", true),
              card("die Rechnung", "the bill", true),
              card("der Bahnhof", "the train station"),
              card("das Brötchen", "bread roll"),
            ] },
            { title: "Work", emoji: "💼", items: [
              card("unterschreiben", "to sign", true, ["work"]),
              card("die Besprechung", "the meeting", false, ["work"]),
              card("der Termin", "the appointment", true, ["work"]),
            ] },
          ],
        },
        {
          title: "Verbs", emoji: "🔁", view: "grid", views: ["grid", "list"], defaultKind: "flashcard",
          sections: [{ title: "", emoji: "", items: [
            card("sich freuen auf", "to look forward to"),
            card("etwas vorhaben", "to have plans"),
            { kind: "note", title: "Verb goes last after “weil”", body: "Ich lerne Deutsch, weil ich in Wien arbeite." },
          ] }],
          children: [
            { title: "Separable verbs", emoji: "✂️", view: "grid", defaultKind: "flashcard", sections: [{ title: "", emoji: "", items: [
              card("anrufen", "to call (ruft … an)"),
              card("aufstehen", "to get up (steht … auf)"),
              card("einkaufen", "to shop (kauft … ein)"),
            ] }] },
            { title: "Irregular verbs", emoji: "⚡️", view: "grid", defaultKind: "flashcard", sections: [{ title: "", emoji: "", items: [
              card("gehen · ging · gegangen", "to go"),
              card("sehen · sah · gesehen", "to see"),
            ] }] },
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
            { title: "Course", emoji: "🎯", items: [
              { kind: "progress", title: "Nicos Weg A2", source: "Lessons", value: 8, total: 20 },
            ] },
          ],
        },
        {
          title: "Listening", emoji: "🎧", view: "shelf", views: ["shelf", "list"], defaultKind: "video",
          sections: [{ title: "", emoji: "", items: [
            { kind: "video", title: "German cases in 12 minutes", source: "Learn German with Anja", duration: "12:04", tags: ["cases"] },
            { kind: "video", title: "Street interviews: what do you do after work?", source: "Easy German", duration: "18:32" },
            { kind: "video", title: "Separable verbs, finally explained", source: "Deutsch mit Marija", duration: "9:47" },
          ] }],
        },
        {
          title: "Phrases", emoji: "💬", view: "list", views: ["list", "grid"], defaultKind: "quote",
          sections: [{ title: "", emoji: "", items: [
            { kind: "quote", title: "Ich verstehe nur Bahnhof.", body: "It's all Greek to me." },
            { kind: "quote", title: "Das ist nicht mein Bier.", body: "Not my problem." },
            { kind: "quote", title: "Aller Anfang ist schwer.", body: "Every beginning is hard." },
          ] }],
        },
      ],
    },
    {
      id: "c-french", name: "French", emoji: "🇫🇷", tone: "#3E67A6", tagline: "Just started", lang: "fr",
      activity: pastDays(2), chatIds: [],
      widgets: ["word", "review"],
      vault: [],
      pages: [
        { title: "Vocab", emoji: "🃏", view: "grid", views: ["grid", "list"], defaultKind: "flashcard", sections: [{ title: "", emoji: "", items: [
          card("la boulangerie", "the bakery", true),
          card("un rendez-vous", "an appointment", true),
          card("d'accord", "okay, agreed"),
        ] }] },
        { title: "Phrases", emoji: "💬", view: "list", defaultKind: "quote", sections: [{ title: "", emoji: "", items: [
          { kind: "quote", title: "C'est la vie.", body: "That's life." },
        ] }] },
      ],
    },
  ], "c-german");
}

function charlesMind(): Mind {
  const task = (title: string, status: TaskStatus, tags: string[] = []): Item => ({ kind: "todo", title, status, done: status === "done", tags });
  return build([
    {
      id: "c-work", name: "Freelance", emoji: "💼", tone: "#3E67A6", tagline: "3 clients · Q3",
      activity: [], chatIds: ["general", "dm"],
      widgets: ["needs", "totals", "countdown", "progress"],
      vault: [
        { kind: "chat", title: "Can you review the latest implementation?", ref: { chatId: "dm", messageId: "dm-5" } },
        { kind: "chat", title: "QR code idea", ref: { chatId: "general", messageId: "g-3" } },
      ],
      pages: [
        {
          title: "Clients", emoji: "🤝", view: "list", defaultKind: "note", pinned: true,
          sections: [{ title: "", emoji: "", items: [
            { kind: "note", title: "Who's who", body: "Acme: Dana (sign-off). Lumen: Theo (product). NOD: Alae (lead)." },
          ] }],
          children: [
            {
              title: "Acme · Website", emoji: "🌐", view: "board", views: ["board", "list"], defaultKind: "todo",
              sections: [
                { title: "Tasks", emoji: "🗂️", items: [
                  task("Homepage hero in Figma", "done", ["acme"]),
                  task("Pricing page copy", "doing", ["acme"]),
                  task("CMS migration", "doing", ["acme"]),
                  task("Accessibility audit", "todo", ["acme", "urgent"]),
                  task("Handoff to Acme's developers", "todo", ["acme"]),
                ] },
                { title: "References", emoji: "📎", items: [
                  { kind: "link", title: "Acme · Web v3", source: "figma.com", url: "https://figma.com", tags: ["acme"] },
                  { kind: "link", title: "Competitor teardown: linear.app", source: "linear.app", url: "https://linear.app", tags: ["acme"] },
                ] },
                { title: "Dates", emoji: "📅", items: [
                  { kind: "date", title: "Acme launch", at: Date.now() + 5 * DAY, tags: ["acme"] },
                ] },
              ],
            },
            {
              title: "Lumen · iOS app", emoji: "📱", view: "board", views: ["board", "list"], defaultKind: "todo", tone: "#86507A",
              sections: [
                { title: "Tasks", emoji: "🗂️", items: [
                  task("Sign in with Apple", "done", ["lumen"]),
                  task("TestFlight build 1.4", "done", ["lumen"]),
                  task("Onboarding flow v2", "doing", ["lumen"]),
                  task("Push notification copy", "todo", ["lumen"]),
                  task("App Store screenshots", "todo", ["lumen"]),
                ] },
                { title: "Dates", emoji: "📅", items: [
                  { kind: "date", title: "Lumen 1.4 review", at: Date.now() + 12 * DAY, tags: ["lumen"] },
                ] },
              ],
            },
            {
              title: "NOD · Spaces launch", emoji: "🚀", view: "list", views: ["list", "grid"], defaultKind: "todo", tone: "#C99432",
              sections: [
                { title: "From the team chat", emoji: "💬", items: [
                  { kind: "chat", title: "Launch checklist", ref: { chatId: "general", messageId: "g-10" }, tags: ["nod"] },
                  { kind: "chat", title: "Where for lunch on Friday?", ref: { chatId: "general", messageId: "g-9" }, tags: ["nod"] },
                  { kind: "chat", title: "CLAUDE.md", ref: { chatId: "general", messageId: "g-8" }, tags: ["nod"] },
                ] },
                { title: "My tasks", emoji: "🗂️", items: [
                  task("Review Alae's latest implementation", "doing", ["nod", "urgent"]),
                  task("QR code on the handoff screen", "todo", ["nod"]),
                ] },
              ],
            },
          ],
        },
        {
          title: "Money", emoji: "💶", view: "list", views: ["list"], defaultKind: "amount", tone: "#5B8A6B",
          sections: [
            { title: "Invoices", emoji: "🧾", items: [
              { kind: "amount", title: "INV-041", source: "Acme Co", amount: 3200, paid: true, at: Date.now() - 6 * DAY, tags: ["acme"] },
              { kind: "amount", title: "INV-042", source: "Lumen", amount: 2400, paid: false, at: Date.now() + 3 * DAY, tags: ["lumen"] },
              { kind: "amount", title: "INV-043", source: "NOD", amount: 1800, paid: false, at: Date.now() - 2 * DAY, tags: ["nod", "urgent"] },
            ] },
            { title: "Admin", emoji: "📋", items: [
              task("File the quarterly VAT return", "todo", ["urgent"]),
              { kind: "note", title: "Rates 2026", body: "€95 an hour · €720 a day · 50% upfront on new clients." },
            ] },
          ],
        },
        {
          title: "Ideas", emoji: "💡", view: "grid", views: ["grid", "list"], defaultKind: "note", tone: "#C4573F",
          sections: [{ title: "", emoji: "", items: [
            { kind: "note", title: "Lead: Kaffeehaus Wien", body: "Wants a booking site before Christmas. Intro via Jamshad." },
            { kind: "quote", title: "Make it work, make it right, make it fast.", body: "Kent Beck" },
          ] }],
        },
      ],
    },
  ], "c-work");
}

function reemaMind(): Mind {
  const img = (id: string, title: string): Item => ({ kind: "image", title, image: photo(id), source: "pinterest.com" });
  return build([
    {
      id: "c-home", name: "Home", emoji: "🏡", tone: "#5B8A6B", tagline: "Ideas for the flat",
      activity: [], chatIds: ["reema"],
      widgets: ["covers", "recent"],
      vault: [img("photo-1586023492125-27b2c045efd7", "Green velvet chair")],
      pages: [
        { title: "Living room", emoji: "🛋️", view: "grid", views: ["grid", "list"], defaultKind: "image", sections: [{ title: "", emoji: "", items: [
          img("photo-1616046229478-9901c5536a45", "Sage walls and a round mirror"),
          { kind: "palette", title: "Sage & oak", colors: ["#8A9A7B", "#C9B79C", "#EDE6DA", "#5B4636", "#2F3A2F"] },
          img("photo-1493663284031-b7e3aefcae8e", "Teal cushions"),
          { kind: "link", title: "Oak side table", source: "hay.com", url: "https://hay.com" },
          img("photo-1484101403633-562f891dc89a", "A soft grey sofa"),
          img("photo-1616137466211-f939a420be84", "All white, lots of light"),
        ] }] },
        { title: "Bedroom", emoji: "🛏️", view: "grid", views: ["grid", "list"], defaultKind: "image", tone: "#C99432", sections: [{ title: "", emoji: "", items: [
          img("photo-1615874959474-d609969a20ed", "Rattan lamp and linen"),
          { kind: "quote", title: "Have nothing in your house that you do not know to be useful, or believe to be beautiful.", body: "William Morris" },
          img("photo-1505693416388-ac5ce068fe85", "Tufted headboard"),
          img("photo-1512918728675-ed5a9ecdebfd", "Low bed, warm wood"),
        ] }] },
        { title: "Plants", emoji: "🌿", view: "grid", views: ["grid", "list"], defaultKind: "image", sections: [{ title: "", emoji: "", items: [
          img("photo-1519710164239-da123dc03ef4", "One plant, one chair"),
          { kind: "note", title: "Monstera", body: "Water every 7 to 10 days. Bright, indirect light." },
          img("photo-1598928506311-c55ded91a20c", "A little jungle"),
        ] }] },
        { title: "Dream house", emoji: "🏠", view: "grid", views: ["grid", "list"], defaultKind: "image", tone: "#3E67A6", sections: [{ title: "", emoji: "", items: [
          img("photo-1600585154340-be6161a56a0c", "Big windows, big tree"),
          img("photo-1502005229762-cf1b2da7c5d6", "Floating stairs"),
          img("photo-1585412727339-54e4bae3bbf9", "Coffered ceiling"),
        ] }] },
      ],
    },
  ], "c-home");
}

export function seedMind(userId: string): Mind {
  if (userId === "me") return alaeMind();
  if (userId === "charles") return charlesMind();
  if (userId === "reema") return reemaMind();
  return { version: 2, collections: [], current: null, blocks: {}, guide: userId === "jamshad" ? "pitch" : undefined };
}

/* ---------------------------------------------------------------------------
   Store — one Mind per person, persisted, shared by every component
--------------------------------------------------------------------------- */

const KEY = "nod.mind.v2";
let cache: Record<string, Mind> | null = null;
const listeners = new Set<() => void>();

function load(): Record<string, Mind> {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { cache = {}; }
  return cache!;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function mindOf(userId: string): Mind {
  const all = load();
  if (!all[userId] || all[userId].version !== 2) {
    all[userId] = seedMind(userId);
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
  }
  return all[userId];
}
export function updateMind(userId: string, fn: (m: Mind) => Mind) {
  const all = load();
  all[userId] = fn(mindOf(userId));
  cache = { ...all };
  persist();
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

/** Practice today counts towards the collection's streak. */
export function logPractice(mind: Mind, collectionId: string): Mind {
  const today = todayKey();
  return patchCollection(mind, collectionId, (c) => (c.activity.includes(today) ? c : { ...c, activity: [...c.activity, today] }));
}

/* ---------------------------------------------------------------------------
   Save to Mind — work out where a message belongs
--------------------------------------------------------------------------- */

const MARKERS: Record<string, RegExp> = {
  de: /\b(der|die|das|und|ich|nicht|ist|ein|eine|mit|auf|für|wie|zu|sie|wir)\b|[äöüß]/i,
  fr: /\b(le|la|les|et|je|est|pas|un|une|avec|pour|c'est|nous|vous|très|oui)\b|[éèêàçù]/i,
  es: /\b(el|los|las|y|yo|es|no|una|con|para|muy|gracias|hola)\b|[ñ¿¡]/i,
  it: /\b(il|lo|gli|e|io|è|non|una|con|per|molto|grazie|ciao)\b/i,
};
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
    if (c.lang && MARKERS[c.lang]?.test(input.text)) bump(5, `it's in ${LANGUAGES.find((l) => l.code === c.lang)?.name ?? "that language"}`);
    const items = collectionItems(mind, c);
    const vocab = new Set([c.name, ...c.pages.map((p) => p.title), ...tagsOf(items), ...items.slice(0, 80).map((b) => b.title)].flatMap(words));
    const hits = [...tokens].filter((w) => vocab.has(w));
    if (hits.length) bump(Math.min(4, hits.length * 1.5), `it mentions “${hits[0]}”`);
    if (input.kind === "photos" && items.filter((b) => b.kind === "image").length > 2) bump(2, "it's a photo, like the rest");
    if ((input.cardType === "payment") && items.some((b) => b.kind === "amount")) bump(3, "it's about money");
    if ((input.cardType === "checklist" || input.cardType === "poll") && items.some((b) => b.kind === "todo")) bump(1.5, "it's a task");
    if (c.id === mind.current) bump(0.5, "it's the collection you had open");
    if (!best || score > best.score) best = { c, score, reason };
  }
  return best ? { collectionId: best.c.id, reason: best.reason || "it's your main collection" } : null;
}

/** Chat → Mind: a live reference lands in a collection's Vault. */
export function saveToMind(userId: string, save: { chatId: string; messageId: string; title: string; text: string; chatName: string; kind: "text" | "card" | "photos" | "file"; cardType?: string }) {
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

/* ---------------------------------------------------------------------------
   Jamshad's guided setup: preparing the investor pitch
--------------------------------------------------------------------------- */

export interface GuideStep { id: string; title: string; how: string; done: boolean }

export function pitchGuide(mind: Mind): GuideStep[] {
  const c = mind.collections[0];
  const items = c ? collectionItems(mind, c) : [];
  const inPages = c ? c.pages.flatMap((p) => pageItems(mind, p)) : [];
  return [
    { id: "collection", title: "Create a “Pitch” collection", how: "Tap + and choose New collection, then the Client work template.", done: !!c },
    { id: "subpage", title: "Add a “Slides” sub-page under Tasks", how: "Open Tasks, tap + and choose Sub-page.", done: !!c?.pages.some((p) => p.parentId) },
    { id: "capture", title: "Keep a reference link and a quote", how: "In References, use the field at the bottom, or + → Link and + → Quote.", done: items.some((b) => b.kind === "link") && items.some((b) => b.kind === "quote") },
    { id: "date", title: "Add the date of the pitch", how: "Anywhere: + → Date, name it “Pitch day”.", done: items.some((b) => b.kind === "date") },
    { id: "widget", title: "Put a countdown on your home", how: "On the Pitch home, tap + and pick Countdown from the widgets.", done: !!c?.widgets.some((w) => w.kind === "countdown") },
    { id: "save", title: "Save feedback from a chat", how: "Open your chat with Alae, hold “Slide 9. Clients loved it.” and choose Save to Mind.", done: items.some((b) => b.kind === "chat") },
    { id: "sort", title: "Sort it out of the Vault", how: "Open Vault, tap Sort and pick the Slides page.", done: inPages.some((b) => b.kind === "chat") },
  ];
}
