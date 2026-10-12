/**
 * What every lookup route checks before it fetches anything for someone: that
 * the request comes from a page of this app, and that one address isn't
 * asking too often. Limits are per server instance, which is enough to stop a
 * stuck retry loop; they are not a security boundary.
 */

export const fail = (status: number, error: string, message: string) => Response.json({ error, message }, { status });

/** Browsers mark cross-site requests; anything else (the app itself, curl) passes. */
export function crossSite(request: Request) {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

const WINDOW_MS = 60_000;
const buckets = new Map<string, Map<string, number[]>>();

/** True once an address has made more than `perMinute` requests to `route` in the last minute. */
export function limited(route: string, request: Request, perMinute: number) {
  // Vercel sets these from the connection itself, so they can't be spoofed by the client.
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const recent = buckets.get(route) ?? new Map<string, number[]>();
  buckets.set(route, recent);
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  // Forget quiet addresses instead of wiping everyone's count when the map grows.
  if (recent.size > 1000) for (const [key, times] of recent) if (times.every((t) => now - t >= WINDOW_MS)) recent.delete(key);
  return hits.length > perMinute;
}
