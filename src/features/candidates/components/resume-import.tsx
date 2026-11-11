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
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/actions/result";
import { importResume, type ResumeImportResult } from "../resume-actions";
import { CandidateForm, type CandidateDefaults } from "./candidate-form";

type Mode = "file" | "url" | "text";
const MODES: { mode: Mode; icon: typeof Type }[] = [
  { mode: "file", icon: FileText },
  { mode: "url", icon: Link2 },
  { mode: "text", icon: Type },
];
const MAX_BYTES = 10 * 1024 * 1024;
const formatSize = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** New-candidate page: optional resume import that seeds the candidate form below. */
export function NewCandidateFlow({
  orgSlug,
  ai,
  action,
  cancelHref,
  submitLabel,
  defaults,
}: {
  orgSlug: string;
  ai: boolean;
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  cancelHref: string;
  submitLabel: string;
  defaults: CandidateDefaults;
}) {
  const [imported, setImported] = useState<{
    result: ResumeImportResult;
    version: number;
  } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="lg:sticky lg:top-6 lg:order-last">
        <ResumeImport
          orgSlug={orgSlug}
          ai={ai}
          result={imported?.result ?? null}
          onReset={() => setImported(null)}
          onImported={(result) => {
            setImported((prev) => ({
              result,
              version: (prev?.version ?? 0) + 1,
            }));
            // Side-by-side on desktop: the form is already in view. Stacked on mobile: bring it up.
            if (!window.matchMedia("(min-width: 1024px)").matches)
              requestAnimationFrame(() =>
                formRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                }),
              );
          }}
        />
      </div>
      <div ref={formRef} className="scroll-mt-6">
        <CandidateForm
          key={imported?.version ?? 0}
          action={action}
          cancelHref={cancelHref}
          submitLabel={submitLabel}
          defaults={{ ...defaults, ...(imported?.result.draft ?? {}) }}
        />
      </div>
    </div>
  );
}

function ResumeImport({
  orgSlug,
  ai,
  result,
  onImported,
  onReset,
}: {
  orgSlug: string;
  ai: boolean;
  result: ResumeImportResult | null;
  onImported: (r: ResumeImportResult) => void;
  onReset: () => void;
}) {
  const t = useT("candidates");
  const [mode, setMode] = useState<Mode>("file");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
      return setError(t("resume.errors.fileType"));
    if (f.size > MAX_BYTES) return setError(t("resume.errors.fileSize"));
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
      const r = await importResume(orgSlug, fd);
      if (!r.ok) return setError(r.error);
      if (r.data) onImported(r.data);
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  if (result) {
    return (
      <Panel className="flex flex-wrap items-center gap-4 border-success/30 bg-success-soft/50 p-5 lg:flex-col lg:items-start">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-white dark:text-black">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1" role="status">
          <p className="font-semibold">
            {t("resume.done", { count: result.filled.length })}
          </p>
          <p className="text-sm text-muted-foreground">
            {result.ai ? t("resume.doneAi") : t("resume.doneBasic")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden /> {t("resume.again")}
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
          <h2 className="text-base font-semibold">{t("resume.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {ai ? t("resume.subtitleAi") : t("resume.subtitle")}
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("resume.title")}
        className="relative inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1"
      >
        {MODES.map(({ mode: m, icon: Icon }) => {
          return (
            <button
              key={m}
              type="button"
              role="tab"
              id={`resume-tab-${m}`}
              aria-selected={mode === m}
              aria-controls={`resume-panel-${m}`}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t(`resume.tabs.${m}`)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`resume-panel-${mode}`}
        aria-labelledby={`resume-tab-${mode}`}
        className="relative grid gap-2"
      >
        {mode === "url" ? (
          <>
            <Label htmlFor="resume-url" className="text-sm font-medium">
              {t("resume.urlLabel")}
            </Label>
            <Input
              id="resume-url"
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
              placeholder={t("resume.urlPlaceholder")}
              aria-describedby="resume-url-hint"
              className="bg-background"
            />
            <p id="resume-url-hint" className="text-xs text-muted-foreground">
              {t("resume.urlHint")}
            </p>
          </>
        ) : mode === "text" ? (
          <>
            <Label htmlFor="resume-text" className="sr-only">
              {t("resume.textLabel")}
            </Label>
            <Textarea
              id="resume-text"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("resume.textPlaceholder")}
              className="bg-background"
            />
          </>
        ) : (
          <>
            <label
              htmlFor="resume-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-background px-5 py-8 text-center transition-colors",
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
                  ? t("resume.fileChosen", {
                      name: file.name,
                      size: formatSize(file.size),
                    })
                  : t("resume.fileDrop")}
              </span>
              <span className="text-xs text-muted-foreground">
                {ai ? t("resume.fileHintAi") : t("resume.fileHint")}
              </span>
            </label>
            <input
              id="resume-file"
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
          {pending ? t("resume.working") : t("resume.submit")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t("resume.skip")}
        </span>
      </div>
    </Panel>
  );
}
