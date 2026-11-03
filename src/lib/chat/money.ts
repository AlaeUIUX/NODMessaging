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

/** "€2,400" or "$1,250.50": whole amounts without cents, the reader's own separators. */
export function formatMoney(amount: number, currency = DEFAULT_CURRENCY) {
  const whole = Number.isInteger(amount);
  try {
    return amount.toLocaleString(undefined, { style: "currency", currency, minimumFractionDigits: whole ? 0 : undefined, maximumFractionDigits: whole ? 0 : undefined });
  } catch {
    return `${amount} ${currency}`;
  }
}

const LAST = "nod.currency";
/** The currency used last, so the next amount starts in it. */
export function lastCurrency() {
  try {
    return localStorage.getItem(LAST) ?? DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}
export function rememberCurrency(code: string) {
  try {
    localStorage.setItem(LAST, code);
  } catch {}
}
