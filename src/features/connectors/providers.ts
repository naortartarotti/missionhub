import "server-only";
import { decodeEntities, htmlToText } from "@/features/jobs/import/html";
import { extractJobFromText, type JobDraft } from "@/features/jobs/import/extract";
import { fetchPublicText, ImportError } from "@/features/jobs/import/sources";
import { jobInputSchema, type CandidateRecord, type JobInput, type JobRecord } from "@/server/ingest/schema";
import { readCandidateSheet, readJobSheet, sheetCsvUrl, type SheetRowError } from "@/server/ingest/sheet";
import type { ConnectionConfig } from "./catalog";

/**
 * Fetchers: turn a provider's public data into ingest records.
 *
 * The ATS connectors here read each company's PUBLIC job board API (the same data its careers
 * page shows), so connecting only needs the board name, no credentials. Rule-based extraction
 * fills skills, seniority and years from the description; structured fields from the provider win.
 */

export class ConnectorError extends Error {
  constructor(public readonly code: "notFound" | "unreachable" | "invalidConfig" | "badFormat" | "missingColumn" | "empty", public readonly detail?: string) {
    super(code);
    this.name = "ConnectorError";
  }
}

export type FetchResult = {
  jobs?: JobRecord[];
  candidates?: CandidateRecord[];
  /** Rows the source sent that could not be read (bad email, missing title…). */
  rejected: SheetRowError[];
  /** True when the result is the source's complete list (absent jobs can be paused). */
  complete: boolean;
};

const slug = (v: string | undefined) => {
  // Accepts the bare name or a pasted link ("boards.greenhouse.io/acme/jobs/1" → "acme").
  let s = (v ?? "").trim().replace(/^https?:\/\//i, "").replace(/[?#].*$/, "");
  if (s.includes("/")) s = s.split("/").filter(Boolean)[1] ?? "";
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(s)) throw new ConnectorError("invalidConfig");
  return s;
};

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Workatent-Connector/1.0" }, signal: AbortSignal.timeout(20000), cache: "no-store" });
  } catch {
    throw new ConnectorError("unreachable");
  }
  if (res.status === 404) throw new ConnectorError("notFound");
  if (!res.ok) throw new ConnectorError("unreachable", String(res.status));
  const text = await res.text();
  if (text.length > 25_000_000) throw new ConnectorError("badFormat");
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some boards answer an unknown name with a 200 text page.
    throw new ConnectorError(/not found/i.test(text) ? "notFound" : "badFormat");
  }
}

const ARRANGEMENT: Record<string, JobInput["workArrangement"]> = { remote: "remote", hybrid: "hybrid", onsite: "onsite", "on-site": "onsite", "on site": "onsite", in_office: "onsite" };
const arrangementOf = (v?: string | null) => (v ? ARRANGEMENT[v.toLowerCase().replace(/\s+/g, " ")] : undefined);

function contractOf(v?: string | null): JobInput["contractType"] {
  const s = (v ?? "").toLowerCase();
  if (!s) return null;
  if (/contract.?to.?hire/.test(s)) return "contract_to_hire";
  if (/contract|freelance|contractor/.test(s)) return "contract";
  if (/temp|seasonal|intern/.test(s)) return "temporary";
  if (/full|part|permanent|regular/.test(s)) return "permanent";
  return null;
}

const toList = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const toNum = (s?: string) => (s ? Number(s) : null);

/** Combines provider fields with what the description states; validates into a JobRecord. */
function buildJob(base: { externalId: string; title: string; descriptionText: string; url?: string | null } & Partial<JobInput>): JobRecord | null {
  const { draft } = extractJobFromText(base.descriptionText, { title: base.title } satisfies JobDraft);
  const r = jobInputSchema.safeParse({
    externalId: base.externalId,
    title: base.title,
    description: base.descriptionText,
    url: base.url ?? null,
    requiredSkills: toList(draft.requiredSkills),
    preferredSkills: toList(draft.preferredSkills),
    seniority: draft.seniority ?? null,
    minYearsExperience: toNum(draft.minYearsExperience),
    languages: toList(draft.languages),
    workArrangement: base.workArrangement ?? arrangementOf(draft.workArrangement) ?? null,
    contractType: base.contractType ?? contractOf(draft.contractType) ?? null,
    location: {
      city: base.location?.city ?? draft.locationCity ?? null,
      region: base.location?.region ?? (base.location?.city ? null : draft.locationRegion) ?? null,
      // A description often mentions other countries; only trust it when the provider gave no location.
      country: base.location?.country ?? (base.location?.city ? null : draft.locationCountry) ?? null,
    },
    salary: base.salary?.min != null || base.salary?.max != null
      ? base.salary
      : draft.salaryMin || draft.salaryMax
        ? { min: toNum(draft.salaryMin), max: toNum(draft.salaryMax), currency: draft.salaryCurrency }
        : {},
    clientName: base.clientName ?? null,
  });
  if (!r.success) return null;
  // The connection decides whether imported jobs go live; a provider never does.
  return { ...r.data, status: undefined };
}

/** English country names → ISO codes, built once from Intl ("Spain" → "ES", "United States" → "US"). */
let COUNTRY_NAMES: Map<string, string> | null = null;
function countryFromText(location: string | undefined | null): string | null {
  if (!location) return null;
  if (!COUNTRY_NAMES) {
    COUNTRY_NAMES = new Map();
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = names.of(code);
        if (name && name !== code && !COUNTRY_NAMES.has(name.toLowerCase())) COUNTRY_NAMES.set(name.toLowerCase(), code);
      }
    for (const [alias, code] of [["usa", "US"], ["us", "US"], ["uk", "GB"], ["england", "GB"], ["uae", "AE"], ["brasil", "BR"], ["deutschland", "DE"], ["españa", "ES"], ["méxico", "MX"]] as const) COUNTRY_NAMES.set(alias, code);
  }
  // The country is usually the last part: "Barcelona, Spain", "Remote - United States".
  const parts = location.split(/[,;|/()–-]/).map((p) => p.trim().toLowerCase()).filter(Boolean).reverse();
  for (const part of parts) {
    const code = COUNTRY_NAMES.get(part);
    if (code) return code;
  }
  return null;
}

const city = (location: string | undefined | null) => {
  const first = (location ?? "").split(/[,;|/]/)[0]?.trim();
  // "France" or "Remote" is not a city.
  return first && !/remote|anywhere|remoto/i.test(first) && first.length <= 100 && !countryFromText(first) ? first : null;
};

// ---------------------------------------------------------------------------------------------

type GreenhouseJob = {
  id: number;
  title: string;
  content: string;
  absolute_url: string;
  location?: { name?: string };
  company_name?: string;
  metadata?: { name: string; value: unknown }[] | null;
};

async function greenhouse(config: ConnectionConfig): Promise<FetchResult> {
  const board = slug(config.board);
  const data = await getJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
  if (!Array.isArray(data.jobs)) throw new ConnectorError("badFormat");
  const jobs = data.jobs.flatMap((j) => {
    const workplace = j.metadata?.find((m) => /workplace|remote/i.test(m.name))?.value;
    const job = buildJob(
      {
        externalId: String(j.id),
        title: j.title,
        descriptionText: htmlToText(decodeEntities(j.content ?? "")),
        url: j.absolute_url,
        workArrangement: arrangementOf(typeof workplace === "string" ? workplace : undefined) ?? (/remote/i.test(j.location?.name ?? "") ? "remote" : undefined),
        location: { city: city(j.location?.name), country: countryFromText(j.location?.name) },
      },
    );
    return job ? [job] : [];
  });
  return { jobs, rejected: [], complete: true };
}

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  country?: string;
  workplaceType?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text: string; content: string }[];
  categories?: { commitment?: string; location?: string; team?: string };
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

async function lever(config: ConnectionConfig): Promise<FetchResult> {
  const site = slug(config.site);
  const host = config.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
  const data = await getJson<LeverPosting[] | { ok: false }>(`https://${host}/v0/postings/${encodeURIComponent(site)}?mode=json`);
  if (!Array.isArray(data)) throw new ConnectorError("notFound");
  const jobs = data.flatMap((p) => {
    const lists = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content ?? "")}`).join("\n\n");
    const yearly = p.salaryRange && (!p.salaryRange.interval || /year|annual/i.test(p.salaryRange.interval));
    const job = buildJob(
      {
        externalId: p.id,
        title: p.text,
        descriptionText: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n"),
        url: p.hostedUrl,
        workArrangement: arrangementOf(p.workplaceType),
        contractType: contractOf(p.categories?.commitment),
        location: { city: city(p.categories?.location), country: p.country && /^[A-Z]{2}$/.test(p.country) ? p.country : countryFromText(p.categories?.location) },
        salary: yearly ? { min: p.salaryRange!.min ?? null, max: p.salaryRange!.max ?? null, currency: p.salaryRange!.currency?.toUpperCase() } : {},
      },
    );
    return job ? [job] : [];
  });
  return { jobs, rejected: [], complete: true };
}

type AshbyJob = {
  id: string;
  title: string;
  jobUrl: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  descriptionPlain?: string;
  isListed?: boolean;
  address?: { postalAddress?: { addressCountry?: string; addressRegion?: string; addressLocality?: string } };
  compensation?: { summaryComponents?: { compensationType: string; interval: string; currencyCode: string | null; minValue: number | null; maxValue: number | null }[] };
};

async function ashby(config: ConnectionConfig): Promise<FetchResult> {
  const board = slug(config.board);
  const data = await getJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
  if (!Array.isArray(data.jobs)) throw new ConnectorError("notFound");
  const jobs = data.jobs.filter((j) => j.isListed !== false).flatMap((j) => {
    const pay = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary" && /year/i.test(c.interval));
    const addr = j.address?.postalAddress;
    const job = buildJob(
      {
        externalId: j.id,
        title: j.title,
        descriptionText: j.descriptionPlain ?? "",
        url: j.jobUrl,
        workArrangement: arrangementOf(j.workplaceType) ?? (j.isRemote ? "remote" : undefined),
        contractType: contractOf(j.employmentType?.replace(/([a-z])([A-Z])/g, "$1 $2")),
        location: {
          city: addr?.addressLocality || city(j.location),
          region: addr?.addressRegion || null,
          country: addr?.addressCountry && /^[A-Z]{2}$/.test(addr.addressCountry) ? addr.addressCountry : countryFromText(addr?.addressCountry ?? j.location),
        },
        salary: pay ? { min: pay.minValue, max: pay.maxValue, currency: pay.currencyCode ?? undefined } : {},
      },
    );
    return job ? [job] : [];
  });
  return { jobs, rejected: [], complete: true };
}

type WorkableJob = {
  shortcode: string;
  title: string;
  url: string;
  description?: string;
  employment_type?: string;
  telecommuting?: boolean;
  city?: string;
  state?: string;
  locations?: { countryCode?: string; city?: string; region?: string }[];
};

async function workable(config: ConnectionConfig): Promise<FetchResult> {
  const sub = slug(config.subdomain);
  const data = await getJson<{ jobs?: WorkableJob[] }>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(sub)}?details=true`);
  if (!Array.isArray(data.jobs)) throw new ConnectorError("notFound");
  const jobs = data.jobs.flatMap((j) => {
    const loc = j.locations?.[0];
    const job = buildJob(
      {
        externalId: j.shortcode,
        title: j.title,
        descriptionText: htmlToText(j.description ?? ""),
        url: j.url,
        workArrangement: j.telecommuting ? "remote" : undefined,
        contractType: contractOf(j.employment_type),
        location: { city: loc?.city || j.city || null, region: loc?.region || j.state || null, country: loc?.countryCode && /^[A-Z]{2}$/.test(loc.countryCode) ? loc.countryCode : null },
      },
    );
    return job ? [job] : [];
  });
  return { jobs, rejected: [], complete: true };
}

/** A spreadsheet's CSV text → records of the chosen kind. */
export function readSheet(text: string, entity: string | undefined): FetchResult {
  if (entity === "jobs") {
    const r = readJobSheet(text);
    if (r.missingRequired) throw new ConnectorError("missingColumn", r.missingRequired);
    return { jobs: r.records, rejected: r.errors, complete: false };
  }
  const r = readCandidateSheet(text);
  if (r.missingRequired) throw new ConnectorError("missingColumn", r.missingRequired);
  return { candidates: r.records, rejected: r.errors, complete: false };
}

async function googleSheets(config: ConnectionConfig): Promise<FetchResult> {
  if (!config.url) throw new ConnectorError("invalidConfig");
  let text: string;
  let type: string;
  try {
    ({ text, contentType: type } = await fetchPublicText(sheetCsvUrl(config.url), { accept: "text/csv,text/plain;q=0.9", maxBytes: 5 * 1024 * 1024 }));
  } catch (e) {
    if (e instanceof ImportError) throw new ConnectorError(e.code === "invalidUrl" ? "invalidConfig" : e.code === "blockedSite" ? "notFound" : "unreachable");
    throw e;
  }
  // A private sheet answers with Google's sign-in page instead of CSV.
  if (/text\/html/i.test(type) || /^\s*<!doctype html/i.test(text)) throw new ConnectorError("notFound");
  return readSheet(text, config.entity);
}

const FETCHERS: Record<string, (config: ConnectionConfig) => Promise<FetchResult>> = {
  greenhouse,
  lever,
  ashby,
  workable,
  google_sheets: googleSheets,
};

export function hasFetcher(provider: string) {
  return provider in FETCHERS;
}

export async function fetchRecords(provider: string, config: ConnectionConfig): Promise<FetchResult> {
  const f = FETCHERS[provider];
  if (!f) throw new ConnectorError("invalidConfig");
  return f(config);
}
