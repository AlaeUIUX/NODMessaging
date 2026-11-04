import { CURRENCIES } from "./receipt";

/*
 * Money in Mind: which currency an amount is in, how it's written, and the
 * list to pick one from. An amount with no currency is in euros (everything
 * saved before there was a choice).
 */

export const DEFAULT_CURRENCY = "EUR";

/** The ones receipts know first, then every other currency the browser knows, A to Z. */
export function allCurrencies(): string[] {
  let rest: string[] = [];
  try {
    rest = Intl.supportedValuesOf("currency").filter((c) => !CURRENCIES.includes(c));
  } catch {}
  return [...CURRENCIES, ...rest];
}

let names: Intl.DisplayNames | null = null;
/** "US Dollar", in the reader's language; the code itself when the browser doesn't know it. */
export function currencyName(code: string) {
  try {
    names ??= new Intl.DisplayNames(undefined, { type: "currency" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A currency's flag, from the country its code starts with (USD is 🇺🇸).
 * The euro has its own; codes that aren't a country's (gold, the CFA and
 * East Caribbean francs, test codes) get a globe.
 */
export function currencyFlag(code: string) {
  if (code === "EUR") return "🇪🇺";
  if (code.startsWith("X")) return "🌐";
  return [...code.slice(0, 2)].map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join("");
}

let regions: Intl.DisplayNames | null = null;
/** The country a currency belongs to, for search ("Morocco" finds MAD); the euro's is the European Union. */
export function currencyCountry(code: string) {
  if (code.startsWith("X")) return "";
  try {
    regions ??= new Intl.DisplayNames(undefined, { type: "region" });
    return regions.of(code.slice(0, 2)) ?? "";
  } catch {
    return "";
  }
}

/** Whether a currency matches what was typed: its code, its name or its country. */
export function currencyMatches(code: string, query: string) {
  const q = query.trim().toLowerCase();
  return !q || code.toLowerCase().includes(q) || currencyName(code).toLowerCase().includes(q) || currencyCountry(code).toLowerCase().includes(q);
}

/** Symbols more than one currency goes by: an amount in one of these says which, too. */
const AMBIGUOUS = new Set(["$", "kr", "kr.", "¥", "￥", "R", "Rs"]);
const symbols = new Map<string, string>();
/** A currency's own short symbol ("€", "$", "kr"), or its code when it has none ("MAD"). */
function symbolOf(code: string) {
  let s = symbols.get(code);
  if (s === undefined) {
    try {
      s = new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
    } catch {
      s = code;
    }
    symbols.set(code, s);
  }
  return s;
}

/**
 * An amount as a card shows it: with its symbol, written the reader's way
 * ("€12.50", "£8"). A symbol several currencies share gets the code too
 * ("$1,250 USD"); one written in letters goes after the figure, as people
 * write it ("450 MAD", "300 Kč"), the code standing in when those letters are
 * shared ("1,200 SEK"). Whole amounts drop the cents.
 */
export function formatMoney(amount: number, currency = DEFAULT_CURRENCY) {
  const whole = Number.isInteger(amount);
  const sym = symbolOf(currency);
  const shared = AMBIGUOUS.has(sym);
  try {
    if (/^[\p{L}.\s]+$/u.test(sym)) {
      const figure = amount.toLocaleString(undefined, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
      return `${figure} ${shared ? currency : sym}`;
    }
    const s = amount.toLocaleString(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: whole ? 0 : undefined, maximumFractionDigits: whole ? 0 : undefined });
    return shared ? `${s} ${currency}` : s;
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Reference rates, in units per euro, for the currencies bills come in. The
 * Dashboard adds amounts in different currencies up in one, the person's
 * main currency. Fixed for the prototype; the real app reads them from a
 * rates service.
 */
const PER_EURO: Record<string, number> = {
  EUR: 1, USD: 1.08, GBP: 0.85, CHF: 0.94, CZK: 25.2, HUF: 395, PLN: 4.3, SEK: 11.3, DKK: 7.46, NOK: 11.6, JPY: 163,
};
/** The currencies money can be added up in: the ones there are rates for. */
export const MAIN_CURRENCIES = CURRENCIES.filter((c) => c in PER_EURO);

/** Cents (hundredths) in one currency as cents in another, at the reference rates. */
export function convertCents(cents: number, from: string, to: string) {
  if (from === to) return cents;
  return Math.round((cents / (PER_EURO[from] ?? 1)) * (PER_EURO[to] ?? 1));
}

/** Whole units for a chart's axis: "€1.2k", "¥34k", "CHF 340". */
export function moneyShort(cents: number, currency = DEFAULT_CURRENCY) {
  try {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
  } catch {
    return `${Math.round(cents / 100)} ${currency}`;
  }
}

/** An amount in its parts, so the cents can be drawn smaller: "€", "1,250", ".50" (none for yen). */
export function moneyParts(cents: number, currency = DEFAULT_CURRENCY) {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(cents / 100);
    const at = parts.findIndex((p) => p.type === "decimal");
    const cut = at < 0 ? parts.length : at;
    return { main: parts.slice(0, cut).map((p) => p.value).join(""), cents: parts.slice(cut).map((p) => p.value).join("") };
  } catch {
    return { main: `${(cents / 100).toFixed(2)} ${currency}`, cents: "" };
  }
}

/* Where amounts start: the currency used last, else the phone's region's. */

const EURO_AREA = new Set("AD AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA XK".split(" "));
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", GB: "GBP", CH: "CHF", LI: "CHF", CA: "CAD", AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", KR: "KRW", IN: "INR",
  SG: "SGD", HK: "HKD", TW: "TWD", TH: "THB", MY: "MYR", ID: "IDR", PH: "PHP", VN: "VND", PK: "PKR",
  SE: "SEK", NO: "NOK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", RS: "RSD", UA: "UAH", TR: "TRY", IL: "ILS",
  MA: "MAD", DZ: "DZD", TN: "TND", EG: "EGP", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD",
  ZA: "ZAR", NG: "NGN", KE: "KES", GH: "GHS", BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
};
/** The currency of the region the phone is set to (Morocco → MAD), else euros. */
export function regionCurrency() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? "";
    return EURO_AREA.has(region) ? "EUR" : REGION_CURRENCY[region] ?? DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

const LAST = "nod.currency";
const RECENT = "nod.currency.recent";
/** Currencies picked before, the latest first (five at most). */
export function recentCurrencies(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT) ?? "null") as unknown;
    if (Array.isArray(list)) return list.filter((c): c is string => typeof c === "string");
    // From before there was a list: the one used last.
    const last = localStorage.getItem(LAST);
    return last ? [last] : [];
  } catch {
    return [];
  }
}
/** The currency used last, so the next amount starts in it; else the phone's region's. */
export function lastCurrency() {
  return recentCurrencies()[0] ?? regionCurrency();
}
export function rememberCurrency(code: string) {
  try {
    localStorage.setItem(LAST, code);
    localStorage.setItem(RECENT, JSON.stringify([code, ...recentCurrencies().filter((c) => c !== code)].slice(0, 5)));
  } catch {}
}
