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

export function ImportWizard({ orgSlug }: { orgSlug: string }) {
  const [preview, previewAction] = useActionState(previewImport.bind(null, orgSlug), null);
  const [commit, commitAction] = useActionState(commitImport.bind(null, orgSlug), null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const data = preview?.ok ? preview.data : undefined;

  if (commit?.ok) {
    return (
      <Panel className="grid gap-4 p-6">
        <FormMessage state={commit} />
        <div className="flex gap-2">
          <Button asChild><Link href={`/w/${orgSlug}/candidates?status=draft`}>Review drafts</Link></Button>
          <Button variant="outline" onClick={() => window.location.reload()}>Import another file</Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6">
      <Panel className="grid gap-4 p-6">
        <ol className="flex flex-wrap gap-2 text-sm" aria-label="Import steps">
          {["Upload", "Review rows", "Confirm"].map((s, i) => {
            const step = commit ? 2 : data ? 1 : 0;
            return (
              <li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-full px-3 py-1 ${i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                {i + 1}. {s}
              </li>
            );
          })}
        </ol>
        <ActionForm action={previewAction} className="grid gap-3">
          <label htmlFor="file" className="text-sm font-medium">CSV file (max 500 rows, 2 MB)</label>
          <Input ref={fileRef} id="file" name="file" type="file" accept=".csv,text/csv" required onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          <p className="text-xs text-muted-foreground">
            Columns: {CSV_COLUMNS.join(", ")}. Use semicolons inside a cell for lists (e.g. <code>TypeScript;React</code>). Only <code>full_name</code> is required.
          </p>
          {preview && !preview.ok ? <FormMessage state={preview} /> : null}
          <SubmitButton variant="secondary" className="justify-self-start" pendingLabel="Validating…">Preview import</SubmitButton>
        </ActionForm>
      </Panel>

      {data ? (
        <Panel className="grid gap-4 p-6">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-success"><CheckCircle2 className="size-4" aria-hidden /> {data.valid} ready</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-danger"><CircleAlert className="size-4" aria-hidden /> {data.invalid} need attention</span>
            {data.duplicates ? <span className="rounded-full bg-warning-soft px-3 py-1 text-warning">{data.duplicates} possible duplicates (skipped)</span> : null}
          </div>
          <div className="max-h-[420px] overflow-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Row validation results</caption>
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Line</th>
                  <th scope="col" className="px-4 py-2 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2 font-medium">Headline</th>
                  <th scope="col" className="px-4 py-2 font-medium">Result</th>
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
                        <span className="text-success">Ready</span>
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
              {fileName ? `${fileName}: ` : ""}Rows with errors are skipped. Fix them in the file and import again. Imported candidates start as drafts.
            </p>
            {commit && !commit.ok ? <FormMessage state={commit} /> : null}
            <SubmitButton disabled={data.valid === 0} pendingLabel="Importing…">Import {data.valid} candidates</SubmitButton>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
