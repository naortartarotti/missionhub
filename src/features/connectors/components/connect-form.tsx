"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlugZap, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { SYNC_INTERVALS, type ConnectorDef } from "../catalog";
import { createConnection, testConnector, type ConnectorPreview } from "../actions";

type Values = Record<string, string>;

/** "https://boards.greenhouse.io/acme/jobs/1" → "acme": a pasted link becomes the name it contains. */
function boardName(raw: string) {
  const s = raw.trim().replace(/^https?:\/\//i, "").replace(/[?#].*$/, "");
  return s.includes("/") ? (s.split("/").filter(Boolean)[1] ?? "") : s;
}

/**
 * Connect in three moves: fill in what the source is called → "Test" shows what will come in →
 * "Connect" saves it and starts the first import. Editing a field after a test asks for a new test.
 */
export function ConnectForm({ orgSlug, def }: { orgSlug: string; def: ConnectorDef }) {
  const t = useT("connectors");
  const router = useRouter();
  const initial: Values = Object.fromEntries(def.fields.map((f) => [f.key, f.options?.[0] ?? ""]));
  const [values, setValues] = useState<Values>({ ...initial, jobStatus: "draft", interval: "60" });
  const [preview, setPreview] = useState<ConnectorPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const importsJobs = def.entities.includes("jobs") && (values.entity ?? "jobs") === "jobs";

  const set = (k: string, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setPreview(null);
    setError(null);
  };
  const prefixed = new Set(def.fields.filter((f) => f.prefix).map((f) => f.key as string));
  const config = () =>
    Object.fromEntries(
      Object.entries(values)
        .filter(([k]) => k !== "interval" && (k !== "jobStatus" || importsJobs))
        .map(([k, v]) => [k, prefixed.has(k) ? boardName(v) : v]),
    );

  const test = () =>
    startTest(async () => {
      setError(null);
      const r = await testConnector(orgSlug, def.id, config());
      if (r.ok && r.data) setPreview(r.data);
      else if (!r.ok) setError(r.error);
    });

  const connect = () =>
    startSave(async () => {
      const r = await createConnection(orgSlug, def.id, { ...config(), interval: values.interval });
      if (r.ok) {
        toast.success(r.message ?? t("messages.connected"));
        setValues({ ...initial, jobStatus: "draft", interval: "60" });
        setPreview(null);
        router.refresh();
      } else setError(r.error);
    });

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (preview) connect();
        else test();
      }}
    >
      {def.fields.map((f) => {
        const label = t(`providers.${def.id}.fields.${f.key}.label` as never);
        const hint = t(`providers.${def.id}.fields.${f.key}.hint` as never);
        return (
          <FormField key={f.key} id={`cf-${f.key}`} label={label} hint={hint} required={f.required}>
            {f.kind === "select" ? (
              <NativeSelect id={`cf-${f.key}`} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                {f.options!.map((o) => (
                  <option key={o} value={o}>{t(`options.${f.key}.${o}` as never)}</option>
                ))}
              </NativeSelect>
            ) : f.prefix ? (
              <div className="flex h-10 items-center overflow-hidden rounded-xl border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="shrink-0 border-r border-input bg-muted px-3 text-sm leading-10 text-muted-foreground">{f.prefix}</span>
                <input
                  id={`cf-${f.key}`}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  onBlur={(e) => set(f.key, boardName(e.target.value))}
                  placeholder={t(`providers.${def.id}.fields.${f.key}.placeholder` as never)}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                />
              </div>
            ) : (
              <Input
                id={`cf-${f.key}`}
                type={f.kind === "url" ? "url" : "text"}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={t(`providers.${def.id}.fields.${f.key}.placeholder` as never)}
                autoComplete="off"
              />
            )}
          </FormField>
        );
      })}

      {importsJobs ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("connect.jobStatus")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["draft", "active"] as const).map((s) => (
              <label
                key={s}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-2xl border p-3 text-sm transition-colors",
                  values.jobStatus === s ? "border-foreground bg-muted/50" : "border-border hover:border-foreground/40",
                )}
              >
                <input type="radio" name="jobStatus" value={s} checked={values.jobStatus === s} onChange={() => set("jobStatus", s)} className="mt-0.5 accent-foreground" />
                <span>
                  <span className="block font-medium">{t(`connect.jobStatusOption.${s}`)}</span>
                  <span className="block text-muted-foreground">{t(`connect.jobStatusHint.${s}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <FormField id="cf-interval" label={t("connect.interval")}>
        <NativeSelect id="cf-interval" value={values.interval} onChange={(e) => setValues((s) => ({ ...s, interval: e.target.value }))}>
          {SYNC_INTERVALS.map((m) => <option key={m} value={m}>{t(`interval.${m}`)}</option>)}
        </NativeSelect>
      </FormField>

      {error ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}

      {preview ? (
        <div className="grid gap-3 rounded-2xl border border-success/40 bg-success-soft/40 p-4" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {preview.jobs ? t("connect.foundJobs", { count: preview.jobs }) : t("connect.foundCandidates", { count: preview.candidates })}
            {preview.rejected ? <span className="font-normal text-muted-foreground">· {t("connect.rejected", { count: preview.rejected })}</span> : null}
          </p>
          <ul className="grid gap-2">
            {preview.sample.map((s, i) => (
              <li key={i} className="rounded-xl bg-card p-3 text-sm">
                <p className="font-medium">{s.title}</p>
                {s.subtitle ? <p className="text-muted-foreground">{s.subtitle}</p> : null}
                {s.tags.length ? (
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {s.tags.map((tag) => <span key={tag} className="rounded-full bg-info-soft px-2 py-0.5 text-xs text-info">{tag}</span>)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("connect.previewHint")}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={preview ? "outline" : "default"} onClick={test} disabled={testing || saving}>
          {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
          {testing ? t("connect.testing") : t("connect.test")}
        </Button>
        <Button type="button" onClick={connect} disabled={!preview || saving || testing}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PlugZap className="size-4" aria-hidden />}
          {saving ? t("connect.connecting") : t("connect.connect")}
        </Button>
      </div>
    </form>
  );
}
