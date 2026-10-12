import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { clock, hostOf, parseVideo, videoProvider, videoThumb, watchUrl, type VideoRef } from "@/lib/chat/links";
import type { LinkMeta } from "@/lib/chat/lookup";
import { crossSite, fail, limited } from "../guard";

/**
 * What a link is, for Mind's Link and Video items: its title, who made it, a
 * picture. YouTube, Vimeo and TikTok answer through oEmbed; any other page is
 * read for its <title> and Open Graph tags. Only public web addresses are
 * fetched (no private networks, at most a few redirects, the first 600 KB),
 * and nothing is stored.
 */

const UA = "Mozilla/5.0 (compatible; NODLinkPreview/1.0; +https://nod-messaging.vercel.app)";
const TIMEOUT_MS = 6000;
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
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateAddress(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^(fc|fd|fe[89ab])/.test(v6);
}

/** Refuses anything that isn't a public web server on the usual ports. */
async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
  if (url.username || url.password) throw new Error("credentials");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("port");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|home|lan)$/.test(host)) throw new Error("host");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(privateAddress)) throw new Error("private");
}

/** Fetches a page, checking every redirect hop the same way as the first. */
async function fetchPublic(start: URL) {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en;q=0.9, *;q=0.5" },
    });
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
    const name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
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
