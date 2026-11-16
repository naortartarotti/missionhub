import { INTL_LOCALE, type Locale } from "./config";
import { formatMoney } from "@/lib/money/format";
import { currencyExponent } from "@/lib/money/currency";

/**
 * Money display options. `code` shows the ISO code instead of the symbol ("CAD 20,000.00",
 * fr "20 000,00 CAD", pt "CAD 20.000,00"): required on every N2 amount (BR-38), since "$" is
 * ambiguous between CAD and USD. `approx` marks an estimate with a leading tilde ("~CAD 20,000").
 * `whole` drops the minor units.
 */
export type MoneyOptions = { whole?: boolean; code?: boolean; approx?: boolean; /** "+CAD 1,000.00" / "-CAD 1,000.00" (differences); code display only. */ signed?: boolean };

function formatMoneyCode(minor: number | bigint, currency: string, tag: string, whole: boolean, signed = false): string {
  const exp = currencyExponent(currency);
  const digits = whole ? 0 : exp;
  return new Intl.NumberFormat(tag, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: signed ? "exceptZero" : "auto" }).format(Number(minor) / 10 ** exp);
}

/** Locale-aware formatting. Dates are formatted in UTC so server and browser render identical text. */
export function createFormatter(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  const dateFmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "UTC" });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  // Network deadlines (N1 objections, contests) are stated in Toronto time, whatever the viewer's
  // device zone (BR-17). The copy appends the localized "ET" suffix itself.
  const ET = "America/Toronto";
  const etDateTimeFmt = new Intl.DateTimeFormat(tag, { timeZone: ET, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const etShortFmt = new Intl.DateTimeFormat(tag, { timeZone: ET, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const etDateFmt = new Intl.DateTimeFormat(tag, { timeZone: ET, dateStyle: "medium" });
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const percentFmt = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 2 });
  const monthYearFmt = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
  ];
  return {
    locale,
    tag,
    date: (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—"),
    dateTime: (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—"),
    /** Weekday, month, day and time in Toronto ("Fri, Nov 20, 11:59 p.m."), for `{when}` + "ET". */
    etDateTime: (iso: string | null | undefined) => (iso ? etDateTimeFmt.format(new Date(iso)) : "—"),
    /** Same without the weekday, for chips that must stay short ("Nov 20, 11:59 p.m."). */
    etDateTimeShort: (iso: string | null | undefined) => (iso ? etShortFmt.format(new Date(iso)) : "—"),
    /** Calendar date of an instant in Toronto (a delivery's ET date). */
    etDate: (iso: string | null | undefined) => (iso ? etDateFmt.format(new Date(iso)) : "—"),
    relative: (iso: string | null | undefined) => {
      if (!iso) return "—";
      const diff = (Date.now() - Date.parse(iso)) / 1000;
      for (let i = 0; i < steps.length; i++) {
        const [limit, unit] = steps[i];
        if (Math.abs(diff) < limit) return rtf.format(-Math.round(diff / (i === 0 ? 1 : steps[i - 1][0])), unit);
      }
      return rtf.format(-Math.round(diff / 31557600), "year");
    },
    number: (n: number) => new Intl.NumberFormat(tag).format(n),
    /** File size with localized units ("2.3 MB", "2,3 Mo", "234 kB"). */
    fileSize: (bytes: number) =>
      bytes >= 1024 * 1024
        ? new Intl.NumberFormat(tag, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))
        : new Intl.NumberFormat(tag, { style: "unit", unit: "kilobyte", unitDisplay: "short", maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024))),
    money: (minor: number | bigint | null | undefined, currency: string, opts: MoneyOptions = {}) => {
      if (minor === null || minor === undefined) return "—";
      const text = opts.code ? formatMoneyCode(minor, currency, tag, Boolean(opts.whole), opts.signed) : formatMoney(minor, currency, tag, { whole: opts.whole });
      return opts.approx ? `~${text}` : text;
    },
    /** Basis points as an Intl percent, up to 2 decimals, no trailing zeros ("20%", fr "22,5 %"). */
    percent: (bps: number) => percentFmt.format(bps / 10_000),
    /** Month and year of a calendar date ("March 2027", fr "mars 2027"), for approximate dates (N3 hire reports). */
    monthYear: (iso: string | null | undefined) => (iso ? monthYearFmt.format(new Date(iso.length === 7 ? `${iso}-01` : iso)) : "—"),
  };
}

export type Formatter = ReturnType<typeof createFormatter>;
