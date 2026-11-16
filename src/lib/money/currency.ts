/** Currencies offered in pickers (organization default, salaries, fees). Ordered by how often agencies bill in them. */
export const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK",
  "BRL", "MXN", "ARS", "CLP", "COP", "PEN",
  "INR", "SGD", "HKD", "JPY", "CNY", "KRW", "AED", "SAR", "ILS", "TRY", "ZAR",
] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/** ISO 4217 minor-unit exponent via Intl (JPY → 0, CAD → 2). */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

const EURO = new Set(["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]);
const BY_COUNTRY: Record<string, CurrencyCode> = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", IN: "INR", SG: "SGD", HK: "HKD", JP: "JPY",
  CN: "CNY", KR: "KRW", AE: "AED", SA: "SAR", IL: "ILS", TR: "TRY", ZA: "ZAR",
};

/** The usual billing currency for a country (USD when unknown). */
export function currencyForCountry(country: string): CurrencyCode {
  const c = country.toUpperCase();
  return EURO.has(c) ? "EUR" : (BY_COUNTRY[c] ?? "USD");
}
