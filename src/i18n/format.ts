import { INTL_LOCALE, type Locale } from "./config";
import { formatMoney } from "@/lib/money/format";

/** Locale-aware formatting. Dates are formatted in UTC so server and browser render identical text. */
export function createFormatter(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  const dateFmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "UTC" });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
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
    money: (minor: number | bigint | null | undefined, currency: string, opts?: { whole?: boolean }) => formatMoney(minor, currency, tag, opts),
  };
}

export type Formatter = ReturnType<typeof createFormatter>;
