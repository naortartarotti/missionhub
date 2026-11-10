"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/shared/action-form";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { useT } from "@/i18n/client";
import { payPlacementCommission, requestCashout, startPayoutSetup } from "../actions";

/** Runs an action that answers with a provider URL, then leaves for it. Stays busy while the browser navigates. */
function RedirectButton({ run, label, variant = "default" }: { run: () => Promise<ActionResult<{ url: string }>>; label: string; variant?: "default" | "secondary" | "outline" }) {
  const t = useT("wallet");
  const [pending, start] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const busy = pending || leaving;
  return (
    <Button
      type="button"
      variant={variant}
      disabled={busy}
      aria-busy={busy}
      onClick={() =>
        start(async () => {
          const res = await run();
          if (res.ok && res.data?.url) {
            setLeaving(true);
            window.location.assign(res.data.url);
          } else if (!res.ok) toast.error(res.error);
        })
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {busy ? t("payouts.redirecting") : label}
    </Button>
  );
}

export function PayCommissionButton({ orgSlug, placementId, label }: { orgSlug: string; placementId: string; label: string }) {
  return <RedirectButton label={label} run={() => payPlacementCommission(orgSlug, { placementId })} />;
}

export function PayoutSetupButton({ orgSlug, label }: { orgSlug: string; label: string }) {
  return <RedirectButton label={label} variant="secondary" run={() => startPayoutSetup(orgSlug)} />;
}

export function CashoutForm({ orgSlug, currency, availableLabel }: { orgSlug: string; currency: string; availableLabel: string }) {
  const t = useT("wallet");
  // One key per intended withdrawal: a retry of the same submit is deduplicated, the next withdrawal gets a new key.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [state, action] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await requestCashout(orgSlug, prev, formData);
    if (result.ok) {
      setKey(crypto.randomUUID());
      setAmount("");
    }
    return result;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm action={action} className="grid max-w-sm gap-3">
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <FormField id="cashout-amount" label={t("payouts.amount", { currency })} hint={availableLabel} error={fe?.amount}>
        <Input id="cashout-amount" name="amount" inputMode="decimal" autoComplete="off" required value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!fe?.amount} />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={t("payouts.submitting")} className="justify-self-start">{t("payouts.submit")}</SubmitButton>
    </ActionForm>
  );
}
