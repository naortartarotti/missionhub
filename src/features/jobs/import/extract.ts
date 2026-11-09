// Rule-based job posting extraction (no AI). Works on plain text in English, Portuguese and French.
// Principle: only fill a field when the text says so explicitly; leave it empty otherwise.
import { findSkills } from "./vocab";

export type JobDraft = Partial<{
  title: string;
  clientName: string;
  description: string;
  requiredSkills: string;
  preferredSkills: string;
  seniority: string;
  minYearsExperience: string;
  workArrangement: string;
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  languages: string;
  contractType: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
}>;

export const SUPPORTED_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "BRL"] as const;

// ---------------------------------------------------------------------------------------------
// Text helpers

export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Value of the first `Label: value` line whose label matches. */
function labeled(lines: string[], labels: RegExp): string | null {
  for (const line of lines) {
    const m = line.match(/^[•\-*\s]*([^:–—]{2,40})\s*[:–—]\s*(.+)$/);
    if (m && labels.test(strip(m[1]).trim()) && m[2].trim()) return m[2].trim();
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Vocabulary (accent-insensitive; matched against strip(text))

const L = {
  title: /^(job title|title|position|role|job|cargo|vaga|titulo|titulo da vaga|funcao|poste|titre|titre du poste|intitule du poste)$/,
  company: /^(company|client|employer|hiring company|organization|empresa|cliente|contratante|entreprise|employeur|societe)$/,
  location: /^(location|job location|work location|based in|office|localizacao|local|local de trabalho|localidade|cidade|lieu|localisation|lieu de travail|ville)$/,
  salary: /^(salary|salary range|compensation|pay|pay range|base salary|salario|faixa salarial|remuneracao|salaire|remuneration|fourchette salariale)$/,
  contract: /^(employment type|job type|contract type|contract|type|tipo de contrato|tipo de vaga|regime|regime de contratacao|contratacao|type de contrat|type d'emploi|type de poste)$/,
  seniority: /^(seniority|seniority level|level|experience level|nivel|senioridade|nivel de experiencia|niveau|niveau d'experience)$/,
  arrangement: /^(work model|workplace type|workplace|work arrangement|remote|modelo de trabalho|modalidade|formato|modelo|mode de travail|teletravail|lieu de travail)$/,
  languages: /^(languages?|idiomas?|linguas?|langues?)$/,
};

const PREFERRED_HEADING = /(nice to have|nice-to-have|preferred|bonus|bonus points|a plus|is a plus|assets?|desirable|good to have|diferencia(l|is)|desejave(l|is)|seria um plus|sera um diferencial|atouts?|un plus|souhaite)/;
const HEADING = /(requirements?|qualifications?|must have|what you('ll)? (need|bring)|who you are|about you|responsibilities|what you('ll)? do|benefits|perks|about (us|the role|the job|the company)|requisitos|qualificacoes|responsabilidades|atividades|o que (voce|esperamos)|beneficios|sobre (nos|a vaga|a empresa)|exigences|profil|competences|responsabilites|avantages|a propos|missions?|nice to have|preferred|diferenciais|desejavel|atouts)/;

// ---------------------------------------------------------------------------------------------
// Field extractors

const TITLE_SKIP = /^(about|job description|description|overview|summary|company|sobre|descricao|descricao da vaga|resumo|a propos|description du poste|apply|candidate-se|postuler|we are hiring|estamos contratando|nous recrutons|hiring)\b/;

function extractTitle(lines: string[]): string | null {
  const fromLabel = labeled(lines, L.title);
  if (fromLabel && fromLabel.length <= 120) return fromLabel;
  for (const line of lines.slice(0, 8)) {
    const s = strip(line);
    const words = line.split(/\s+/).length;
    if (line.length < 3 || line.length > 100 || words > 12) continue;
    if (/[.!?]$/.test(line) || /https?:|@|\d{4,}/.test(line)) continue;
    if (TITLE_SKIP.test(s) || HEADING.test(s)) continue;
    return line.replace(/\s+[|·•–—-]\s+.*$/, "").trim(); // "Senior Dev — Acme · Toronto" → "Senior Dev"
  }
  return null;
}

function extractCompany(lines: string[], text: string): string | null {
  const v = labeled(lines, L.company);
  if (v && v.length <= 120) return v;
  const about = text.match(/^(?:about|sobre a|sobre o|a propos de|à propos de)\s+(?!us\b|the\b|you\b|this\b|nos\b|a vaga|vous\b|la\b|le\b|nous\b)([\p{L}0-9][\p{L}\d&.,' -]{1,60}?)\s*:?$/imu);
  // Company names are capitalised; "About working here" is not one.
  return about && /^[\p{Lu}0-9]/u.test(about[1]) ? about[1].trim() : null;
}

const SENIORITY_RULES: [RegExp, string][] = [
  [/\b(chief|vp|vice president|head of|director|diretor|diretora|directeur|directrice)\b/, "executive"],
  [/\b(principal|staff)\b/, "principal"],
  [/\b(lead|tech lead|team lead|lider|chef d'equipe)\b/, "lead"],
  [/\b(senior|sr\.?)\b/, "senior"],
  [/\b(pleno|mid-level|mid level|intermediate|intermediaire|confirme)\b/, "mid"],
  [/\b(junior|jr\.?|entry level|entry-level|debutant)\b/, "junior"],
  [/\b(intern|internship|estagio|estagiario|estagiaria|stagiaire|alternant)\b/, "intern"],
];
// Words safe to read from the body (not just the title): "lead"/"director" appear in prose too often.
const BODY_SENIORITY = new Set(["senior", "mid", "junior", "intern"]);

function extractSeniority(title: string | null, lines: string[], text: string): string | null {
  const label = labeled(lines, L.seniority);
  for (const src of [label, title]) {
    if (!src) continue;
    const s = strip(src);
    const hit = SENIORITY_RULES.find(([re]) => re.test(s));
    if (hit) return hit[1];
  }
  const s = strip(text);
  const hit = SENIORITY_RULES.find(([re, v]) => BODY_SENIORITY.has(v) && re.test(s));
  return hit ? hit[1] : null;
}

function extractYears(text: string): number | null {
  const s = strip(text);
  const m = s.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?|anos?|ans|annees?)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 40 ? n : null;
}

function extractArrangement(lines: string[], text: string): string | null {
  const label = labeled(lines, L.arrangement);
  const s = strip(label ?? text);
  const hybrid = /\b(hybrid|hibrido|hybride)\b/.test(s);
  const remote = /\b(remote|remoto|remota|home office|work from home|wfh|teletravail|a distance|full remote|100% remote)\b/.test(s);
  const onsite = /\b(on-site|onsite|on site|in-office|in office|presencial|sur site|en presentiel)\b/.test(s);
  if (hybrid) return "hybrid";
  if (remote && !onsite) return "remote";
  if (onsite && !remote) return "onsite";
  return remote ? "hybrid" : null;
}

function extractContract(lines: string[], text: string): string | null {
  const label = labeled(lines, L.contract);
  const s = strip(label ?? text);
  if (/\bcontract[- ]to[- ]hire\b/.test(s)) return "contract_to_hire";
  if (/\b(permanent|full-time|full time|clt|efetivo|efetiva|cdi|tempo integral|temps plein|permanente)\b/.test(s)) return "permanent";
  if (/\b(temporary|temp\b|temporario|temporaria|temporaire|cdd|interim)\b/.test(s)) return "temporary";
  if (/\b(contractor|freelance|freelancer|pj|contrato pj|contract role|contract position|\d+[- ]month contract|independant)\b/.test(s) || (label && /\bcontract\b/.test(s))) return "contract";
  return null;
}

const LANGUAGES: [RegExp, string][] = [
  [/\b(english|ingles|anglais)\b/, "english"],
  [/\b(french|frances|francais)\b/, "french"],
  [/\b(portuguese|portugues|portugais)\b/, "portuguese"],
  [/\b(spanish|espanhol|espagnol|espanol)\b/, "spanish"],
  [/\b(german|alemao|allemand)\b/, "german"],
  [/\b(italian|italiano|italien)\b/, "italian"],
  [/\b(mandarin|chinese|mandarim|chines|chinois)\b/, "mandarin"],
];

function extractLanguages(lines: string[], text: string): string[] {
  const label = labeled(lines, L.languages);
  const s = strip(label ?? text);
  const found = LANGUAGES.filter(([re]) => re.test(s)).map(([, v]) => v);
  if (/\b(bilingual|bilingue)\b/.test(s)) found.push("english", "french");
  return [...new Set(found)];
}

// --- Location --------------------------------------------------------------------------------

const COUNTRIES: Record<string, string> = {
  canada: "CA", brazil: "BR", brasil: "BR", "united states": "US", usa: "US", "u.s.": "US", eua: "US", "estados unidos": "US",
  "etats-unis": "US", france: "FR", franca: "FR", portugal: "PT", "united kingdom": "GB", uk: "GB", "reino unido": "GB",
  "royaume-uni": "GB", germany: "DE", alemanha: "DE", allemagne: "DE", spain: "ES", espanha: "ES", espagne: "ES",
  mexico: "MX", ireland: "IE", netherlands: "NL", argentina: "AR", chile: "CL", colombia: "CO",
};
const CA_PROVINCES: Record<string, string> = {
  on: "ON", ontario: "ON", qc: "QC", quebec: "QC", bc: "BC", "british columbia": "BC", ab: "AB", alberta: "AB", mb: "MB",
  manitoba: "MB", sk: "SK", saskatchewan: "SK", ns: "NS", "nova scotia": "NS", nb: "NB", "new brunswick": "NB", nl: "NL",
  newfoundland: "NL", pe: "PE", pei: "PE",
};
const BR_STATES = new Set(["sp", "rj", "mg", "pr", "sc", "rs", "ba", "df", "pe", "ce", "go", "es", "am", "pa", "mt", "ms"]);
const CITIES: Record<string, [string, string, string]> = {
  toronto: ["Toronto", "ON", "CA"], montreal: ["Montréal", "QC", "CA"], vancouver: ["Vancouver", "BC", "CA"],
  calgary: ["Calgary", "AB", "CA"], ottawa: ["Ottawa", "ON", "CA"], edmonton: ["Edmonton", "AB", "CA"],
  "quebec city": ["Québec", "QC", "CA"], waterloo: ["Waterloo", "ON", "CA"], mississauga: ["Mississauga", "ON", "CA"],
  "sao paulo": ["São Paulo", "SP", "BR"], "rio de janeiro": ["Rio de Janeiro", "RJ", "BR"], "belo horizonte": ["Belo Horizonte", "MG", "BR"],
  curitiba: ["Curitiba", "PR", "BR"], "porto alegre": ["Porto Alegre", "RS", "BR"], florianopolis: ["Florianópolis", "SC", "BR"],
  lisbon: ["Lisbon", "", "PT"], lisboa: ["Lisboa", "", "PT"], paris: ["Paris", "", "FR"], lyon: ["Lyon", "", "FR"],
  london: ["London", "", "GB"], "new york": ["New York", "NY", "US"], "san francisco": ["San Francisco", "CA", "US"],
};

type Location = { city?: string; region?: string; country?: string };

function parseLocation(value: string): Location {
  const parts = value.split(/\s*(?:,|\||\/|\s[-–]\s)\s*/).map((p) => p.trim()).filter(Boolean);
  const out: Location = {};
  const rest: string[] = [];
  for (const p of parts) {
    const s = strip(p).replace(/\(.*\)/, "").trim();
    if (!out.country && COUNTRIES[s]) out.country = COUNTRIES[s];
    else if (!out.region && CA_PROVINCES[s]) { out.region = CA_PROVINCES[s]; out.country ??= "CA"; }
    else if (!out.region && BR_STATES.has(s) && p.length === 2) { out.region = p.toUpperCase(); out.country ??= "BR"; }
    else if (!/\b(remote|remoto|hybrid|hibrido|teletravail|presencial)\b/.test(s)) rest.push(p.replace(/\(.*\)/, "").trim());
  }
  if (rest[0]) out.city = rest[0];
  if (!out.region && rest[1]) out.region = rest[1];
  const known = out.city ? CITIES[strip(out.city)] : undefined;
  if (known) {
    out.city = known[0];
    if (!out.region && known[1]) out.region = known[1];
    out.country ??= known[2];
  }
  return out;
}

function extractLocation(lines: string[], text: string): Location {
  const label = labeled(lines, L.location);
  if (label) return parseLocation(label);
  // A short "City, Country" / "Remote - Germany" line near the top (common in ATS pages and LinkedIn copies).
  for (const line of lines.slice(0, 12)) {
    if (line.length > 60 || /[.!?]$/.test(line)) continue;
    const loc = parseLocation(line.replace(/^.*?[·•]\s*/, ""));
    if (loc.country && (loc.city || loc.region || line.split(/\s+/).length <= 4)) return loc;
  }
  const ca = text.match(/\b([A-ZÀ-Ý][a-zà-ÿ]+(?:[ -][A-ZÀ-Ý][a-zà-ÿ]+)*),\s*(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)\b/);
  if (ca) return parseLocation(`${ca[1]}, ${ca[2]}`);
  const br = text.match(/\b([A-ZÀ-Ý][a-zà-ÿ]+(?: (?:d[aeo]s? )?[A-ZÀ-Ý][a-zà-ÿ]+)*)\s*[-,/]\s*(SP|RJ|MG|PR|SC|RS|BA|DF|PE|CE|GO|ES)\b/);
  if (br) return parseLocation(`${br[1]}, ${br[2]}`);
  const s = strip(text);
  const city = Object.keys(CITIES).find((c) => new RegExp(`\\b${c}\\b`).test(s));
  if (city) {
    const [name, region, country] = CITIES[city];
    return { city: name, region: region || undefined, country };
  }
  return {};
}

// --- Salary ----------------------------------------------------------------------------------

const CUR = String.raw`(R\$|C\$|CA\$|US\$|\$|€|£|CAD|USD|EUR|GBP|BRL)`;
const NUM = String.raw`(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(k|mil)?`;
const SEP = String.raw`\s*(?:-|–|—|to|a|à|até|ate|et)\s*`;
const RANGE = new RegExp(`${CUR}?\\s*${NUM}\\s*${CUR}?(?:${SEP}${CUR}?\\s*${NUM})?\\s*${CUR}?`, "gi");
const SALARY_CONTEXT = /(salary|compensation|pay|base|salario|remuneracao|faixa|salaire|remuneration|\/year|per year|annual|ao ano|por ano|\/mes|por mes|par an|annuel)/;
const HOURLY = /(\/ ?h(ou)?r?\b|per hour|an hour|hourly|por hora|\/hora|de l'heure|par heure|\/ ?heure)/;

function toNumber(raw: string, suffix?: string): number | null {
  let s = raw.replace(/\s/g, "");
  // Drop a trailing decimal part ("8.000,00" / "120,000.50") when it follows a thousands group.
  if (/[.,]\d{3}[.,]\d{1,2}$/.test(s)) s = s.replace(/[.,]\d{1,2}$/, "");
  if (/[.,]\d{3}$/.test(s) || /[.,]\d{3}[.,]/.test(s)) s = s.replace(/[.,]/g, "");
  else s = s.replace(",", ".");
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (suffix && /^(k|mil)$/i.test(suffix)) n *= 1000;
  return Math.round(n);
}

function currencyOf(symbol: string | undefined, country: string | undefined): string | null {
  if (!symbol) return null;
  const s = symbol.toUpperCase();
  if (s === "R$" || s === "BRL") return "BRL";
  if (s === "€" || s === "EUR") return "EUR";
  if (s === "£" || s === "GBP") return "GBP";
  if (s === "C$" || s === "CA$" || s === "CAD") return "CAD";
  if (s === "US$" || s === "USD") return "USD";
  if (s === "$") return country === "CA" ? "CAD" : country === "US" ? "USD" : null;
  return null;
}

type Salary = { min?: number; max?: number; currency?: string };

export function parseSalary(value: string, country?: string): Salary | null {
  if (HOURLY.test(strip(value))) return null;
  for (const m of value.matchAll(RANGE)) {
    const [, c1, n1, k1, c1b, c2, n2, k2, c3] = m;
    const symbol = c1 ?? c1b ?? c2 ?? c3;
    const a = toNumber(n1, k1 ?? k2);
    const b = n2 ? toNumber(n2, k2 ?? k1) : null;
    if (a === null || a < 1000) continue; // "5 years", "2 days" — not money
    if (!symbol && !SALARY_CONTEXT.test(strip(value))) continue;
    const lo = b !== null && b < a ? b : a;
    const hi = b !== null ? Math.max(a, b) : undefined;
    return { min: lo, max: hi, currency: currencyOf(symbol, country) ?? undefined };
  }
  return null;
}

function extractSalary(lines: string[], country: string | undefined): Salary | null {
  const label = labeled(lines, L.salary);
  if (label) return parseSalary(label, country);
  for (const line of lines) {
    if (!SALARY_CONTEXT.test(strip(line)) && !/(R\$|C\$|US\$|€|£|\$)\s*\d/.test(line)) continue;
    const r = parseSalary(line, country);
    if (r) return r;
  }
  return null;
}

// --- Skills: required vs. preferred, by section -----------------------------------------------

function extractSkills(lines: string[]): { required: string[]; preferred: string[] } {
  const preferredText: string[] = [];
  const otherText: string[] = [];
  let inPreferred = false;
  for (const line of lines) {
    const s = strip(line);
    const isHeading = line.length <= 70 && line.split(/\s+/).length <= 9 && (line.endsWith(":") || HEADING.test(s));
    if (isHeading) inPreferred = PREFERRED_HEADING.test(s);
    else if (!isHeading && PREFERRED_HEADING.test(s) && line.length < 200) {
      preferredText.push(line); // inline: "Experience with Go is a plus"
      continue;
    }
    (inPreferred ? preferredText : otherText).push(line);
  }
  const required = findSkills(otherText.join("\n"));
  const preferred = findSkills(preferredText.join("\n")).filter((s) => !required.includes(s));
  return { required, preferred };
}

// ---------------------------------------------------------------------------------------------

export type ExtractResult = { draft: JobDraft; filled: (keyof JobDraft)[] };

/** Extracts what a pasted job posting states explicitly. `hints` (e.g. from JSON-LD) win over text rules. */
export function extractJobFromText(raw: string, hints: JobDraft = {}): ExtractResult {
  const text = cleanText(raw);
  const lines = text.split("\n").filter(Boolean);
  const title = hints.title ?? extractTitle(lines);
  const loc = extractLocation(lines, text);
  const country = hints.locationCountry ?? loc.country;
  const salary = hints.salaryMin || hints.salaryMax ? null : extractSalary(lines, country);
  const skills = extractSkills(lines);
  const years = extractYears(text);
  const langs = extractLanguages(lines, text);

  const draft: JobDraft = {
    title: title ?? undefined,
    clientName: extractCompany(lines, text) ?? undefined,
    description: text.slice(0, 20000),
    requiredSkills: skills.required.join(", ") || undefined,
    preferredSkills: skills.preferred.join(", ") || undefined,
    seniority: extractSeniority(title, lines, text) ?? undefined,
    minYearsExperience: years !== null ? String(years) : undefined,
    workArrangement: extractArrangement(lines, text) ?? undefined,
    locationCity: loc.city,
    locationRegion: loc.region,
    locationCountry: loc.country,
    languages: langs.join(", ") || undefined,
    contractType: extractContract(lines, text) ?? undefined,
    salaryMin: salary?.min !== undefined ? String(salary.min) : undefined,
    salaryMax: salary?.max !== undefined ? String(salary.max) : undefined,
    salaryCurrency: salary?.currency,
  };
  for (const [k, v] of Object.entries(hints)) if (v) draft[k as keyof JobDraft] = v;
  if (draft.salaryCurrency && !(SUPPORTED_CURRENCIES as readonly string[]).includes(draft.salaryCurrency)) delete draft.salaryCurrency;
  if (draft.locationCountry && !/^[A-Z]{2}$/.test(draft.locationCountry)) delete draft.locationCountry;

  const filled = (Object.keys(draft) as (keyof JobDraft)[]).filter((k) => draft[k]);
  return { draft, filled };
}
