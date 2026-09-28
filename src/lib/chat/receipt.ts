/**
 * Receipts: what the reader returns, how money is typed, and a sample to try
 * without a camera. Amounts are integer cents everywhere past the parser.
 */

export interface ReceiptLine { name: string; quantity: number; /** Line total, cents. */ total: number }
export interface ReceiptResult {
  merchant: string;
  currency: string;
  /** As printed, if legible (e.g. "2026-09-28"). */
  date: string | null;
  items: ReceiptLine[];
  tax: number;
  tip: number;
  /** The total printed on the receipt, cents; null if it couldn't be read. */
  total: number | null;
  /** Lines the reader could see but not make out. */
  unreadable: string[];
}

/** The largest upload the route accepts; photos are downscaled well below it first. */
export const MAX_RECEIPT_BYTES = 6 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CZK", "HUF", "PLN", "SEK", "DKK", "NOK", "JPY"];

/** A team lunch in Vienna — prices on top of which 10% tax and a tip are added. */
export const SAMPLE_RECEIPT: ReceiptResult = {
  merchant: "Konjō Ramen",
  currency: "EUR",
  date: null,
  items: [
    { name: "Tonkotsu Ramen", quantity: 2, total: 2980 },
    { name: "Spicy Miso Ramen", quantity: 1, total: 1450 },
    { name: "Vegan Tantanmen", quantity: 1, total: 1390 },
    { name: "Gyoza (6 pcs)", quantity: 2, total: 1360 },
    { name: "Edamame", quantity: 1, total: 590 },
    { name: "Yuzu Lemonade", quantity: 3, total: 1350 },
  ],
  tax: 912,
  tip: 900,
  total: 10932,
  unreadable: [],
};
export const SAMPLE_ADDRESS = "Kettenbrückengasse 7, 1050 Wien";

/**
 * Reads what people type for money: "12,50", "12.50", "€ 1.234,50", "12".
 * The last separator followed by one or two digits is the decimal point; any
 * other separator groups thousands. Null when there is no number at all.
 */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const decimals = last >= 0 ? s.length - last - 1 : -1;
  const whole = (decimals >= 0 && decimals <= 2 ? s.slice(0, last) : s).replace(/[.,]/g, "");
  const frac = decimals >= 0 && decimals <= 2 ? s.slice(last + 1) : "";
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return Number.isFinite(cents) ? cents : null;
}

/** Cents as an editable string, with this device's decimal separator. */
export function centsToInput(cents: number) {
  const dec = (1.5).toLocaleString().charAt(1) === "," ? "," : ".";
  return (cents / 100).toFixed(2).replace(".", dec);
}

/**
 * Shrinks a photo on the device before it goes anywhere: at most `max` px on
 * the long side, re-encoded as JPEG (which also drops the photo's metadata).
 * Rejects when the browser can't decode the file (e.g. HEIC on desktop Chrome).
 */
export async function downscaleImage(file: Blob, max = 1600, quality = 0.8): Promise<Blob> {
  const source = await decode(file);
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  // Transparent PNGs would turn black as JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source.image, 0, 0, w, h);
  source.release();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode-failed"))), "image/jpeg", quality);
  });
}

async function decode(file: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // Honours EXIF rotation, so a portrait receipt stays upright.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch { /* fall back to an <img> below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
