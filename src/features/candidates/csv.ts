import { candidateFormSchema } from "./schemas";

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export const CSV_COLUMNS = [
  "full_name",
  "email",
  "phone",
  "headline",
  "skills",
  "languages",
  "seniority",
  "years_experience",
  "city",
  "region",
  "country",
  "work_arrangements",
  "salary_min",
  "salary_max",
  "salary_currency",
  "source_detail",
] as const;

export type CsvRowResult = { line: number; values: Record<string, string>; errors: string[]; parsed?: ReturnType<typeof candidateFormSchema.parse> };

// Spreadsheet formula injection guard for any value that might be re-exported.
const stripFormula = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function validateCsv(text: string, maxRows = 500): { header: string[]; rows: CsvRowResult[]; fatal?: string } {
  const all = parseCsv(text.replace(/^﻿/, ""));
  if (all.length === 0) return { header: [], rows: [], fatal: "The file is empty." };
  const header = all[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!header.includes("full_name")) return { header, rows: [], fatal: "A 'full_name' column is required." };
  if (all.length - 1 > maxRows) return { header, rows: [], fatal: `Import up to ${maxRows} rows at a time.` };
  const rows = all.slice(1).map((cells, idx) => {
    const values: Record<string, string> = {};
    header.forEach((h, i) => (values[h] = stripFormula((cells[i] ?? "").trim())));
    const parsed = candidateFormSchema.safeParse({
      fullName: values.full_name,
      email: values.email,
      phone: values.phone,
      headline: values.headline,
      skills: values.skills?.replace(/;/g, ","),
      languages: values.languages?.replace(/;/g, ","),
      seniority: values.seniority?.toLowerCase(),
      yearsExperience: values.years_experience,
      locationCity: values.city,
      locationRegion: values.region,
      locationCountry: values.country,
      workArrangements: (values.work_arrangements ?? "")
        .split(/[;,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      salaryMin: values.salary_min,
      salaryMax: values.salary_max,
      salaryCurrency: values.salary_currency || "CAD",
      source: "csv_import",
      sourceDetail: values.source_detail,
      legalBasis: "consent",
    });
    return {
      line: idx + 2,
      values,
      errors: parsed.success ? [] : parsed.error.issues.map((i) => `${String(i.path[0] ?? "row")}: ${i.message}`),
      parsed: parsed.success ? parsed.data : undefined,
    };
  });
  return { header, rows };
}
