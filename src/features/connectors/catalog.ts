/**
 * The connector catalog: what each connector is, what it brings in and what it asks for.
 * Shared by server and client (no secrets, no fetching). The fetchers live in ./providers.ts.
 * Texts are in the `connectors` i18n namespace under `providers.<id>`.
 */

export type ConnectorCategory = "ats" | "spreadsheet" | "developer";
export type ConnectorEntity = "jobs" | "candidates";

export type ConnectorField = {
  key: "board" | "site" | "region" | "subdomain" | "url" | "entity";
  kind: "text" | "url" | "select";
  required: boolean;
  options?: readonly string[];
  /** Static prefix shown inside the input, so the user only types the part they know. */
  prefix?: string;
};

export type ConnectorDef = {
  id: string;
  name: string;
  category: ConnectorCategory;
  entities: readonly ConnectorEntity[];
  /** sync: recurring import · upload: one-off file · api: keys for the public API. */
  mode: "sync" | "upload" | "api";
  status: "available" | "soon";
  monogram: string;
  /** Tile colour (tailwind classes on design tokens). */
  tone: string;
  fields: readonly ConnectorField[];
};

export const CONNECTORS: readonly ConnectorDef[] = [
  {
    id: "greenhouse",
    name: "Greenhouse",
    category: "ats",
    entities: ["jobs"],
    mode: "sync",
    status: "available",
    monogram: "G",
    tone: "bg-success-soft text-success",
    fields: [{ key: "board", kind: "text", required: true, prefix: "boards.greenhouse.io/" }],
  },
  {
    id: "lever",
    name: "Lever",
    category: "ats",
    entities: ["jobs"],
    mode: "sync",
    status: "available",
    monogram: "L",
    tone: "bg-info-soft text-info",
    fields: [
      { key: "site", kind: "text", required: true, prefix: "jobs.lever.co/" },
      { key: "region", kind: "select", required: true, options: ["global", "eu"] },
    ],
  },
  {
    id: "ashby",
    name: "Ashby",
    category: "ats",
    entities: ["jobs"],
    mode: "sync",
    status: "available",
    monogram: "A",
    tone: "bg-violet-soft text-violet",
    fields: [{ key: "board", kind: "text", required: true, prefix: "jobs.ashbyhq.com/" }],
  },
  {
    id: "workable",
    name: "Workable",
    category: "ats",
    entities: ["jobs"],
    mode: "sync",
    status: "available",
    monogram: "W",
    tone: "bg-warning-soft text-warning",
    fields: [{ key: "subdomain", kind: "text", required: true, prefix: "apply.workable.com/" }],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    category: "spreadsheet",
    entities: ["candidates", "jobs"],
    mode: "sync",
    status: "available",
    monogram: "S",
    tone: "bg-success-soft text-success",
    fields: [
      { key: "url", kind: "url", required: true },
      { key: "entity", kind: "select", required: true, options: ["candidates", "jobs"] },
    ],
  },
  {
    id: "csv_upload",
    name: "CSV",
    category: "spreadsheet",
    entities: ["candidates", "jobs"],
    mode: "upload",
    status: "available",
    monogram: "CSV",
    tone: "bg-tile-yellow text-foreground",
    fields: [{ key: "entity", kind: "select", required: true, options: ["candidates", "jobs"] }],
  },
  {
    id: "missionhub_api",
    name: "MissionHub API",
    category: "developer",
    entities: ["candidates", "jobs"],
    mode: "api",
    status: "available",
    monogram: "{ }",
    tone: "bg-foreground text-background",
    fields: [],
  },
  // Coming next: these need each vendor's partner access or customer credentials.
  ...(
    [
      ["bullhorn", "Bullhorn", "B"],
      ["jobadder", "JobAdder", "J"],
      ["vincere", "Vincere", "V"],
      ["loxo", "Loxo", "L"],
      ["recruitcrm", "Recruit CRM", "R"],
      ["manatal", "Manatal", "M"],
      ["zoho_recruit", "Zoho Recruit", "Z"],
      ["teamtailor", "Teamtailor", "T"],
      ["smartrecruiters", "SmartRecruiters", "S"],
      ["recruitee", "Recruitee", "R"],
    ] as const
  ).map(
    ([id, name, monogram]): ConnectorDef => ({
      id,
      name,
      category: "ats",
      entities: ["candidates", "jobs"],
      mode: "sync",
      status: "soon",
      monogram,
      tone: "bg-muted text-muted-foreground",
      fields: [],
    }),
  ),
];

export const CATEGORIES: readonly ConnectorCategory[] = ["ats", "spreadsheet", "developer"];

export function getConnector(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/** Non-secret settings a connection stores. Values are trimmed strings. */
export type ConnectionConfig = Partial<Record<ConnectorField["key"], string>> & { jobStatus?: "draft" | "active" };

export const SYNC_INTERVALS = [15, 60, 360, 1440] as const;
