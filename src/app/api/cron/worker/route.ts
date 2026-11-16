import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { runMaintenance, runOnce, scheduleConnectorSyncs } from "@/server/queue/worker";

/**
 * Hosted queue drain. The long-lived `npm run worker` doesn't fit serverless, so on the hosted
 * project Supabase pg_cron POSTs here every minute (see docs/ops/README.md → "Hosted worker").
 * Each call schedules due connector syncs, drains the queue within a time budget, and runs the
 * maintenance pass every 10th minute (or with ?maintenance=1).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. With CRON_SECRET unset the route answers 404.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BUDGET_MS = 240_000;

function authorized(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return given.length > 0 && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!authorized(req, secret)) return new NextResponse(null, { status: 401 });

  const started = Date.now();
  const result: Record<string, unknown> = {};
  try {
    result.syncsQueued = await scheduleConnectorSyncs();

    const wantMaintenance =
      req.nextUrl.searchParams.get("maintenance") === "1" || new Date().getUTCMinutes() % 10 === 0;
    if (wantMaintenance) result.maintenance = await runMaintenance();

    let processed = 0;
    while (Date.now() - started < BUDGET_MS) {
      const n = await runOnce(25);
      processed += n;
      if (n === 0) break;
    }
    result.processed = processed;
    result.ms = Date.now() - started;
    console.info(JSON.stringify({ evt: "cron.worker.ok", ...result }));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ evt: "cron.worker.error", error: message.slice(0, 200) }));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
