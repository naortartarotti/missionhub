import "server-only";
import { parseCsv } from "@/features/candidates/csv";
import { candidateInputSchema, jobInputSchema, type CandidateRecord, type JobRecord } from "./schema";

/**
 * Reads a spreadsheet (CSV text) into ingest records. Headers are matched loosely, in English,
 * Portuguese, French or Spanish ("Nome", "E-mail", "Cargo", "Título"…), so a team's existing
 * sheet usually works without renaming columns. Lists use "," or ";" inside a cell.
 */

const norm = (h: string) =>
  h
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const CANDIDATE_ALIASES: Record<string, string[]> = {
  externalId: ["external_id", "id", "candidate_id", "codigo", "ref", "reference"],
  fullName: ["full_name", "name", "nome", "nome_completo", "nom", "nombre", "candidate", "candidato", "candidat"],
  firstName: ["first_name", "primeiro_nome", "prenom", "nombre_de_pila"],
  lastName: ["last_name", "sobrenome", "nom_de_famille", "apellido", "surname"],
  email: ["email", "e_mail", "mail", "courriel", "correo"],
  phone: ["phone", "telefone", "telephone", "telefono", "celular", "mobile", "whatsapp"],
  headline: ["headline", "title", "cargo", "titulo", "titre", "current_title", "position"],
  summary: ["summary", "resumo", "resume", "bio", "about", "sobre"],
  linkedinUrl: ["linkedin", "linkedin_url", "linkedin_profile", "perfil_linkedin"],
  skills: ["skills", "competencias", "habilidades", "competences", "tags", "stack"],
  languages: ["languages", "idiomas", "langues", "linguas"],
  seniority: ["seniority", "senioridade", "nivel", "niveau", "level"],
  yearsExperience: ["years_experience", "experience", "anos_de_experiencia", "experiencia", "annees_experience", "years"],
  city: ["city", "cidade", "ville", "ciudad"],
  region: ["region", "estado", "state", "province", "provincia", "regiao"],
  country: ["country", "pais", "pays", "country_code"],
  workArrangements: ["work_arrangements", "work_arrangement", "modelo", "modelo_de_trabalho", "mode_de_travail", "work_mode", "remote", "remoto"],
  salaryMin: ["salary_min", "salario_min", "salaire_min", "pretensao_min"],
  salaryMax: ["salary_max", "salario_max", "salaire_max", "pretensao_max", "salary", "salario", "pretensao"],
  salaryCurrency: ["salary_currency", "currency", "moeda", "devise", "moneda"],
  notes: ["notes", "notas", "observacoes", "obs", "comments"],
  ownerEmail: ["owner_email", "owner", "recruiter", "recrutador", "responsavel", "recruteur"],
};

const JOB_ALIASES: Record<string, string[]> = {
  externalId: ["external_id", "id", "job_id", "codigo", "ref", "reference", "requisition_id"],
  title: ["title", "titulo", "cargo", "vaga", "job_title", "titre", "poste", "position"],
  clientName: ["client", "client_name", "cliente", "empresa", "company", "entreprise"],
  description: ["description", "descricao", "job_description", "descripcion"],
  requiredSkills: ["required_skills", "skills", "requisitos", "competencias", "competences", "habilidades"],
  preferredSkills: ["preferred_skills", "desejaveis", "diferenciais", "nice_to_have"],
  seniority: ["seniority", "senioridade", "nivel", "niveau", "level"],
  minYearsExperience: ["min_years", "min_years_experience", "years_experience", "anos_de_experiencia", "experience"],
  workArrangement: ["work_arrangement", "modelo", "modelo_de_trabalho", "mode_de_travail", "work_mode", "remote", "remoto", "workplace"],
  contractType: ["contract_type", "tipo_de_contrato", "type_de_contrat", "contrat", "employment_type", "contract"],
  city: ["city", "cidade", "ville", "ciudad"],
  region: ["region", "estado", "state", "province", "provincia"],
  country: ["country", "pais", "pays", "country_code"],
  languages: ["languages", "idiomas", "langues"],
  salaryMin: ["salary_min", "salario_min", "salaire_min"],
  salaryMax: ["salary_max", "salario_max", "salaire_max", "salary", "salario"],
  salaryCurrency: ["salary_currency", "currency", "moeda", "devise"],
  url: ["url", "link", "job_url", "apply_url"],
  status: ["status", "situacao", "statut"],
  ownerEmail: ["owner_email", "owner", "recruiter", "recrutador", "responsavel", "recruteur"],
};

function headerMap(header: string[], aliases: Record<string, string[]>) {
  const cols = header.map(norm);
  const map: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const i = cols.findIndex((c) => names.includes(c));
    if (i >= 0) map[field] = i;
  }
  return map;
}

const list = (v?: string) => (v ?? "").split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
const num = (v?: string) => {
  const s = (v ?? "").replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  return s ? Number(s) : null;
};
const lower = (v?: string) => (v ?? "").trim().toLowerCase() || null;

const ARRANGEMENT: Record<string, string> = { remote: "remote", remoto: "remote", "à distance": "remote", teletrabalho: "remote", hybrid: "hybrid", hibrido: "hybrid", híbrido: "hybrid", hybride: "hybrid", onsite: "onsite", "on-site": "onsite", presencial: "onsite", "sur site": "onsite" };
const arrangement = (v?: string) => ARRANGEMENT[(v ?? "").trim().toLowerCase()] ?? null;
const SENIORITY: Record<string, string> = { estagiario: "intern", estagio: "intern", intern: "intern", junior: "junior", júnior: "junior", jr: "junior", pleno: "mid", mid: "mid", intermediate: "mid", senior: "senior", sênior: "senior", sr: "senior", lead: "lead", lider: "lead", líder: "lead", principal: "principal", executive: "executive", executivo: "executive", diretor: "executive" };
const seniority = (v?: string) => SENIORITY[(v ?? "").trim().toLowerCase()] ?? lower(v);
const CONTRACT: Record<string, string> = { permanent: "permanent", clt: "permanent", efetivo: "permanent", "full-time": "permanent", cdi: "permanent", contract: "contract", pj: "contract", contrato: "contract", freelance: "contract", temporary: "temporary", temporario: "temporary", temporário: "temporary", cdd: "temporary", contract_to_hire: "contract_to_hire" };
const contract = (v?: string) => CONTRACT[(v ?? "").trim().toLowerCase()] ?? null;
const country = (v?: string) => {
  const s = (v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null; // full country names are left out rather than guessed
};

export type SheetRowError = { line: number; field: string; message: string };
export type SheetResult<T> = { records: T[]; errors: SheetRowError[]; rows: number; missingRequired?: string };

function readRows(text: string) {
  const all = parseCsv(text.replace(/^﻿/, ""));
  return { header: all[0] ?? [], body: all.slice(1) };
}

export function readCandidateSheet(text: string, maxRows = 2000): SheetResult<CandidateRecord> {
  const { header, body } = readRows(text);
  const m = headerMap(header, CANDIDATE_ALIASES);
  if (m.fullName === undefined && m.firstName === undefined) return { records: [], errors: [], rows: body.length, missingRequired: "fullName" };
  const records: CandidateRecord[] = [];
  const errors: SheetRowError[] = [];
  body.slice(0, maxRows).forEach((cells, idx) => {
    const cell = (f: string) => (m[f] === undefined ? undefined : (cells[m[f]] ?? "").trim());
    const name = cell("fullName") || [cell("firstName"), cell("lastName")].filter(Boolean).join(" ");
    const r = candidateInputSchema.safeParse({
      externalId: cell("externalId") || undefined,
      fullName: name,
      email: cell("email") || null,
      phone: cell("phone"),
      headline: cell("headline"),
      summary: cell("summary"),
      linkedinUrl: cell("linkedinUrl") ? (/^https?:/i.test(cell("linkedinUrl")!) ? cell("linkedinUrl") : `https://${cell("linkedinUrl")}`) : null,
      skills: list(cell("skills")),
      languages: list(cell("languages")),
      seniority: seniority(cell("seniority")),
      yearsExperience: num(cell("yearsExperience")),
      location: { city: cell("city"), region: cell("region"), country: country(cell("country")) },
      workArrangements: list(cell("workArrangements")).map(arrangement).filter(Boolean),
      salary: { min: num(cell("salaryMin")), max: num(cell("salaryMax")), currency: cell("salaryCurrency")?.toUpperCase() || undefined },
      notes: cell("notes"),
      ownerEmail: cell("ownerEmail") || null,
    });
    if (r.success) records.push(r.data);
    else for (const i of r.error.issues) errors.push({ line: idx + 2, field: i.path.join(".") || "row", message: i.message });
  });
  return { records, errors, rows: body.length };
}

export function readJobSheet(text: string, maxRows = 2000): SheetResult<JobRecord> {
  const { header, body } = readRows(text);
  const m = headerMap(header, JOB_ALIASES);
  if (m.title === undefined) return { records: [], errors: [], rows: body.length, missingRequired: "title" };
  const records: JobRecord[] = [];
  const errors: SheetRowError[] = [];
  body.slice(0, maxRows).forEach((cells, idx) => {
    const cell = (f: string) => (m[f] === undefined ? undefined : (cells[m[f]] ?? "").trim());
    const status = lower(cell("status"));
    const r = jobInputSchema.safeParse({
      externalId: cell("externalId") || undefined,
      title: cell("title"),
      clientName: cell("clientName"),
      description: cell("description"),
      requiredSkills: list(cell("requiredSkills")),
      preferredSkills: list(cell("preferredSkills")),
      seniority: seniority(cell("seniority")),
      minYearsExperience: num(cell("minYearsExperience")),
      workArrangement: arrangement(cell("workArrangement")),
      contractType: contract(cell("contractType")),
      location: { city: cell("city"), region: cell("region"), country: country(cell("country")) },
      languages: list(cell("languages")),
      salary: { min: num(cell("salaryMin")), max: num(cell("salaryMax")), currency: cell("salaryCurrency")?.toUpperCase() || undefined },
      url: cell("url") || null,
      status: status && ["draft", "active", "paused", "closed"].includes(status) ? status : undefined,
      ownerEmail: cell("ownerEmail") || null,
    });
    if (r.success) records.push(r.data);
    else for (const i of r.error.issues) errors.push({ line: idx + 2, field: i.path.join(".") || "row", message: i.message });
  });
  return { records, errors, rows: body.length };
}

/** Google Sheets "share" links → their CSV export; any other link is used as given. */
export function sheetCsvUrl(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return s;
  const gid = s.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}
