// Skills the rule-based extractor recognises in free text. Only literal mentions are suggested —
// nothing here is ever inferred. Entries are canonical names (see matching/domain/skills.ts).
export const SKILL_VOCAB = [
  // Engineering
  "typescript", "javascript", "react", "next.js", "node.js", "vue", "angular", "svelte", "html", "css", "tailwind",
  "python", "django", "flask", "fastapi", "java", "spring", "kotlin", "go", "rust", "c#", ".net", "c++", "scala", "elixir",
  "ruby", "rails", "php", "laravel", "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "kafka",
  "aws", "azure", "google cloud", "docker", "kubernetes", "terraform", "ansible", "graphql", "rest", "microservices",
  "ci-cd", "linux", "security", "swift", "ios", "android", "flutter", "react native", "qa", "selenium", "cypress", "playwright",
  // Data
  "machine learning", "deep learning", "nlp", "data engineering", "data science", "spark", "airflow", "dbt", "snowflake",
  "databricks", "bigquery", "pandas", "tableau", "power bi", "looker", "excel", "statistics", "r",
  // Product / design
  "figma", "ux design", "ui design", "design systems", "user research", "product management", "product strategy", "roadmapping",
  "agile", "scrum", "kanban", "jira",
  // Business
  "salesforce", "hubspot", "sap", "oracle", "netsuite", "quickbooks", "accounting", "cpa", "financial modeling", "fp&a", "audit",
  "sales", "b2b sales", "account management", "business development", "customer success", "marketing", "digital marketing",
  "seo", "sem", "google ads", "meta ads", "paid media", "content marketing", "email marketing", "copywriting", "crm",
  "project management", "pmp", "recruiting", "human resources", "payroll", "supply chain", "logistics", "procurement",
] as const;

const escape = (s: string) => s.replace(/[.+#&*?^$()[\]{}|\\]/g, (c) => `\\${c}`);
const PATTERNS = SKILL_VOCAB.map((s) => [s, new RegExp(`(^|[^a-z0-9])${escape(s)}([^a-z0-9]|$)`)] as const);

// Single letters / short words that collide with ordinary prose: only accept them in a list-like context.
const AMBIGUOUS = new Set(["r", "go", "rest", "sem", "qa", "css", "html"]);

// Portuguese / French wording for the same skills (matched accent-insensitively).
const ALIASES: [RegExp, string][] = [
  [/\b(comptabilite|contabilidade|contabil)\b/, "accounting"],
  [/\b(gestion de projets?|gestao de projetos?|gerenciamento de projetos?|gerencia de projetos?)\b/, "project management"],
  [/\b(gestion de produits?|gestao de produtos?)\b/, "product management"],
  [/\b(recrutement|recrutamento|recrutamento e selecao)\b/, "recruiting"],
  [/\b(ressources humaines|recursos humanos)\b/, "human resources"],
  [/\b(vendas|ventes)\b/, "sales"],
  [/\b(marketing digital|marketing numerique)\b/, "digital marketing"],
  [/\b(folha de pagamento|paie)\b/, "payroll"],
  [/\b(logistica|logistique)\b/, "logistics"],
  [/\b(compras|achats|approvisionnement)\b/, "procurement"],
  [/\b(auditoria)\b/, "audit"],
  [/\b(sucesso do cliente|succes client)\b/, "customer success"],
  [/\b(aprendizado de maquina|apprentissage automatique)\b/, "machine learning"],
  [/\b(ciencia de dados|science des donnees)\b/, "data science"],
  [/\b(engenharia de dados|ingenierie des donnees)\b/, "data engineering"],
  [/\b(estatistica|statistiques)\b/, "statistics"],
  [/\b(desenvolvimento de negocios|developpement des affaires)\b/, "business development"],
];

/** Skills from SKILL_VOCAB that appear literally in `text` (case-insensitive). */
export function findSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const plain = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const aliased = ALIASES.filter(([re]) => re.test(plain)).map(([, skill]) => skill);
  return [...new Set([...aliased, ...matchVocab(lower)])];
}

function matchVocab(lower: string): string[] {
  return PATTERNS.filter(([skill, re]) => {
    if (!re.test(lower)) return false;
    if (!AMBIGUOUS.has(skill)) return true;
    // e.g. "Python, R, SQL" or "• Go" — the token sits next to a comma, slash, bullet or line edge.
    return new RegExp(`(^|[,/•·|(]\\s*)${escape(skill)}\\s*($|[,/|)])`, "m").test(lower);
  }).map(([skill]) => skill);
}
