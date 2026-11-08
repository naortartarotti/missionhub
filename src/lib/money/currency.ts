export const SUPPORTED_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "BRL", "JPY"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/** ISO 4217 minor-unit exponent via Intl (JPY → 0, CAD → 2). */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
