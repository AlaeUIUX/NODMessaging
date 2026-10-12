/**
 * Links, videos and books, from whatever gets pasted: the first web address in
 * a piece of text, what a video link points at (and how to embed it), and an
 * ISBN anywhere in a string, checked. Shared by the app and its API routes.
 */

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"']+|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s<>"']*)?/i;

/** A full http(s) address for something typed or pasted, or null if it isn't one. */
export function normalizeUrl(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** The first web address in a piece of text, without the punctuation that ends a sentence. */
export function findUrl(text: string): string | null {
  const m = text.match(URL_IN_TEXT)?.[0];
  return m ? normalizeUrl(m.replace(/[),.;:!?'"]+$/, "")) : null;
}

/** The link in a piece of text, and whatever else was written around it. */
export function splitUrl(text: string): { url: string | null; rest: string } {
  const raw = text.match(URL_IN_TEXT)?.[0]?.replace(/[),.;:!?'"]+$/, "");
  const url = raw ? normalizeUrl(raw) : null;
  return url && raw ? { url, rest: text.replace(raw, "").replace(/\s+/g, " ").trim() } : { url: null, rest: text.trim() };
}

/** "dw.com" for https://www.dw.com/de/… */
export function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/* ---------------------------------------------------------------------------
   Videos
--------------------------------------------------------------------------- */

export type VideoRef = { provider: "youtube" | "vimeo"; id: string; start?: number };

const YT_ID = /^[\w-]{11}$/;

/** "1m30s", "90" or "1h2m3s" as seconds. */
function seconds(t: string | null) {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t) || undefined;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || undefined;
}

/** A YouTube or Vimeo video, from any of the shapes their links come in. */
export function parseVideo(url: string): VideoRef | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return YT_ID.test(id) ? { provider: "youtube", id, start } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return { provider: "youtube", id: v, start };
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})(?:[/?]|$)/);
    return m ? { provider: "youtube", id: m[1], start } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/^\/(?:video\/)?(\d{5,})(?:\/|$)/);
    return m ? { provider: "vimeo", id: m[1] } : null;
  }
  return null;
}

export const videoProvider = (v: VideoRef) => (v.provider === "youtube" ? "YouTube" : "Vimeo");

/** The page to watch it on, in a browser or the provider's app. */
export function watchUrl(v: VideoRef) {
  if (v.provider === "vimeo") return `https://vimeo.com/${v.id}`;
  return `https://www.youtube.com/watch?v=${v.id}${v.start ? `&t=${v.start}s` : ""}`;
}

/** The player to embed. YouTube's privacy-enhanced domain sets no cookies until it plays. */
export function embedUrl(v: VideoRef, autoplay: boolean) {
  if (v.provider === "vimeo") return `https://player.vimeo.com/video/${v.id}?playsinline=1${autoplay ? "&autoplay=1" : ""}`;
  const p = new URLSearchParams({ playsinline: "1", rel: "0" });
  if (autoplay) p.set("autoplay", "1");
  if (v.start) p.set("start", String(v.start));
  return `https://www.youtube-nocookie.com/embed/${v.id}?${p}`;
}

/** A still for YouTube, known from the id alone; Vimeo's comes from its oEmbed. */
export const videoThumb = (v: VideoRef) => (v.provider === "youtube" ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null);

/** 754 → "12:34", 3723 → "1:02:03". */
export function clock(total: number) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/* ---------------------------------------------------------------------------
   Books
--------------------------------------------------------------------------- */

function validIsbn(d: string) {
  if (/^\d{9}[\dX]$/.test(d)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (d[i] === "X" ? 10 : Number(d[i])) * (10 - i);
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(d)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
    return sum % 10 === 0;
  }
  return false;
}

/** The first valid ISBN-10 or ISBN-13 in a string ("978-0-7352-1129-2", a shop link…), digits only. */
export function isbnOf(text: string): string | null {
  const found = text.toUpperCase().match(/(?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dX]/g) ?? [];
  for (const c of found) {
    const d = c.replace(/[-\s]/g, "");
    if (validIsbn(d)) return d;
  }
  return null;
}

/** Text that is an ISBN and nothing else (an optional "ISBN" in front is fine). */
export const isIsbnQuery = (q: string) => /^(?:isbn[:\s-]*)?[\dXx][\dXx\s-]{8,16}$/i.test(q.trim()) && !!isbnOf(q);
