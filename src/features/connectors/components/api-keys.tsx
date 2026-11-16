"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/shared/action-form";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useT } from "@/i18n/client";
import { createApiKey, revokeApiKey } from "../actions";

export function CreateApiKeyForm({ orgSlug }: { orgSlug: string }) {
  const t = useT("connectors");
  const [state, action] = useActionState(createApiKey.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const key = state?.ok ? state.data?.key : undefined;
  return (
    <ActionForm action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <FormField id="key-name" label={t("api.keyName")} hint={t("api.keyNameHint")} error={fe?.name}>
          <Input id="key-name" name="name" required maxLength={80} placeholder={t("api.keyNamePlaceholder")} />
        </FormField>
        <SubmitButton className="sm:mt-[26px]" pendingLabel={t("api.creating")}>
          <KeyRound className="size-4" aria-hidden /> {t("api.create")}
        </SubmitButton>
      </div>
      {!key ? <FormMessage state={state} /> : null}
      {key ? (
        <div className="grid gap-2 rounded-2xl border border-warning/50 bg-warning-soft/50 p-4">
          <p className="text-sm font-medium">{t("api.copyNow")}</p>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 pl-3">
            <code className="flex-1 truncate text-xs">{key}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(key).then(() => toast.success(t("api.copied")))}>
              <Copy className="size-3.5" aria-hidden /> {t("api.copy")}
            </Button>
          </div>
        </div>
      ) : null}
    </ActionForm>
  );
}

export function RevokeKeyButton({ orgSlug, keyId, name }: { orgSlug: string; keyId: string; name: string }) {
  const t = useT("connectors");
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="sm">{t("api.revoke")}</Button>}
      title={t("api.revokeTitle", { name })}
      description={t("api.revokeDescription")}
      confirmLabel={t("api.revoke")}
      destructive
      onConfirm={() => revokeApiKey(orgSlug, keyId)}
    />
  );
}

export function CopyBlock({ code, label }: { code: string; label: string }) {
  const t = useT("connectors");
  return (
    <div className="relative">
      <pre aria-label={label} className="overflow-x-auto rounded-2xl bg-muted p-4 pr-20 text-xs leading-relaxed"><code>{code}</code></pre>
      <Button type="button" variant="outline" size="sm" className="absolute top-2 right-2" onClick={() => navigator.clipboard.writeText(code).then(() => toast.success(t("api.copied")))}>
        <Copy className="size-3.5" aria-hidden /> {t("api.copy")}
      </Button>
    </div>
  );
}
