"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shared/card";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { CSV_COLUMNS } from "../csv";
import { commitImport, previewImport } from "../import-actions";
import { useT } from "@/i18n/client";

const STEPS = ["upload", "review", "confirm"] as const;

export function ImportWizard({ orgSlug }: { orgSlug: string }) {
  const [preview, previewAction] = useActionState(previewImport.bind(null, orgSlug), null);
  const [commit, commitAction] = useActionState(commitImport.bind(null, orgSlug), null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const data = preview?.ok ? preview.data : undefined;
  const t = useT("candidates");
  // Split the hint around its {example}/{required} slots so they can render as <code>.
  const columnsHint = t("import.columnsHint", { columns: CSV_COLUMNS.join(", ") })
    .split(/(\{example\}|\{required\})/)
    .map((part, i) =>
      part === "{example}" ? <code key={i}>TypeScript;React</code> : part === "{required}" ? <code key={i}>full_name</code> : part,
    );

  if (commit?.ok) {
    return (
      <Panel className="grid gap-4 p-6">
        <FormMessage state={commit} />
        <div className="flex gap-2">
          <Button asChild><Link href={`/workspace/${orgSlug}/candidates?status=draft`}>{t("import.reviewDrafts")}</Link></Button>
          <Button variant="outline" onClick={() => window.location.reload()}>{t("import.another")}</Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6">
      <Panel className="grid gap-4 p-6">
        <ol className="flex flex-wrap gap-2 text-sm" aria-label={t("import.stepsLabel")}>
          {STEPS.map((s, i) => {
            const step = commit ? 2 : data ? 1 : 0;
            return (
              <li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-full px-3 py-1 ${i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                {i + 1}. {t(`import.steps.${s}`)}
              </li>
            );
          })}
        </ol>
        <ActionForm action={previewAction} className="grid gap-3">
          <label htmlFor="file" className="text-sm font-medium">{t("import.fileLabel")}</label>
          <Input ref={fileRef} id="file" name="file" type="file" accept=".csv,text/csv" required onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          <p className="text-xs text-muted-foreground">
            {columnsHint}
          </p>
          {preview && !preview.ok ? <FormMessage state={preview} /> : null}
          <SubmitButton variant="secondary" className="justify-self-start" pendingLabel={t("import.validating")}>{t("import.preview")}</SubmitButton>
        </ActionForm>
      </Panel>

      {data ? (
        <Panel className="grid gap-4 p-6">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-success"><CheckCircle2 className="size-4" aria-hidden /> {t("import.ready", { count: data.valid })}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-danger"><CircleAlert className="size-4" aria-hidden /> {t("import.needAttention", { count: data.invalid })}</span>
            {data.duplicates ? <span className="rounded-full bg-warning-soft px-3 py-1 text-warning">{t("import.duplicates", { count: data.duplicates })}</span> : null}
          </div>
          <div className="max-h-[420px] overflow-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">{t("import.caption")}</caption>
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">{t("import.columns.line")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("import.columns.name")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("import.columns.headline")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("import.columns.result")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.line} className="border-b border-border/60 last:border-0 align-top">
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.line}</td>
                    <td className="px-4 py-2">{r.values.full_name || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.values.headline || "—"}</td>
                    <td className="px-4 py-2">
                      {r.errors.length ? (
                        <ul className="grid gap-0.5 text-danger">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                      ) : (
                        <span className="text-success">{t("import.rowReady")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionForm
            action={(fd) => {
              const f = fileRef.current?.files?.[0];
              if (f) fd.set("file", f);
              return commitAction(fd);
            }}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <input type="hidden" name="checksum" value={data.checksum} />
            <p className="text-sm text-muted-foreground">
              {fileName ? t("import.fileNamePrefix", { name: fileName }) : ""}
              {t("import.skipNote")}
            </p>
            {commit && !commit.ok ? <FormMessage state={commit} /> : null}
            <SubmitButton disabled={data.valid === 0} pendingLabel={t("import.importing")}>{t("import.submit", { count: data.valid })}</SubmitButton>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
