// Lightweight skill normalization. Deterministic and explainable; embeddings can extend this later.
const SYNONYMS: Record<string, string> = {
  js: "javascript",
  ecmascript: "javascript",
  ts: "typescript",
  "react.js": "react",
  reactjs: "react",
  "node": "node.js",
  nodejs: "node.js",
  "vue.js": "vue",
  vuejs: "vue",
  postgres: "postgresql",
  psql: "postgresql",
  k8s: "kubernetes",
  gcp: "google cloud",
  "amazon web services": "aws",
  golang: "go",
  "c sharp": "c#",
  csharp: "c#",
  ml: "machine learning",
  "ci/cd": "ci-cd",
  cicd: "ci-cd",
  "product mgmt": "product management",
  ux: "ux design",
  ui: "ui design",
};

export function normalizeSkill(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return SYNONYMS[s] ?? s;
}

export function normalizeSkills(list: readonly string[]): string[] {
  return [...new Set(list.map(normalizeSkill).filter(Boolean))].sort();
}
