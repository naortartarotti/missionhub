"use client";

import { useActionState, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { uploadSheet } from "../actions";

/** One-off CSV import for candidates or jobs, with templates and a per-row error report. */
export function UploadForm({ orgSlug, canJobs }: { orgSlug: string; canJobs: boolean }) {
  const t = useT("connectors");
  const [state, action] = useActionState(uploadSheet.bind(null, orgSlug), null);
  const [entity, setEntity] = useState<"candidates" | "jobs">("candidates");
  const [fileName, setFileName] = useState("");
  const result = state?.ok ? state.data : undefined;

  return (
    <ActionForm action={action} className="grid gap-5">
      <input type="hidden" name="entity" value={entity} />
      <div role="radiogroup" aria-label={t("upload.what")} className="inline-flex w-fit rounded-xl border border-border p-1 text-sm">
        {(["candidates", "jobs"] as const).filter((e) => e === "candidates" || canJobs).map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={entity === e}
            onClick={() => setEntity(e)}
            className={cn("rounded-lg px-3 py-1.5 font-medium transition-colors", entity === e ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t(`entity.${e}`)}
          </button>
        ))}
      </div>

      <label
        htmlFor="upload-file"
        className="grid cursor-pointer place-items-center gap-2 rounded-3xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-foreground/40 focus-within:border-ring"
      >
        <FileUp className="size-7 text-muted-foreground" aria-hidden />
        <span className="font-medium">{fileName || t("upload.drop")}</span>
        <span className="text-sm text-muted-foreground">{t("upload.dropHint")}</span>
        <input id="upload-file" name="file" type="file" accept=".csv,text/csv" required className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
      </label>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {t("upload.columnsHint")}
        <a href={`/templates/${entity}.csv`} download className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
          <Download className="size-3.5" aria-hidden /> {t("upload.template")}
        </a>
      </p>

      <FormMessage state={state} />
      {result ? (
        <div className="grid gap-2 rounded-2xl border border-border p-4 text-sm" aria-live="polite">
          <p>{t("upload.result", { created: result.created, updated: result.updated, unchanged: result.unchanged, failed: result.failed })}</p>
          {result.rejected.length ? (
            <ul className="grid max-h-48 gap-1 overflow-auto text-xs text-danger">
              {result.rejected.map((r, i) => <li key={i}>{t("upload.rowError", { line: r.line, field: r.field, message: r.message })}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      <SubmitButton className="justify-self-start" pendingLabel={t("upload.importing")}>{t("upload.import")}</SubmitButton>
    </ActionForm>
  );
}
