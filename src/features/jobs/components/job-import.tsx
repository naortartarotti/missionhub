"use client";

import { useRef, useState, useTransition, type DragEvent } from "react";
import {
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  RotateCcw,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/actions/result";
import { importJobPosting, type JobImportResult } from "../actions";
import { JobForm, type JobDefaults } from "./job-form";

type Mode = "text" | "url" | "file";
const MODES: { mode: Mode; icon: typeof Type }[] = [
  { mode: "text", icon: Type },
  { mode: "url", icon: Link2 },
  { mode: "file", icon: FileText },
];
const MAX_BYTES = 5 * 1024 * 1024;

const formatSize = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** New-job page: optional import (paste / link / file) that seeds the full form below. */
export function NewJobFlow({
  title,
  description,
  orgSlug,
  action,
  cancelHref,
  defaults,
}: {
  title: string;
  description: string;
  orgSlug: string;
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  cancelHref: string;
  defaults: JobDefaults;
}) {
  const [imported, setImported] = useState<{
    result: JobImportResult;
    version: number;
  } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  // The form's Cancel / Save as draft / Publish buttons are portaled into the header slot.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={<div ref={setActionsSlot} className="contents" />}
      />
      <div className="grid gap-5">
        <JobImport
          orgSlug={orgSlug}
          result={imported?.result ?? null}
          onReset={() => setImported(null)}
          onImported={(result) => {
            setImported((prev) => ({
              result,
              version: (prev?.version ?? 0) + 1,
            }));
            requestAnimationFrame(() =>
              formRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              }),
            );
          }}
        />
        <div ref={formRef} className="scroll-mt-6">
          <JobForm
            key={imported?.version ?? 0}
            orgSlug={orgSlug}
            action={action}
            cancelHref={cancelHref}
            isNew
            defaults={{ ...defaults, ...(imported?.result.draft ?? {}) }}
            autoFilled={imported?.result.filled ?? []}
            actionsTarget={actionsSlot}
          />
        </div>
      </div>
    </div>
  );
}

function JobImport({
  orgSlug,
  result,
  onImported,
  onReset,
}: {
  orgSlug: string;
  result: JobImportResult | null;
  onImported: (r: JobImportResult) => void;
  onReset: () => void;
}) {
  const t = useT("jobs");
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const ready =
    mode === "text"
      ? text.trim().length > 0
      : mode === "url"
        ? url.trim().length > 0
        : !!file;

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    if (!/\.(pdf|docx|txt|md)$/i.test(f.name))
      return setError(t("import.errors.fileType"));
    if (f.size > MAX_BYTES) return setError(t("import.errors.fileSize"));
    setFile(f);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("mode", mode);
      if (mode === "text") fd.set("text", text);
      if (mode === "url") fd.set("url", url);
      if (mode === "file" && file) fd.set("file", file);
      const r = await importJobPosting(orgSlug, fd);
      if (!r.ok) return setError(r.error);
      if (r.data) onImported(r.data);
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  if (result) {
    // The description is always filled; count the structured fields the recruiter would otherwise type.
    const count = result.filled.filter((k) => k !== "description").length;
    return (
      <Panel className="flex flex-wrap items-center gap-4 border-success/30 bg-success-soft/50 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-white dark:text-black">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1" role="status">
          <p className="font-semibold">{t("import.done", { count })}</p>
          {result.structured ? (
            <p className="text-sm text-muted-foreground">
              {t("import.doneStructured")}
            </p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden /> {t("import.again")}
        </Button>
      </Panel>
    );
  }

  return (
    <Panel className="relative grid gap-5 overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-tile-yellow/40 blur-3xl"
      />
      <div className="relative flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tile-yellow text-tile-foreground">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold">{t("import.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("import.subtitle")}
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("import.title")}
        className="relative inline-flex w-fit gap-1 rounded-full bg-muted p-1"
      >
        {MODES.map(({ mode: m, icon: Icon }) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`import-tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`import-panel-${m}`}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              mode === m
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(`import.tabs.${m}`)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`import-panel-${mode}`}
        aria-labelledby={`import-tab-${mode}`}
        className="relative grid gap-2"
      >
        {mode === "text" ? (
          <>
            <Label htmlFor="import-text" className="sr-only">
              {t("import.textLabel")}
            </Label>
            <Textarea
              id="import-text"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("import.textPlaceholder")}
              className="bg-background"
            />
          </>
        ) : mode === "url" ? (
          <>
            <Label htmlFor="import-url" className="text-sm font-medium">
              {t("import.urlLabel")}
            </Label>
            <Input
              id="import-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready && !pending) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t("import.urlPlaceholder")}
              aria-describedby="import-url-hint"
              className="bg-background"
            />
            <p id="import-url-hint" className="text-xs text-muted-foreground">
              {t("import.urlHint")}
            </p>
          </>
        ) : (
          <>
            <span className="sr-only">{t("import.fileLabel")}</span>
            <label
              htmlFor="import-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-background px-6 py-10 text-center transition-colors",
                dragging
                  ? "border-info bg-info-soft/50"
                  : "border-border hover:border-foreground/30",
              )}
            >
              {file ? (
                <FileText className="size-7 text-info" aria-hidden />
              ) : (
                <Upload className="size-7 text-muted-foreground" aria-hidden />
              )}
              <span className="text-sm font-medium">
                {file
                  ? t("import.fileChosen", {
                      name: file.name,
                      size: formatSize(file.size),
                    })
                  : t("import.fileDrop")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("import.fileHint")}
              </span>
            </label>
            <input
              ref={fileInput}
              id="import-file"
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </>
        )}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="relative flex flex-wrap items-center gap-3">
        <Button type="button" onClick={submit} disabled={!ready || pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {pending ? t("import.working") : t("import.submit")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t("import.skip")}
        </span>
      </div>
    </Panel>
  );
}
