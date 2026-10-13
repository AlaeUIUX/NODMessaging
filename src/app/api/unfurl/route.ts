import { lookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { clock, hostOf, parseVideo, videoProvider, videoThumb, watchUrl, type VideoRef } from "@/lib/chat/links";
import type { LinkMeta } from "@/lib/chat/lookup";
import { crossSite, fail, limited } from "../guard";

/**
 * What a link is, for Mind's Link and Video items: its title, who made it, a
 * picture. YouTube, Vimeo and TikTok answer through oEmbed; any other page is
 * read for its <title> and Open Graph tags. Only public web addresses are
 * fetched (no private networks, at most a few redirects, the first 600 KB,
 * ten seconds in all), and nothing is stored.
 */

const UA = "Mozilla/5.0 (compatible; NODLinkPreview/1.0; +https://nod-messaging.vercel.app)";
const TIMEOUT_MS = 6000;
/** For a page and all its redirects together. */
const PAGE_DEADLINE_MS = 10_000;
const MAX_HTML = 600_000;
const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=86400" };

export async function GET(request: Request) {
  if (crossSite(request)) return fail(403, "forbidden", "Links can only be read from the NOD app.");
  if (limited("unfurl", request, 40)) return fail(429, "rate-limited", "Too many links at once. Try again in a minute.");

  const raw = new URL(request.url).searchParams.get("url") ?? "";
  let target: URL;
  try { target = new URL(raw); } catch { return fail(400, "bad-url", "That isn't a web address."); }
  if (target.protocol !== "http:" && target.protocol !== "https:") return fail(400, "bad-url", "Only web addresses can be read.");

  try {
    const video = parseVideo(target.href);
    const host = target.hostname.replace(/^(www\.|m\.|vm\.)/, "");
    const meta = video ? await videoMeta(video)
      : host === "tiktok.com" ? await tiktokMeta(target)
      : await pageMeta(target);
    return Response.json(meta, { headers: CACHE });
  } catch {
    return fail(502, "unreachable", "That page couldn't be read.");
  }
}

/* ---------------------------------------------------------------------------
   Video sites: oEmbed gives the title and the channel
--------------------------------------------------------------------------- */

type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string; duration?: number; provider_name?: string };

async function oembed(endpoint: string): Promise<OEmbed | null> {
  try {
    const res = await fetch(endpoint, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as OEmbed) : null;
  } catch {
    return null;
  }
}

async function videoMeta(v: VideoRef): Promise<LinkMeta> {
  const url = watchUrl(v);
  const o = await oembed(v.provider === "youtube"
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
    : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
  // A private or removed video still plays from its link if it comes back; keep what's known.
  return {
    kind: "video",
    url,
    title: clean(o?.title ?? ""),
    author: o?.author_name ? clean(o.author_name) : undefined,
    site: videoProvider(v),
    image: videoThumb(v) ?? o?.thumbnail_url ?? undefined,
    duration: o?.duration ? clock(o.duration) : undefined,
  };
}

async function tiktokMeta(target: URL): Promise<LinkMeta> {
  const o = await oembed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(target.href)}`);
  return {
    kind: "video",
    url: target.href,
    title: clean(o?.title ?? ""),
    author: o?.author_name ? clean(o.author_name) : undefined,
    site: "TikTok",
    image: o?.thumbnail_url,
  };
}

/* ---------------------------------------------------------------------------
   Any other page: fetched carefully, read for its title and Open Graph tags
--------------------------------------------------------------------------- */

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0))
      || (a === 198 && (b === 18 || b === 19));
  }
  const w = v6Words(ip);
  // Anything that doesn't read as an address is refused, not guessed at.
  if (!w) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // ::, ::1 and the IPv4-compatible / IPv4-mapped forms (::a.b.c.d, ::ffff:a.b.c.d, also written in hex).
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0 || w[5] === 0xffff)) return (w[5] === 0 && w[6] === 0) || privateAddress(v4(w[6], w[7]));
  if (w[0] === 0x64 && w[1] === 0xff9b) return privateAddress(v4(w[6], w[7])); // NAT64
  if (w[0] === 0x2002) return privateAddress(v4(w[1], w[2])); // 6to4
  if (w[0] === 0x2001 && w[1] === 0) return true; // Teredo hides its IPv4 address
  return (w[0] & 0xfe00) === 0xfc00 || (w[0] & 0xffc0) === 0xfe80 || (w[0] & 0xffc0) === 0xfec0 || (w[0] & 0xff00) === 0xff00;
}

/** An IPv6 address as its eight 16-bit words, however it's written ("::", a trailing a.b.c.d, a %zone); null if it isn't one. */
function v6Words(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const dotted = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return null;
    s = `${s.slice(0, -dotted[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;
  const words = tail === null ? head : [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];
  if (words.length !== 8 || words.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return words.map((x) => parseInt(x, 16));
}

/** Refuses anything that isn't a web server on the usual ports, by name; the address is checked as it's connected to (publicLookup). */
function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
  if (url.username || url.password) throw new Error("credentials");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("port");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  // A web page has a name. A bare IPv6 address is refused outright (the connection wouldn't go through
  // publicLookup for one), and an IPv4 address is checked here for the same reason.
  if (host.includes(":") || !host.includes(".")) throw new Error("host");
  if (/(^|\.)(localhost|local|internal|home|lan)$/.test(host)) throw new Error("host");
  if (isIP(host) && privateAddress(host)) throw new Error("private");
}

/**
 * The DNS lookup the connection itself uses, refusing private addresses. Checking
 * a name first and fetching it after would resolve it twice, and a name can
 * answer a public address to the check and a private one to the fetch.
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (err, found) => {
    const list = found as LookupAddress[] | undefined;
    if (err || !list?.length) { callback(err ?? new Error("not found"), "", 0); return; }
    if (list.some((a) => privateAddress(a.address))) { callback(new Error("private"), "", 0); return; }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
};

/** One GET over a connection made through publicLookup, as a web Response. No redirects are followed here. */
function getPinned(url: URL, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(url, {
      lookup: publicLookup,
      signal,
      // No accept-encoding: the page comes back as plain text, ready to read.
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en;q=0.9, *;q=0.5" },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status > 599) { res.destroy(); reject(new Error(`status ${status}`)); return; }
      const headers = new Headers();
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const bodiless = status === 204 || status === 205 || status === 304;
      if (bodiless) res.resume();
      resolve(new Response(bodiless ? null : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>), { status, headers }));
    });
    req.on("error", reject);
  });
}

/** Fetches a page, checking every redirect hop the same way as the first, all within one deadline. */
async function fetchPublic(start: URL) {
  let url = start;
  const signal = AbortSignal.timeout(PAGE_DEADLINE_MS);
  for (let hop = 0; hop < 5; hop++) {
    assertPublic(url);
    const res = await getPinned(url, signal);
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      await res.body?.cancel();
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`status ${res.status}`);
    }
    return { res, url };
  }
  throw new Error("redirects");
}

/** The start of the body, as text: enough for the <head> of any page. */
async function readStart(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_HTML) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  const charset = res.headers.get("content-type")?.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(charset); } catch { decoder = new TextDecoder("utf-8"); }
  return decoder.decode(all.subarray(0, MAX_HTML));
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", middot: "·", bull: "•", laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™",
};
function decode(s: string) {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const clean = (s: string) => decode(s).replace(/\s+/g, " ").trim().slice(0, 300);

/** Every <meta> on the page, by property or name (lower case). The first of each wins. */
function metaTags(html: string) {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const a of tag.matchAll(/([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content && !(key in out)) out[key] = attrs.content;
  }
  return out;
}

async function pageMeta(target: URL): Promise<LinkMeta> {
  const { res, url } = await fetchPublic(target);
  const site = hostOf(url.href);
  if (!(res.headers.get("content-type") ?? "").includes("html")) {
    await res.body?.cancel();
    // A PDF or an image: its file name is the best title there is.
    let name = url.pathname.split("/").filter(Boolean).pop() ?? "";
    try { name = decodeURIComponent(name); } catch { /* a stray % stays as it is */ }
    return { kind: "page", url: url.href, title: name || site, site };
  }
  const html = await readStart(res);
  const meta = metaTags(html);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const picture = meta["og:image"] || meta["og:image:url"] || meta["og:image:secure_url"] || meta["twitter:image"] || meta["twitter:image:src"];
  let image: string | undefined;
  try { image = picture ? new URL(decode(picture), url).href : undefined; } catch { image = undefined; }
  const author = meta.author || meta["article:author"] || "";
  const video = /video/.test(meta["og:type"] ?? "") || !!(meta["og:video"] || meta["og:video:url"] || meta["og:video:secure_url"]);
  const siteName = clean(meta["og:site_name"] || "") || site;
  return {
    kind: video ? "video" : "page",
    url: url.href,
    title: withoutSiteName(clean(meta["og:title"] || meta["twitter:title"] || titleTag), siteName, site) || site,
    author: author && !/^https?:/i.test(author) ? clean(author) : undefined,
    site: siteName,
    image: image?.startsWith("http") ? image : undefined,
  };
}

/** "Vienna - Wikipedia" → "Vienna": the site's own name doesn't belong in the title. */
function withoutSiteName(title: string, siteName: string, host: string) {
  const parts = title.split(/\s+[|·•–—-]\s+/);
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1].toLowerCase();
  const brand = host.split(".").slice(-2, -1)[0] ?? "";
  const isSite = last === siteName.toLowerCase() || (brand.length > 2 && last.replace(/[^a-z0-9]/g, "").includes(brand));
  return isSite ? title.slice(0, title.length - parts[parts.length - 1].length).replace(/\s+[|·•–—-]\s+$/, "").trim() : title;
}
