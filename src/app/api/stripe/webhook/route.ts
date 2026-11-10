import { env, integrations } from "@/server/env";
import { minimizeEvent, verifyWebhookSignature } from "@/server/integrations/stripe";
import { createAdminClient } from "@/server/supabase/admin";

/**
 * Stripe webhook inbox. Does three things only: authenticate the sender (signature over the raw
 * body), store a minimized copy of the event exactly once, and queue it. All money movement
 * happens later in the worker (src/server/queue/handlers/payments.ts), which can retry safely.
 */
export async function POST(request: Request) {
  if (!integrations.payments) return new Response("payments not configured", { status: 503 });
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET!)) {
    return new Response("invalid signature", { status: 400 });
  }
  let event: { id?: unknown; type?: unknown; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
  if (typeof event.id !== "string" || typeof event.type !== "string") return new Response("invalid payload", { status: 400 });

  const { error } = await createAdminClient().rpc("psp_record_event", {
    p_id: event.id,
    p_type: event.type,
    p_payload: minimizeEvent({ id: event.id, type: event.type, data: event.data }),
  });
  if (error) {
    // A 5xx makes Stripe redeliver; the insert is idempotent on the event id.
    console.error(JSON.stringify({ evt: "stripe.webhook.store_failed", id: event.id, message: error.message.slice(0, 200) }));
    return new Response("temporarily unavailable", { status: 500 });
  }
  return Response.json({ received: true });
}
