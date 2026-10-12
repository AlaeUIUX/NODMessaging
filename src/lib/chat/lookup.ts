/**
 * Looking things up for Mind: what a link is (/api/unfurl) and which book a
 * title, ISBN or shop link means (/api/books). Answers are kept for the tab,
 * so editing a field or reopening a sheet doesn't ask twice. A failed lookup
 * is null: the item is still made, just with less filled in.
 */

/** A web page or a video, as its site describes it. */
export interface LinkMeta {
  kind: "video" | "page";
  /** Where the link ends up, after redirects. */
  url: string;
  title: string;
  /** The channel or author, when the site names one. */
  author?: string;
  /** "YouTube", "Deutsche Welle", or the host name. */
  site: string;
  image?: string;
  /** "12:04", when the site says. */
  duration?: string;
}

export type BookSource = "apple" | "openlibrary" | "google";

/** One book, merged from every catalogue that knows it. */
export interface BookHit {
  key: string;
  title: string;
  subtitle?: string;
  author: string;
  year?: number;
  pages?: number;
  isbn?: string;
  cover?: string;
  /** Its page on Apple Books, else Open Library or Google Books. */
  url?: string;
  description?: string;
  sources: BookSource[];
}

export const SOURCE_LABEL: Record<BookSource, string> = { apple: "Apple Books", openlibrary: "Open Library", google: "Google Books" };

const links = new Map<string, Promise<LinkMeta | null>>();
const books = new Map<string, Promise<BookHit[] | null>>();

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(path, { signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Remembers answers, not failures: a link that didn't answer can be tried again. */
function remember<T>(cache: Map<string, Promise<T | null>>, key: string, load: () => Promise<T | null>) {
  const hit = cache.get(key);
  if (hit) return hit;
  const p = load().then((v) => {
    if (v === null) cache.delete(key);
    return v;
  });
  cache.set(key, p);
  return p;
}

/** The title, author and picture behind a link. */
export function unfurl(url: string): Promise<LinkMeta | null> {
  return remember(links, url, () => getJson<LinkMeta>(`/api/unfurl?url=${encodeURIComponent(url)}`));
}

/** Books for a title, author, ISBN or a link to the book. */
export function findBooks(q: string): Promise<BookHit[] | null> {
  const key = q.trim().toLowerCase();
  return remember(books, key, () => getJson<{ results: BookHit[] }>(`/api/books?q=${encodeURIComponent(q.trim())}`).then((r) => r?.results ?? null));
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Whether a found book is the one a typed title means, closely enough to fill it in without asking. */
export function sameTitle(typed: string, hit: BookHit) {
  const a = plain(typed);
  const b = plain(hit.title);
  return !!a && (a === b || a === plain(`${hit.title} ${hit.subtitle ?? ""}`) || (a.length >= 8 && b.startsWith(a)));
}
