import { currencyExponent } from "./currency";

export function formatMoney(minor: number | bigint | null | undefined, currency: string, locale = "en-CA", opts: { whole?: boolean } = {}): string {
  if (minor === null || minor === undefined) return "—";
  const exp = currencyExponent(currency);
  const value = Number(minor) / 10 ** exp;
  const digits = opts.whole ? 0 : exp;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Parses a user-entered major-unit amount ("20,000.50") to integer minor units without float error. */
export function parseMajorToMinor(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const exp = currencyExponent(currency);
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > exp) return null;
  const minor = BigInt(whole) * 10n ** BigInt(exp) + BigInt((frac + "0".repeat(exp)).slice(0, exp) || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(minor);
}

export function minorToMajorString(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const exp = currencyExponent(currency);
  return (minor / 10 ** exp).toFixed(exp);
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
