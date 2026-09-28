import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MAX_RECEIPT_BYTES, RECEIPT_TYPES, type ReceiptResult } from "@/lib/chat/receipt";

/**
 * Reads a receipt photo with Claude and returns its lines in cents. The image
 * is only held in memory for the length of the request; nothing is stored.
 * Without ANTHROPIC_API_KEY it answers 501, and the app falls back to typing.
 */

const Receipt = z.object({
  merchant: z.string().describe("The business name as printed at the top of the receipt."),
  currency: z.string().describe("ISO 4217 code of the receipt's currency, e.g. EUR."),
  date: z.string().nullable().describe("The receipt date as YYYY-MM-DD, or null if not legible."),
  items: z.array(z.object({
    name: z.string().describe("The line as printed, without the price."),
    quantity: z.number().describe("How many were ordered; 1 when not shown."),
    total: z.number().describe("The line total (quantity × unit price) in the receipt currency."),
  })),
  tax: z.number().describe("Tax added on top of the item prices. 0 when prices already include tax (e.g. 'incl. VAT', 'inkl. MwSt')."),
  tip: z.number().describe("Tip or service charge, 0 if none."),
  total: z.number().nullable().describe("The final total as printed, or null if not legible."),
  unreadable: z.array(z.string()).describe("Lines you could see but not read reliably, described briefly."),
});

const SYSTEM = [
  "You read restaurant and shop receipts for a bill-splitting app.",
  "Transcribe exactly what is printed: never guess prices, never invent lines, never correct the receipt's arithmetic.",
  "Amounts are plain numbers in the receipt's currency (12.50, not 1250). Leave out subtotals, payments, change and card slips.",
  "Discounts belong to the line they reduce. If a line can't be read with confidence, list it under unreadable instead of items.",
].join(" ");

// A trivial per-address limit: this route spends money, so a stuck retry loop shouldn't.
const WINDOW_MS = 60_000;
const PER_WINDOW = 10;
const recent = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  // Forget quiet addresses instead of wiping everyone's count when the map grows.
  if (recent.size > 1000) for (const [key, times] of recent) if (times.every((t) => now - t >= WINDOW_MS)) recent.delete(key);
  return hits.length > PER_WINDOW;
}

const fail = (status: number, error: string, message: string) => Response.json({ error, message }, { status });
const cents = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : 0);

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(501, "not-configured", "Receipt reading isn’t set up on this server yet.");

  // Only the app itself may spend reads: browsers always send Origin on a cross-site POST.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const originHost = (() => { try { return origin ? new URL(origin).host : null; } catch { return null; } })();
  if (!originHost || !host || originHost !== host) return fail(403, "forbidden", "Receipts can only be read from the NOD app.");

  // Vercel sets these from the connection itself, so they can't be spoofed by the client.
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (limited(ip)) return fail(429, "rate-limited", "Too many receipts at once. Try again in a minute.");

  // Refuse oversized (or unsized, chunked) uploads before buffering anything.
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "length-required", "The upload needs a size.");
  if (declared > MAX_RECEIPT_BYTES + 64 * 1024) return fail(413, "too-large", "That photo is too large.");

  let image: FormDataEntryValue | null;
  try {
    image = (await request.formData()).get("image");
  } catch {
    return fail(400, "bad-request", "Send the photo as multipart form data, in a field named “image”.");
  }
  if (!(image instanceof File)) return fail(400, "bad-request", "No photo was attached.");
  if (image.size > MAX_RECEIPT_BYTES) return fail(413, "too-large", "That photo is too large.");
  if (!RECEIPT_TYPES.includes(image.type)) return fail(415, "unsupported", "Use a JPEG, PNG, WebP or GIF photo.");

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } },
          { type: "text", text: "Read this receipt." },
        ],
      }],
      output_config: { effort: "low", format: zodOutputFormat(Receipt) },
    });

    if (response.stop_reason === "refusal") return fail(422, "unreadable", "That photo couldn’t be read as a receipt.");
    if (response.stop_reason === "max_tokens") return fail(422, "unreadable", "That receipt is too long to read in one go.");
    const out = response.parsed_output;
    if (!out) return fail(422, "unreadable", "That receipt couldn’t be read. Try a sharper, flatter photo.");

    const items = out.items
      .map((it) => ({ name: it.name.trim(), quantity: Math.max(1, Math.round(it.quantity) || 1), total: cents(it.total) }))
      .filter((it) => it.name && it.total > 0);
    if (!items.length) return fail(422, "no-items", "No items were found on that receipt.");

    const currency = /^[A-Za-z]{3}$/.test(out.currency.trim()) ? out.currency.trim().toUpperCase() : "EUR";
    const result: ReceiptResult = {
      merchant: out.merchant.trim(),
      currency,
      date: out.date,
      items,
      tax: Math.max(0, cents(out.tax)),
      tip: Math.max(0, cents(out.tip)),
      total: out.total === null ? null : cents(out.total),
      unreadable: out.unreadable.slice(0, 20),
    };
    return Response.json(result);
  } catch (err) {
    // Most specific first; APIConnectionError is a subclass of APIError in this SDK.
    if (err instanceof Anthropic.AuthenticationError) return fail(502, "upstream-auth", "The receipt reader’s key was rejected.");
    if (err instanceof Anthropic.RateLimitError) return fail(502, "upstream-busy", "The receipt reader is busy. Try again shortly.");
    if (err instanceof Anthropic.APIConnectionError) return fail(502, "upstream-unreachable", "Couldn’t reach the receipt reader.");
    if (err instanceof Anthropic.APIError) return fail(502, "upstream-error", "The receipt reader had a problem. Try again.");
    // The SDK throws its base error when the answer doesn't parse against the schema (e.g. cut off).
    if (err instanceof Anthropic.AnthropicError) return fail(422, "unreadable", "That receipt couldn’t be read. Try a sharper, flatter photo.");
    throw err;
  }
}
