import { crossSite, fail, limited } from "../guard";

/**
 * Finds places for the Location sheet: by name or address (`q`), or the
 * address at a point (`lat` + `lon` + `reverse=1`, for "Send current location").
 *
 * Answers come from Photon, the free search over OpenStreetMap run by komoot
 * (no key needed). It's called from here rather than from the phone, so the
 * person's address never reaches komoot, only this server's. The real app
 * would use the platform's own search (MapKit on iPhone); the shape of a
 * result is what matters: a name, a line of address and a point.
 */

const TIMEOUT_MS = 6000;
const LIMIT = 8;
const PHOTON = "https://photon.komoot.io";
const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=86400" };

export type PlaceHit = { id: string; place: string; address: string; lat: number; lng: number };

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string; osm_id?: number; name?: string; street?: string; housenumber?: string;
    postcode?: string; city?: string; district?: string; locality?: string; state?: string; country?: string;
  };
};

export async function GET(request: Request) {
  if (crossSite(request)) return fail(403, "forbidden", "Places can only be looked up from the NOD app.");
  if (limited("places", request, 90)) return fail(429, "rate-limited", "Too many searches at once. Try again in a minute.");

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const near = Number.isFinite(lat) && Number.isFinite(lon) && params.has("lat") && params.has("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  const reverse = params.get("reverse") === "1";
  if (reverse && !near) return fail(400, "bad-request", "A point is needed to look up its address.");
  if (!reverse && q.length < 2) return Response.json({ results: [] }, { headers: CACHE });

  const url = new URL(reverse ? `${PHOTON}/reverse` : `${PHOTON}/api/`);
  url.searchParams.set("lang", "en");
  // A few more than shown, so the re-ranking below has the nearby ones to pick from.
  url.searchParams.set("limit", String(reverse ? 1 : LIMIT * 2));
  if (!reverse) url.searchParams.set("q", q);
  // A search only needs roughly where (about 100 m) to rank what's near; an address needs the point itself.
  if (near) {
    url.searchParams.set("lat", lat.toFixed(reverse ? 5 : 3));
    url.searchParams.set("lon", lon.toFixed(reverse ? 5 : 3));
  }

  let features: Feature[];
  try {
    const res = await fetch(url, { headers: { "User-Agent": "NOD-prototype/1.0" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(String(res.status));
    features = ((await res.json()) as { features?: Feature[] }).features ?? [];
  } catch {
    return fail(502, "unreachable", "Places couldn't be searched right now.");
  }

  let results = features.map((f) => (reverse ? hereOf(f) : hitOf(f))).filter((h): h is PlaceHit => !!h);
  // Photon ranks spelling first ("Cafe Central" in Baden over "Café Central" down the road). Nearer wins
  // here instead: every 5 km away costs one place in the list.
  if (near && !reverse) {
    const rank = new Map(results.map((h, i) => [h, i + km(lat, lon, h.lat, h.lng) / 5]));
    results = [...results].sort((a, b) => rank.get(a)! - rank.get(b)!);
  }
  // Two map entries for one place (a building and its shop) say the same thing: keep the first.
  const seen = new Set<string>();
  const unique = results.filter((h) => { const k = `${h.place}|${h.address}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return Response.json({ results: unique.slice(0, LIMIT) }, { headers: reverse ? { "Cache-Control": "no-store" } : CACHE });
}

/** Straight-line distance, near enough for ranking. */
function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

const streetOf = (p: Feature["properties"]) => [p.street, p.housenumber].filter(Boolean).join(" ");
const townOf = (p: Feature["properties"]) => [p.postcode, p.city ?? p.locality ?? p.district ?? p.state].filter(Boolean).join(" ");

/** "Konjō Ramen" · "Kettenbrückengasse 7, 1050 Vienna". The country only when there's no town to name. */
function hitOf(f: Feature): PlaceHit | null {
  const p = f.properties;
  const street = streetOf(p);
  const place = p.name ?? street;
  if (!place) return null;
  const town = townOf(p);
  const address = [p.name ? street : "", town || p.country].filter(Boolean).join(", ");
  const [lng, lat] = f.geometry.coordinates;
  return { id: `${p.osm_type ?? "x"}${p.osm_id ?? `${lat},${lng}`}`, place, address, lat, lng };
}

/** Where you are is an address, not the nearest shop's name: "Mariahilfer Straße 88" · "1060 Vienna". */
function hereOf(f: Feature): PlaceHit | null {
  const p = f.properties;
  const street = streetOf(p);
  const place = street || p.name;
  if (!place) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { id: "here", place, address: townOf(p) || p.country || "", lat, lng };
}
