import { describe, expect, it } from "vitest";
import { readCandidateSheet, readJobSheet, sheetCsvUrl } from "../sheet";

describe("readCandidateSheet", () => {
  it("reads Portuguese headers, lists and owner", () => {
    const csv = "Nome,E-mail,Cargo,Competências,Senioridade,Cidade,País,Modelo,Responsável\nAna Souza,ANA@Example.com,Designer,figma; ux,Sênior,São Paulo,br,Remoto,rec@agency.com\n";
    const r = readCandidateSheet(csv);
    expect(r.errors).toEqual([]);
    expect(r.records).toHaveLength(1);
    const c = r.records[0];
    expect(c.fullName).toBe("Ana Souza");
    expect(c.email).toBe("ana@example.com");
    expect(c.skills).toEqual(["figma", "ux"]);
    expect(c.seniority).toBe("senior");
    expect(c.location.country).toBe("BR");
    expect(c.workArrangements).toEqual(["remote"]);
    expect(c.ownerEmail).toBe("rec@agency.com");
  });

  it("joins first and last name columns", () => {
    const r = readCandidateSheet("first_name,last_name\nJean,Tremblay\n");
    expect(r.records[0].fullName).toBe("Jean Tremblay");
  });

  it("reports bad rows by line and keeps the good ones", () => {
    const r = readCandidateSheet("name,email\nAna,ana@example.com\nBob,not-an-email\n");
    expect(r.records).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 3, field: "email" });
  });

  it("requires a name column", () => {
    expect(readCandidateSheet("email\na@b.co\n").missingRequired).toBe("fullName");
  });
});

describe("readJobSheet", () => {
  it("maps French and English headers, salary and status", () => {
    const csv = "Titre,Entreprise,Compétences,Mode de travail,Contrat,salary_min,salary_max,currency,status\nDéveloppeur,Acme,go;sql,hybride,CDI,\"60,000\",80000,eur,active\n";
    const r = readJobSheet(csv);
    expect(r.errors).toEqual([]);
    const j = r.records[0];
    expect(j).toMatchObject({ title: "Développeur", clientName: "Acme", workArrangement: "hybrid", contractType: "permanent", status: "active" });
    expect(j.requiredSkills).toEqual(["go", "sql"]);
    expect(j.salary).toMatchObject({ min: 60000, max: 80000, currency: "EUR" });
  });

  it("requires a title column", () => {
    expect(readJobSheet("client\nAcme\n").missingRequired).toBe("title");
  });
});

describe("sheetCsvUrl", () => {
  it("turns a Google Sheets share link into its CSV export, keeping the tab", () => {
    expect(sheetCsvUrl("https://docs.google.com/spreadsheets/d/abc_123/edit#gid=42")).toBe("https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=42");
  });
  it("leaves other links alone", () => {
    expect(sheetCsvUrl("https://example.com/list.csv")).toBe("https://example.com/list.csv");
  });
});
