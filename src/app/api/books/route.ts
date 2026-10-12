import { isbnOf, isIsbnQuery } from "@/lib/chat/links";
import type { BookHit, BookSource } from "@/lib/chat/lookup";
import { crossSite, fail, limited } from "../guard";

/**
 * Finds books for Mind: by title or author, by ISBN, or from a link to the
 * book (Apple Books, Open Library, Goodreads, Amazon and most shops). Two
 * catalogues answer together and are merged where they agree:
 *
 *   - Apple Books, the catalogue behind the iPhone's Books app (the public
 *     iTunes Search API, no key needed). Best covers and descriptions.
 *   - Open Library, the free and open catalogue run by the Internet Archive.
 *     Knows print ISBNs, page counts and first publication years.
 *
 * Google Books joins in when GOOGLE_BOOKS_API_KEY is set (without a key its
 * shared quota is usually spent).
 */

const TIMEOUT_MS = 7000;
const LIMIT = 12;
const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=86400" };

type Query = { isbn?: string; appleId?: string; appleCountry?: string; olWork?: string; olEdition?: string; text?: string };
type Hit = Omit<BookHit, "key" | "sources"> & { source: BookSource };

export async function GET(request: Request) {
  if (crossSite(request)) return fail(403, "forbidden", "Books can only be looked up from the NOD app.");
  if (limited("books", request, 60)) return fail(429, "rate-limited", "Too many searches at once. Try again in a minute.");

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 300);
  const query = parse(q);
  if (!query) return Response.json({ results: [] }, { headers: CACHE });

  const settled = await Promise.all([apple(query), openLibrary(query), google(query)].map((p) => p.catch(() => null)));
  if (settled.every((r) => r === null)) return fail(502, "unreachable", "The book catalogues couldn't be reached.");
  const lists = settled.map((r) => r ?? []);
  // Open Library knows print ISBNs best, Apple ranks titles by what people read.
  const ordered = query.isbn || query.olWork || query.olEdition ? [lists[1], lists[0], lists[2]] : lists;
  const merged = merge(ordered, query.isbn);
  return Response.json({ results: query.text ? byRelevance(merged, query.text) : merged }, { headers: CACHE });
}

/* ---------------------------------------------------------------------------
   What was asked: a title, an ISBN, or a link to a book somewhere
--------------------------------------------------------------------------- */

function parse(q: string): Query | null {
  if (q.length < 2) return null;
  const looksLikeLink = /^https?:\/\//i.test(q) || /^(www\.)?[\w-]+(\.[\w-]+)+\/\S/i.test(q);
  if (looksLikeLink) {
    let url: URL;
    try { url = new URL(/^https?:\/\//i.test(q) ? q : `https://${q}`); } catch { return null; }
    const host = url.hostname.replace(/^www\./, "");
    const path = decodeURIComponent(url.pathname);
    if (/(^|\.)apple\.com$/.test(host)) {
      const id = path.match(/\/id(\d+)/)?.[1];
      if (id) return { appleId: id, appleCountry: path.match(/^\/([a-z]{2})\//)?.[1] };
    }
    if (host === "openlibrary.org") {
      const work = path.match(/\/works\/(OL\d+W)/)?.[1];
      if (work) return { olWork: work };
      const edition = path.match(/\/books\/(OL\d+M)/)?.[1];
      if (edition) return { olEdition: edition };
    }
    if (/goodreads\./.test(host)) {
      const slug = path.match(/\/book\/show\/\d+[.-]([^/]+)/)?.[1];
      if (slug) return { text: slug.replace(/[-_.]+/g, " ") };
    }
    // Shops put the ISBN in the address (Amazon's /dp/ code is the ISBN-10 for print books).
    const isbn = isbnOf(path) ?? isbnOf(url.search);
    if (isbn) return { isbn };
    const slug = path.match(/^\/([^/]{6,})\/(?:dp|gp\/product)\//)?.[1];
    if (slug) return { text: slug.replace(/-/g, " ") };
    return null;
  }
  if (isIsbnQuery(q)) return { isbn: isbnOf(q)! };
  return { text: q };
}

/* ---------------------------------------------------------------------------
   The catalogues
--------------------------------------------------------------------------- */

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "NOD/1.0 (+https://nod-messaging.vercel.app)" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

const yearOf = (s?: string | number) => {
  const y = typeof s === "number" ? s : Number(String(s ?? "").match(/\d{4}/)?.[0]);
  return y > 0 ? y : undefined;
};
const text = (html?: string) => (html ?? "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/\n{3,}/g, "\n\n").trim().slice(0, 1200) || undefined;
/** "Atomic Habits: An Easy & Proven Way…" → the title and its subtitle. */
function split(title: string) {
  const at = title.indexOf(": ");
  return at > 2 ? { title: title.slice(0, at).trim(), subtitle: title.slice(at + 2).trim() } : { title: title.trim() };
}

type AppleBook = { trackId: number; trackName: string; artistName: string; releaseDate?: string; artworkUrl100?: string; trackViewUrl?: string; description?: string; kind?: string };

async function apple(q: Query): Promise<Hit[]> {
  const country = q.appleCountry ?? "us";
  const url = q.appleId ? `https://itunes.apple.com/lookup?id=${q.appleId}&country=${country}`
    : q.isbn ? `https://itunes.apple.com/lookup?isbn=${q.isbn}&country=${country}`
    : q.text ? `https://itunes.apple.com/search?term=${encodeURIComponent(q.text)}&media=ebook&entity=ebook&limit=10&country=${country}`
    : null;
  if (!url) return [];
  const data = await getJson<{ results: AppleBook[] }>(url);
  return data.results.filter((b) => b.trackName && (!b.kind || b.kind === "ebook")).map((b) => ({
    source: "apple" as const,
    ...split(b.trackName),
    author: b.artistName ?? "",
    year: yearOf(b.releaseDate),
    // The artwork URL takes any size: ask for one sharp enough for a full-width cover.
    cover: b.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/600x600bb.$1"),
    url: b.trackViewUrl?.replace(/\?.*$/, ""),
    description: text(b.description),
    isbn: q.isbn,
  }));
}

type OpenLibraryDoc = { key: string; title: string; subtitle?: string; author_name?: string[]; first_publish_year?: number; number_of_pages_median?: number; cover_i?: number };
const OL_FIELDS = "key,title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i";

async function openLibrary(q: Query): Promise<Hit[]> {
  const search = q.olWork ? `key:/works/${q.olWork}` : q.olEdition ? `edition_key:${q.olEdition}` : q.isbn ? `isbn:${q.isbn}` : q.text;
  if (!search) return [];
  const data = await getJson<{ docs: OpenLibraryDoc[] }>(`https://openlibrary.org/search.json?q=${encodeURIComponent(search)}&fields=${OL_FIELDS}&limit=10`);
  // A work lists every edition's ISBN, in no useful order: only the one asked for means anything.
  return data.docs.filter((d) => d.title).map((d) => ({
    source: "openlibrary" as const,
    title: d.title,
    subtitle: d.subtitle,
    author: d.author_name?.[0] ?? "",
    year: d.first_publish_year,
    pages: d.number_of_pages_median,
    isbn: q.isbn,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
    url: `https://openlibrary.org${d.key}`,
  }));
}

type GoogleVolume = { volumeInfo: { title?: string; subtitle?: string; authors?: string[]; publishedDate?: string; pageCount?: number; description?: string; infoLink?: string; imageLinks?: { thumbnail?: string }; industryIdentifiers?: { type: string; identifier: string }[] } };

async function google(q: Query): Promise<Hit[]> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const search = q.isbn ? `isbn:${q.isbn}` : q.text;
  if (!key || !search) return [];
  const data = await getJson<{ items?: GoogleVolume[] }>(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(search)}&maxResults=10&printType=books&key=${key}`);
  return (data.items ?? []).filter((v) => v.volumeInfo.title).map(({ volumeInfo: v }) => ({
    source: "google" as const,
    title: v.title!,
    subtitle: v.subtitle,
    author: v.authors?.[0] ?? "",
    year: yearOf(v.publishedDate),
    pages: v.pageCount || undefined,
    isbn: q.isbn ?? v.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier,
    cover: v.imageLinks?.thumbnail?.replace(/^http:/, "https:").replace("&edge=curl", ""),
    url: v.infoLink,
    description: text(v.description),
  }));
}

/* ---------------------------------------------------------------------------
   One list: the catalogues take turns, and a book they both know is one result
--------------------------------------------------------------------------- */

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
/** The first author's last name: "Elke Gschossmann-Hendershot & Lois Feuerle" → "hendershot". */
const leadAuthor = (author: string) => plain(author.split(/\s*(?:&|,|;|\band\b)\s*/)[0] ?? "").split(" ").pop() ?? "";
const sameBook = (h: Hit) => `${plain(h.title).replace(/^(the|a|an|der|die|das|le|la|les) /, "")}|${leadAuthor(h.author)}`;

/**
 * Books whose title and author hold more of the words asked for come first;
 * otherwise the catalogues' own order stands. (Apple's search is fuzzy: it
 * can put a book that only shares a word ahead of the one meant.) The last
 * word may be half typed.
 */
function byRelevance(hits: BookHit[], q: string) {
  const asked = plain(q).split(" ").filter((w) => w.length > 1);
  if (!asked.length) return hits;
  const score = (h: BookHit) => {
    const words = plain(`${h.title} ${h.subtitle ?? ""} ${h.author}`).split(" ");
    return asked.filter((w, i) => words.some((x) => x === w || (i === asked.length - 1 && w.length > 2 && x.startsWith(w)))).length / asked.length;
  };
  return hits.map((h, i) => ({ h, i, s: score(h) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.h);
}

function merge(lists: Hit[][], isbn?: string): BookHit[] {
  const out: BookHit[] = [];
  const byKey = new Map<string, BookHit>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const h = list[i];
      if (!h) continue;
      const key = sameBook(h);
      // A record without an author is the same book as one with that title and an author.
      const known = byKey.get(key) ?? (key.endsWith("|") ? out.find((x) => x.key.startsWith(key)) : undefined);
      if (!known) {
        const { source, ...rest } = h;
        const hit: BookHit = { ...rest, key, sources: [source] };
        byKey.set(key, hit);
        out.push(hit);
        continue;
      }
      if (known.sources.includes(h.source)) continue;
      known.sources.push(h.source);
      // Apple's covers and pages win; the oldest year is when it first came out; Open Library has the print details.
      if (h.source === "apple") {
        known.cover = h.cover ?? known.cover;
        known.url = h.url ?? known.url;
      } else {
        known.cover ??= h.cover;
        known.url ??= h.url;
      }
      known.subtitle ??= h.subtitle;
      known.pages ??= h.pages;
      known.isbn = isbn ?? known.isbn ?? h.isbn;
      known.description ??= h.description;
      known.year = known.year && h.year ? Math.min(known.year, h.year) : known.year ?? h.year;
    }
  }
  return out.slice(0, LIMIT);
}
