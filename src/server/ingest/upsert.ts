import "server-only";
import { createHash } from "node:crypto";
import type { AdminClient } from "@/server/supabase/admin";
import { parseMajorToMinor } from "@/lib/money/format";
import { normalizeSkills } from "@/features/matching/domain/skills";
import type { CandidateRecord, JobRecord } from "./schema";

/**
 * Writes external records into an organization, idempotently. Runs with the service-role client,
 * so every query here is scoped to `scope.organizationId` explicitly.
 *
 * Matching an incoming record to an existing one:
 *   1. the external reference this same source created before → the source owns it: overwrite;
 *   2. otherwise (candidates only) the same email, then the same LinkedIn URL → a record the team
 *      already has: link it and only fill fields that are still empty (never overwrite their work);
 *   3. otherwise create it as a draft. Imported candidates have no privacy notice on file, so they
 *      can't be activated for matching or shared until a recruiter confirms it.
 */

export type IngestScope = {
  organizationId: string;
  /** Default owner for new records (the API key's creator or the connection's owner). */
  ownerId: string;
  /** 'api' or 'connection:<id>': the namespace external ids live in. */
  source: string;
  connectionId?: string | null;
  origin: "api" | "integration" | "csv_import";
  /** Shown on the record ("Greenhouse · acme"). */
  sourceDetail: string;
  defaultCurrency: string;
  /** Status for jobs that don't say: imported jobs stay private drafts unless the connection says otherwise. */
  defaultJobStatus?: "draft" | "active";
};

export type IngestAction = "created" | "updated" | "linked" | "unchanged" | "failed";
export type IngestResult = { externalId: string | null; id: string | null; action: IngestAction; error?: string };

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const minor = (n: number | null | undefined, cur: string) => (n == null ? null : parseMajorToMinor(String(n), cur));

/** Active members' emails → user ids, so `ownerEmail` can assign a record to a teammate. */
async function memberDirectory(db: AdminClient, orgId: string) {
  const { data } = await db
    .from("organization_memberships")
    .select("user_id, profile:profiles!memberships_user_profile_fk(email)")
    .eq("organization_id", orgId)
    .eq("status", "active");
  return new Map((data ?? []).flatMap((m) => (m.profile?.email ? [[m.profile.email.toLowerCase(), m.user_id] as const] : [])));
}

async function findRef(db: AdminClient, scope: IngestScope, type: "candidate" | "job", externalId: string) {
  const { data } = await db
    .from("external_refs")
    .select("id, entity_id, content_hash")
    .eq("organization_id", scope.organizationId)
    .eq("source", scope.source)
    .eq("entity_type", type)
    .eq("external_id", externalId)
    .maybeSingle();
  return data;
}

async function saveRef(db: AdminClient, scope: IngestScope, type: "candidate" | "job", externalId: string, entityId: string, contentHash: string) {
  const { error } = await db.from("external_refs").upsert(
    {
      organization_id: scope.organizationId,
      source: scope.source,
      connection_id: scope.connectionId ?? null,
      entity_type: type,
      external_id: externalId,
      entity_id: entityId,
      content_hash: contentHash,
      seen_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,source,entity_type,external_id" },
  );
  if (error) throw error;
}

async function touchRef(db: AdminClient, refId: string) {
  await db.from("external_refs").update({ seen_at: new Date().toISOString() }).eq("id", refId);
}

/** Drops keys whose value is null or an empty array, so an update never blanks a field. */
type Present<T> = { [K in keyof T]?: NonNullable<T[K]> };
function present<T extends Record<string, unknown>>(row: T): Present<T> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))) as Present<T>;
}

// ---------------------------------------------------------------------------------------------
// Candidates

function candidateRow(c: CandidateRecord, scope: IngestScope) {
  const cur = c.salary.currency ?? scope.defaultCurrency;
  return {
    full_name: c.fullName,
    email: c.email,
    phone: c.phone,
    headline: c.headline,
    summary: c.summary,
    linkedin_url: c.linkedinUrl,
    skills: normalizeSkills(c.skills).slice(0, 80),
    languages: normalizeSkills(c.languages).slice(0, 20),
    seniority: c.seniority,
    years_experience: c.yearsExperience,
    location_city: c.location.city ?? null,
    location_region: c.location.region ?? null,
    location_country: c.location.country ?? null,
    work_arrangements: c.workArrangements,
    salary_expectation_min: minor(c.salary.min, cur),
    salary_expectation_max: minor(c.salary.max, cur),
    salary_currency: c.salary.min != null || c.salary.max != null ? cur : null,
    notes: c.notes,
  };
}

export async function upsertCandidates(db: AdminClient, scope: IngestScope, items: CandidateRecord[]): Promise<IngestResult[]> {
  const members = await memberDirectory(db, scope.organizationId);
  const results: IngestResult[] = [];
  for (const c of items) {
    const externalId = c.externalId ?? null;
    try {
      const owner = (c.ownerEmail && members.get(c.ownerEmail)) || scope.ownerId;
      const row = candidateRow(c, scope);
      const contentHash = hash(row);

      const ref = externalId ? await findRef(db, scope, "candidate", externalId) : null;
      if (ref) {
        const { data: live } = await db.from("candidates").select("id, status").eq("id", ref.entity_id).eq("organization_id", scope.organizationId).maybeSingle();
        if (live && live.status !== "deleted") {
          if (ref.content_hash === contentHash) {
            await touchRef(db, ref.id);
            results.push({ externalId, id: live.id, action: "unchanged" });
            continue;
          }
          const { error } = await db.from("candidates").update(present(row)).eq("id", live.id).eq("organization_id", scope.organizationId);
          if (error) throw error;
          await saveRef(db, scope, "candidate", externalId!, live.id, contentHash);
          results.push({ externalId, id: live.id, action: "updated" });
          continue;
        }
      }

      // Same person already in the team's pool (entered by hand, CSV, another source)?
      let match: { id: string } | null = null;
      if (c.email) {
        const { data } = await db.from("candidates").select("id").eq("organization_id", scope.organizationId).eq("email", c.email).neq("status", "deleted").limit(1).maybeSingle();
        match = data;
      }
      if (!match && c.linkedinUrl) {
        const { data } = await db.from("candidates").select("id").eq("organization_id", scope.organizationId).eq("linkedin_url", c.linkedinUrl).neq("status", "deleted").limit(1).maybeSingle();
        match = data;
      }
      if (match) {
        const { data: current } = await db.from("candidates").select("*").eq("id", match.id).single();
        const fill: Present<typeof row> = Object.fromEntries(
          Object.entries(present(row)).filter(([k]) => {
            const v = (current as Record<string, unknown> | null)?.[k];
            return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
          }),
        );
        if (Object.keys(fill).length) {
          const { error } = await db.from("candidates").update(fill).eq("id", match.id).eq("organization_id", scope.organizationId);
          if (error) throw error;
        }
        if (externalId) await saveRef(db, scope, "candidate", externalId, match.id, contentHash);
        results.push({ externalId, id: match.id, action: "linked" });
        continue;
      }

      const { data, error } = await db
        .from("candidates")
        .insert({
          ...row,
          salary_currency: row.salary_currency ?? scope.defaultCurrency,
          organization_id: scope.organizationId,
          owner_id: owner,
          created_by: owner,
          status: "draft",
          source: scope.origin,
          source_detail: scope.sourceDetail.slice(0, 200),
        })
        .select("id")
        .single();
      if (error) throw error;
      if (externalId) await saveRef(db, scope, "candidate", externalId, data.id, contentHash);
      results.push({ externalId, id: data.id, action: "created" });
    } catch (e) {
      results.push({ externalId, id: null, action: "failed", error: safeError(e) });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Jobs

function jobRow(j: JobRecord, scope: IngestScope) {
  const cur = j.salary.currency ?? scope.defaultCurrency;
  const description = j.url && !j.description.includes(j.url) ? `${j.description}\n\n${j.url}`.trim() : j.description;
  return {
    title: j.title,
    client_name: j.clientName,
    description: description.slice(0, 20000),
    required_skills: normalizeSkills(j.requiredSkills).slice(0, 40),
    preferred_skills: normalizeSkills(j.preferredSkills).slice(0, 40),
    seniority: j.seniority,
    min_years_experience: j.minYearsExperience,
    work_arrangement: j.workArrangement,
    contract_type: j.contractType,
    location_city: j.location.city ?? null,
    location_region: j.location.region ?? null,
    location_country: j.location.country ?? null,
    languages: normalizeSkills(j.languages).slice(0, 20),
    salary_min: minor(j.salary.min, cur),
    salary_max: minor(j.salary.max, cur),
    salary_currency: j.salary.min != null || j.salary.max != null ? cur : null,
  };
}

export async function upsertJobs(db: AdminClient, scope: IngestScope, items: JobRecord[]): Promise<IngestResult[]> {
  const members = await memberDirectory(db, scope.organizationId);
  const results: IngestResult[] = [];
  for (const j of items) {
    const externalId = j.externalId ?? null;
    try {
      const owner = (j.ownerEmail && members.get(j.ownerEmail)) || scope.ownerId;
      const row = jobRow(j, scope);
      const contentHash = hash({ row, status: j.status ?? null });

      const ref = externalId ? await findRef(db, scope, "job", externalId) : null;
      if (ref) {
        const { data: live } = await db.from("jobs").select("id, status").eq("id", ref.entity_id).eq("organization_id", scope.organizationId).maybeSingle();
        if (live) {
          // A job the source had closed and now lists again comes back as it was configured.
          const reopen = live.status === "paused" && !j.status;
          if (ref.content_hash === contentHash && !reopen) {
            await touchRef(db, ref.id);
            results.push({ externalId, id: live.id, action: "unchanged" });
            continue;
          }
          const patch = { ...present(row), ...(j.status ? { status: j.status } : reopen ? { status: scope.defaultJobStatus ?? "draft" } : {}) };
          const { error } = await db.from("jobs").update(patch).eq("id", live.id).eq("organization_id", scope.organizationId);
          if (error) throw error;
          await saveRef(db, scope, "job", externalId!, live.id, contentHash);
          results.push({ externalId, id: live.id, action: "updated" });
          continue;
        }
      }

      const { data, error } = await db
        .from("jobs")
        .insert({
          ...present(row),
          title: row.title,
          description: row.description,
          client_confidential: true,
          salary_currency: row.salary_currency ?? scope.defaultCurrency,
          fee_currency: scope.defaultCurrency,
          status: j.status ?? scope.defaultJobStatus ?? "draft",
          organization_id: scope.organizationId,
          owner_id: owner,
          created_by: owner,
          source: scope.origin,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (externalId) await saveRef(db, scope, "job", externalId, data.id, contentHash);
      results.push({ externalId, id: data.id, action: "created" });
    } catch (e) {
      results.push({ externalId, id: null, action: "failed", error: safeError(e) });
    }
  }
  return results;
}

/**
 * After a full sync: jobs this connection imported that the source no longer lists are paused
 * (not closed, so pending referrals are untouched and the job returns if it is listed again).
 */
export async function pauseMissingJobs(db: AdminClient, scope: IngestScope, syncStartedAt: string): Promise<number> {
  const { data: stale } = await db
    .from("external_refs")
    .select("entity_id")
    .eq("organization_id", scope.organizationId)
    .eq("source", scope.source)
    .eq("entity_type", "job")
    .lt("seen_at", syncStartedAt);
  const ids = (stale ?? []).map((r) => r.entity_id);
  if (!ids.length) return 0;
  const { data, error } = await db
    .from("jobs")
    .update({ status: "paused" })
    .eq("organization_id", scope.organizationId)
    .in("id", ids)
    .eq("status", "active")
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Database messages can echo values; only a short code-like summary leaves this module. */
function safeError(e: unknown): string {
  const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return m.replace(/\(.*?\)/g, "").slice(0, 160);
}

export function summarize(results: IngestResult[]) {
  const count = (a: IngestAction) => results.filter((r) => r.action === a).length;
  return { created: count("created"), updated: count("updated") + count("linked"), unchanged: count("unchanged"), failed: count("failed") };
}
