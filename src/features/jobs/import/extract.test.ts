import { describe, expect, it } from "vitest";
import { extractJobFromText, parseSalary } from "./extract";
import { htmlToText, readJobPosting } from "./html";

const EN = `Senior Frontend Engineer
Acme Corp · Toronto, ON (Hybrid)

About Acme
We build tools for logistics teams.

What you'll bring
• 5+ years building web apps with React and TypeScript
• Solid experience with Node.js and PostgreSQL
• Fluent English; French is an asset

Nice to have
• GraphQL
• Experience with AWS

Salary: $120,000 - $150,000 CAD per year
Employment type: Full-time, permanent`;

const PT = `Desenvolvedor(a) Back-end Pleno
Empresa: Banco Exemplo
Local: São Paulo - SP
Modelo de trabalho: Remoto
Regime: CLT

Requisitos
- 3 anos de experiência com Python e Django
- Conhecimento em Docker e SQL
- Inglês intermediário

Diferenciais
- Kubernetes

Faixa salarial: R$ 8.000 a R$ 12.000 por mês`;

const FR = `Analyste financier(ère) junior
Lieu : Montréal, QC
Type de contrat : CDI
Mode de travail : hybride

Exigences
- 2 ans d'expérience en comptabilité ou finance
- Maîtrise d'Excel et Power BI
- Bilingue (français et anglais)

Salaire : 60 000 $ – 70 000 $ par an`;

describe("extractJobFromText", () => {
  it("reads an English posting", () => {
    const { draft } = extractJobFromText(EN);
    expect(draft.title).toBe("Senior Frontend Engineer");
    expect(draft.clientName).toBe("Acme");
    expect(draft.seniority).toBe("senior");
    expect(draft.minYearsExperience).toBe("5");
    expect(draft.workArrangement).toBe("hybrid");
    expect(draft.locationCity).toBe("Toronto");
    expect(draft.locationRegion).toBe("ON");
    expect(draft.locationCountry).toBe("CA");
    expect(draft.contractType).toBe("permanent");
    expect(draft.salaryMin).toBe("120000");
    expect(draft.salaryMax).toBe("150000");
    expect(draft.salaryCurrency).toBe("CAD");
    expect(draft.requiredSkills?.split(", ")).toEqual(expect.arrayContaining(["react", "typescript", "node.js", "postgresql"]));
    expect(draft.preferredSkills?.split(", ")).toEqual(expect.arrayContaining(["graphql", "aws"]));
    expect(draft.requiredSkills).not.toContain("graphql");
    expect(draft.languages).toContain("english");
  });

  it("reads a Portuguese posting", () => {
    const { draft } = extractJobFromText(PT);
    expect(draft.title).toBe("Desenvolvedor(a) Back-end Pleno");
    expect(draft.clientName).toBe("Banco Exemplo");
    expect(draft.seniority).toBe("mid");
    expect(draft.minYearsExperience).toBe("3");
    expect(draft.workArrangement).toBe("remote");
    expect(draft.contractType).toBe("permanent");
    expect(draft.locationCity).toBe("São Paulo");
    expect(draft.locationRegion).toBe("SP");
    expect(draft.locationCountry).toBe("BR");
    expect(draft.salaryMin).toBe("8000");
    expect(draft.salaryMax).toBe("12000");
    expect(draft.salaryCurrency).toBe("BRL");
    expect(draft.requiredSkills?.split(", ")).toEqual(expect.arrayContaining(["python", "django", "docker", "sql"]));
    expect(draft.preferredSkills).toBe("kubernetes");
    expect(draft.languages).toBe("english");
  });

  it("reads a French posting", () => {
    const { draft } = extractJobFromText(FR);
    expect(draft.title).toBe("Analyste financier(ère) junior");
    expect(draft.seniority).toBe("junior");
    expect(draft.minYearsExperience).toBe("2");
    expect(draft.workArrangement).toBe("hybrid");
    expect(draft.contractType).toBe("permanent");
    expect(draft.locationCity).toBe("Montréal");
    expect(draft.locationCountry).toBe("CA");
    expect(draft.salaryMin).toBe("60000");
    expect(draft.salaryMax).toBe("70000");
    expect(draft.requiredSkills?.split(", ")).toEqual(expect.arrayContaining(["accounting", "excel", "power bi"]));
    expect(draft.languages?.split(", ").sort()).toEqual(["english", "french"]);
  });

  it("leaves fields empty when the text doesn't say", () => {
    const { draft, filled } = extractJobFromText("We are looking for someone great to join our friendly team and grow with us over time.");
    expect(draft.salaryMin).toBeUndefined();
    expect(draft.seniority).toBeUndefined();
    expect(draft.contractType).toBeUndefined();
    expect(filled).toContain("description");
  });

  it("lets structured hints win over text rules", () => {
    const { draft } = extractJobFromText(EN, { title: "Staff Engineer", salaryMin: "200000" });
    expect(draft.title).toBe("Staff Engineer");
    expect(draft.salaryMin).toBe("200000");
    expect(draft.salaryMax).toBeUndefined();
  });
});

describe("parseSalary", () => {
  it("handles k suffixes, hourly rates and bare numbers", () => {
    expect(parseSalary("$90k–110k", "US")).toEqual({ min: 90000, max: 110000, currency: "USD" });
    expect(parseSalary("$45/hour", "CA")).toBeNull();
    expect(parseSalary("5 years of experience")).toBeNull();
    expect(parseSalary("€55.000", undefined)).toEqual({ min: 55000, max: undefined, currency: "EUR" });
  });
});

describe("readJobPosting", () => {
  it("maps schema.org JobPosting JSON-LD", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Ignore me" },
        {
          "@type": "JobPosting",
          title: "Data Engineer",
          description: "&lt;p&gt;We use &lt;b&gt;Python&lt;/b&gt;, Spark and Airflow.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;4+ years&lt;/li&gt;&lt;/ul&gt;",
          hiringOrganization: { "@type": "Organization", name: "Northwind" },
          employmentType: "CONTRACTOR",
          jobLocation: { "@type": "Place", address: { addressLocality: "Vancouver", addressRegion: "BC", addressCountry: "CA" } },
          baseSalary: { "@type": "MonetaryAmount", currency: "CAD", value: { minValue: 100000, maxValue: 130000, unitText: "YEAR" } },
        },
      ],
    })}</script></head><body></body></html>`;
    const r = readJobPosting(html);
    expect(r).not.toBeNull();
    const { draft } = extractJobFromText(r!.descriptionText, r!.hints);
    expect(draft).toMatchObject({
      title: "Data Engineer",
      clientName: "Northwind",
      contractType: "contract",
      locationCity: "Vancouver",
      locationRegion: "BC",
      locationCountry: "CA",
      salaryMin: "100000",
      salaryMax: "130000",
      salaryCurrency: "CAD",
      minYearsExperience: "4",
    });
    expect(draft.requiredSkills?.split(", ")).toEqual(expect.arrayContaining(["python", "spark", "airflow"]));
  });

  it("returns null without JSON-LD and strips scripts from text", () => {
    expect(readJobPosting("<p>hi</p>")).toBeNull();
    expect(htmlToText("<script>alert(1)</script><p>A &amp; B</p>").trim()).toBe("A & B");
  });
});

describe("ATS page text", () => {
  it("drops navigation lines and reads 'About X:' as the company", () => {
    const text = htmlToText("<a>Back to jobs</a><h1>Account Executive</h1><div>Remote - Germany</div><a>Apply</a><h2>About Vercel:</h2><p>We sell to developers.</p>");
    expect(text).not.toMatch(/Back to jobs|^Apply$/m);
    const { draft } = extractJobFromText(text);
    expect(draft.title).toBe("Account Executive");
    expect(draft.clientName).toBe("Vercel");
    expect(draft.locationCountry).toBe("DE");
    expect(draft.workArrangement).toBe("remote");
  });
});
