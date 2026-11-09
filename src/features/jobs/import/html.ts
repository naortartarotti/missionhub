// HTML → text and schema.org JobPosting (JSON-LD) reading. Pure functions; input is untrusted.
import { SUPPORTED_CURRENCIES, type JobDraft } from "./extract";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Navigation/button labels that ATS pages render around the posting.
const CHROME_LINE = /^(back to jobs|back|apply|apply now|apply for this job|share|save|view all jobs|voltar|candidatar-se|candidate-se|retour|postuler)$/i;

export function htmlToText(html: string): string {
  return stripChrome(htmlToRawText(html));
}

function stripChrome(text: string): string {
  return text
    .split("\n")
    .filter((l) => !CHROME_LINE.test(l.trim()))
    .join("\n");
}

function htmlToRawText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|section|article|tr|header)>/gi, "\n")
      .replace(/<h[1-6]\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

export function pageTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const t = og?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? decodeEntities(t).replace(/\s+/g, " ").trim() : null;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: Json | undefined): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);
const first = (v: Json | undefined): Json | undefined => (Array.isArray(v) ? v[0] : v);

function findJobPosting(node: Json | undefined, depth = 0): Obj | null {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isObj(node)) return null;
  const type = node["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return node;
  return findJobPosting(node["@graph"], depth + 1);
}

const COUNTRY_NAMES: Record<string, string> = { canada: "CA", brazil: "BR", brasil: "BR", "united states": "US", usa: "US", france: "FR", portugal: "PT", "united kingdom": "GB" };

function country(v: Json | undefined): string | undefined {
  const raw = str(isObj(v) ? v.name : v);
  if (!raw) return undefined;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_NAMES[raw.toLowerCase()];
}

const EMPLOYMENT: Record<string, string> = { FULL_TIME: "permanent", CONTRACTOR: "contract", TEMPORARY: "temporary", INTERN: "temporary" };

/** Reads the first schema.org JobPosting embedded in the page (Greenhouse, Lever, Workable, Gupy, most ATSs). */
export function readJobPosting(html: string): { hints: JobDraft; descriptionText: string } | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of blocks) {
    let data: Json;
    try {
      data = JSON.parse(body.trim()) as Json;
    } catch {
      continue;
    }
    const job = findJobPosting(data);
    if (!job) continue;

    const hints: JobDraft = {};
    const title = str(job.title);
    if (title) hints.title = decodeEntities(title);
    const org = first(job.hiringOrganization);
    const orgName = str(isObj(org) ? org.name : org);
    if (orgName) hints.clientName = decodeEntities(orgName);

    const place = first(job.jobLocation);
    const addr = isObj(place) ? first(place.address) : undefined;
    if (isObj(addr)) {
      const city = str(addr.addressLocality);
      const region = str(addr.addressRegion);
      if (city) hints.locationCity = city;
      if (region) hints.locationRegion = region.length <= 3 ? region.toUpperCase() : region;
      const c = country(addr.addressCountry);
      if (c) hints.locationCountry = c;
    }
    if (str(job.jobLocationType) === "TELECOMMUTE") hints.workArrangement = "remote";

    const emp = first(job.employmentType);
    const empType = typeof emp === "string" ? EMPLOYMENT[emp.toUpperCase().replace(/[\s-]/g, "_")] : undefined;
    if (empType) hints.contractType = empType;

    const salary = first(job.baseSalary);
    if (isObj(salary)) {
      const value = isObj(salary.value) ? salary.value : undefined;
      const unit = str(value?.unitText)?.toUpperCase();
      if (!unit || unit === "YEAR" || unit === "MONTH") {
        const min = Number(str(value?.minValue) ?? str(value?.value) ?? str(salary.value));
        const max = Number(str(value?.maxValue));
        if (Number.isFinite(min) && min > 0) hints.salaryMin = String(Math.round(min));
        if (Number.isFinite(max) && max > 0) hints.salaryMax = String(Math.round(max));
        const cur = str(salary.currency)?.toUpperCase();
        if (cur && (SUPPORTED_CURRENCIES as readonly string[]).includes(cur)) hints.salaryCurrency = cur;
      }
    }

    const exp = job.experienceRequirements;
    const months = isObj(exp) ? Number(str(exp.monthsOfExperience)) : NaN;
    if (Number.isFinite(months) && months > 0) hints.minYearsExperience = String(Math.round(months / 12));

    const descriptionText = htmlToText(decodeEntities(str(job.description) ?? ""));
    return { hints, descriptionText };
  }
  return null;
}
