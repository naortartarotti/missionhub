"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ExternalLink, FileText, MessageSquare, Minus, ShieldOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { SkillChips } from "@/components/shared/skill-chips";
import { Disclosure } from "@/components/shared/disclosure";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { declineReferrals, reviewReferral } from "../actions";
import { DECLINE_REASONS, type DeclineReason } from "../review";
import { GrantDownload } from "./referral-actions";
import { DIRECTION_STYLE, DirectionBadge } from "./direction-badge";

// ---------------------------------------------------------------------------
// View models (built on the server, already translated)

export type RowView = {
  id: string;
  href: string;
  selected: boolean;
  label: string;
  score: number | null;
  partner: string;
  ago: string;
  wait: "ok" | "warn" | "late";
  status: { label: string; tone: Tone } | null;
  facts: string[];
  salary: "fits" | "above" | null;
  coverage: { has: number; total: number } | null;
  docs: number;
  revoked: boolean;
  selectable: boolean;
};

/** A job card in the received queue: header + that job's referrals on this page. */
export type QueueGroup = { id: string; eyebrow: string; title: string; meta: string; jobHref: string; jobLinkLabel: string; rows: RowView[] };

export type ReqCheck = { label: string; value: string; state: "ok" | "warn" | "unknown" };

export type PanelView = {
  id: string;
  version: number;
  label: string;
  headline: string | null;
  score: number | null;
  partner: string;
  ago: string;
  wait: "ok" | "warn" | "late";
  status: { label: string; tone: Tone };
  revoked: boolean;
  identity: string[];
  checks: ReqCheck[];
  skills: { required: string[]; has: string[]; missing: string[]; bonus: string[] } | null;
  gaps: string[];
  summary: string | null;
  experience: { title: string; meta: string }[];
  grants: { id: string; file_name: string; status: string; revoked_at: string | null }[];
  messages: { count: number; last: { who: string; body: string; ago: string } | null };
  agreement: string | null;
  decision: "decide" | "waiting" | "none";
  fullHref: string;
  closeHref: string;
  nextHref: string;
};

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return Boolean(el?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) || e.metaKey || e.ctrlKey || e.altKey;
};

const WAIT_DOT = { ok: "bg-muted-foreground/40", warn: "bg-amber-500", late: "bg-danger" } as const;
const WAIT_TEXT = { ok: "text-muted-foreground", warn: "text-amber-700 dark:text-amber-400", late: "text-danger" } as const;

// ---------------------------------------------------------------------------
// Toolbar

export function QueueJobFilter({ value, options, allLabel, hrefFor }: { value: string; options: { id: string; label: string }[]; allLabel: string; hrefFor: Record<string, string> }) {
  const router = useRouter();
  const t = useT("referrals");
  return (
    <NativeSelect
      aria-label={t("queue.jobFilter")}
      value={value}
      onChange={(e) => router.push(hrefFor[e.target.value] ?? hrefFor[""])}
      className="h-9 min-w-48 rounded-full"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </NativeSelect>
  );
}

// ---------------------------------------------------------------------------
// List

export function QueueList({ groups, orgSlug }: { groups: QueueGroup[]; orgSlug: string }) {
  // One list for keyboard navigation and bulk selection, rendered as one card per job.
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const t = useT("referrals");
  const router = useRouter();
  const [rawPicked, setPicked] = useState<Set<string>>(new Set());
  const [declineOpen, setDeclineOpen] = useState(false);
  const selectable = rows.filter((r) => r.selectable);
  // Only picks still on this page count (others were declined, moved bucket or paged away).
  const picked = new Set(selectable.map((r) => r.id).filter((id) => rawPicked.has(id)));
  const allPicked = selectable.length > 0 && selectable.every((r) => picked.has(r.id));

  const toggle = useCallback((id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);

  // J/K (or arrows) move through the queue; X toggles the open row for bulk actions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || !rows.length) return;
      const i = rows.findIndex((r) => r.selected);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        router.replace(rows[Math.min(i + 1, rows.length - 1)].href, { scroll: false });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        router.replace(rows[Math.max(i - 1, 0)].href, { scroll: false });
      } else if (e.key === "x" && i >= 0 && rows[i].selectable) {
        toggle(rows[i].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, router, toggle]);

  return (
    <div className="grid gap-3">
      {selectable.length ? (
          <div className="flex min-h-12 items-center gap-3 rounded-full border border-border/60 bg-card px-4 py-2">
            <Checkbox
              checked={allPicked ? true : picked.size ? "indeterminate" : false}
              onCheckedChange={() => setPicked(allPicked ? new Set() : new Set(selectable.map((r) => r.id)))}
              aria-label={t("queue.selectAll")}
            />
            {picked.size ? (
              <>
                <span className="text-sm font-medium">{t("queue.selected", { count: picked.size })}</span>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setDeclineOpen(true)}>
                  {t("queue.declineSelected")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>{t("queue.clear")}</Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{t("queue.selectHint")}</span>
            )}
          </div>
        ) : null}
      {groups.map((g) => (
        <section key={g.id} aria-label={g.title} className="overflow-hidden rounded-3xl border border-border/60 bg-card">
          <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-3.5">
            <div className="min-w-0">
              <p className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", DIRECTION_STYLE.inbound.dot)} aria-hidden />
                {g.eyebrow}
              </p>
              <h3 className="truncate text-base font-semibold tracking-tight">{g.title}</h3>
              <p className="text-xs text-muted-foreground">{g.meta}</p>
            </div>
            <Link href={g.jobHref} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              {g.jobLinkLabel} <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </header>
          <ul className="divide-y divide-border/50">
            {g.rows.map((r) => (
              <QueueRow key={r.id} row={r} picked={picked.has(r.id)} onPick={() => toggle(r.id)} />
            ))}
          </ul>
        </section>
      ))}
      <DeclineDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        count={picked.size}
        onConfirm={async (reasonCode, note) => {
          const r = await declineReferrals(orgSlug, { ids: [...picked], reasonCode, note });
          if (!r.ok) return toast.error(r.error), false;
          toast.success(r.message ?? t("queue.done.declined"));
          setPicked(new Set());
          return true;
        }}
      />
    </div>
  );
}

function QueueRow({ row: r, picked, onPick }: { row: RowView; picked: boolean; onPick: () => void }) {
  const t = useT("referrals");
  return (
    <li className={cn("group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50", r.selected && "bg-muted", picked && "bg-info/5")}>
      {r.selectable ? (
        <Checkbox checked={picked} onCheckedChange={onPick} aria-label={t("queue.selectRow", { name: r.label })} className="relative z-10" />
      ) : null}
      {r.score != null ? (
        <ScoreRing score={r.score} className="size-11 [&_span]:text-xs" />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-xs text-muted-foreground" title={t("queue.noScore")}>—</span>
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={r.href}
          scroll={false}
          aria-current={r.selected ? "true" : undefined}
          className="block truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          {r.label}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {r.coverage ? (
            <span className={cn("rounded-full px-2 py-0.5 font-medium", r.coverage.has === r.coverage.total ? "bg-success/10 text-success" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
              {t("queue.coverage", { has: r.coverage.has, total: r.coverage.total })}
            </span>
          ) : null}
          {r.salary ? (
            <span className={cn("rounded-full px-2 py-0.5 font-medium", r.salary === "fits" ? "bg-success/10 text-success" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
              {r.salary === "fits" ? t("queue.salaryFits") : t("queue.salaryAbove")}
            </span>
          ) : null}
          {r.facts.map((f) => (
            <span key={f} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{f}</span>
          ))}
          {r.docs ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><FileText className="size-3" aria-hidden />{r.docs}</span>
          ) : null}
          {r.revoked ? (
            <span className="inline-flex items-center gap-1 text-danger"><ShieldOff className="size-3" aria-hidden />{t("queue.revoked")}</span>
          ) : null}
        </div>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
        {r.status ? <StatusPill tone={r.status.tone} label={r.status.label} className="text-xs" /> : null}
        <span className="max-w-40 truncate text-xs text-muted-foreground">{r.partner}</span>
        {!r.status ? (
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", WAIT_TEXT[r.wait])}>
            <span className={cn("size-1.5 rounded-full", WAIT_DOT[r.wait])} aria-hidden />
            {r.ago}
          </span>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Decision panel

export function ReviewPanel({ view: v, orgSlug }: { view: PanelView; orgSlug: string }) {
  const t = useT("referrals");
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const [closing, setClosing] = useState(false);
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"decline" | "info" | null>(null);

  const close = useCallback(() => {
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => router.replace(v.closeHref, { scroll: false }), reduced ? 0 : 200);
  }, [router, v.closeHref]);

  const decide = useCallback(
    async (to: "accepted" | "declined" | "info_requested", reasonCode?: DeclineReason, note?: string) => {
      const r = await reviewReferral(orgSlug, { referralId: v.id, to, reasonCode, note, version: v.version });
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
      toast.success(r.message ?? t("queue.done.accepted"));
      router.replace(v.nextHref, { scroll: false }); // advance to the next one in the queue
      return true;
    },
    [orgSlug, router, t, v.id, v.nextHref, v.version],
  );

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [v.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dialog) return close();
      if (typing(e) || pending) return;
      if (v.decision === "decide" && e.key === "a") start(async () => void (await decide("accepted")));
      else if (v.decision !== "none" && e.key === "d") setDialog("decline");
      else if (v.decision === "decide" && e.key === "i") setDialog("info");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, decide, dialog, pending, v.decision]);

  return (
    <aside
      ref={ref}
      aria-label={t("queue.panelLabel", { name: v.label })}
      data-state={closing ? "closing" : "open"}
      className="match-panel fixed inset-2 z-40 flex flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-xl lg:static lg:inset-auto lg:z-auto lg:max-h-[calc(100dvh_-_var(--page-header-h,5.5rem)_-_2.5rem)] lg:w-[28.25rem] lg:shadow-sm"
    >
      <div key={v.id} className="match-panel-content min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-4">
        {/* Header */}
        <header className="flex items-start gap-3">
          {v.score != null ? <ScoreRing score={v.score} className="size-14" /> : null}
          <div className="min-w-0 flex-1">
            <DirectionBadge direction="inbound" label={t("direction.inbound.badge")} className="mb-2" />
            <h2 className="text-lg leading-tight font-semibold tracking-tight">{v.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("queue.fromPartner", { partner: v.partner })} ·{" "}
              <span className={cn(v.decision !== "none" && WAIT_TEXT[v.wait])}>{v.ago}</span>
            </p>
          </div>
          <Button variant="outline" size="icon" className="shrink-0" onClick={close} aria-label={t("queue.close")}>
            <X className="size-4" aria-hidden />
          </Button>
        </header>

        {v.revoked ? (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("queue.revokedLong")}
          </p>
        ) : null}

        {v.identity.length ? <p className="mt-4 text-sm">{v.identity.join(" · ")}</p> : null}

        {/* Candidate × job requirements: the decision block */}
        <section className="mt-5 grid gap-4">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("queue.vsJob")}</h3>
          {v.skills ? (
            <div className="grid gap-2">
              <SkillChips skills={v.skills.required} has={new Set(v.skills.has)} missing={new Set(v.skills.missing)} />
              {v.skills.bonus.length ? (
                <p className="text-xs text-muted-foreground">{t("queue.bonusSkills", { skills: v.skills.bonus.join(", ") })}</p>
              ) : null}
            </div>
          ) : null}
          <ul className="grid gap-2">
            {v.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                <CheckIcon state={c.state} />
                <span className="w-28 shrink-0 text-muted-foreground">{c.label}</span>
                <span className={cn("min-w-0 flex-1", c.state === "unknown" && "text-muted-foreground")}>{c.value}</span>
              </li>
            ))}
          </ul>
          {v.gaps.length ? (
            <ul className="grid gap-1 rounded-2xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
              {v.gaps.map((g) => (
                <li key={g} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{g}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="mt-5 grid gap-2">
          {v.summary ? <Disclosure summary={t("queue.summary")}>{v.summary}</Disclosure> : null}
          {v.experience.length ? (
            <Disclosure summary={t("queue.experience", { count: v.experience.length })}>
              <ul className="grid gap-1.5">
                {v.experience.map((e, i) => (
                  <li key={i}><span className="font-medium text-foreground">{e.title}</span> <span>{e.meta}</span></li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </div>

        {v.grants.length ? (
          <section className="mt-5">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("queue.documents")}</h3>
            <ul className="grid gap-2">{v.grants.map((g) => <GrantDownload key={g.id} orgSlug={orgSlug} grant={g} />)}</ul>
          </section>
        ) : null}

        <Link href={v.fullHref} className="mt-5 flex items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50">
          <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            {v.messages.last ? (
              <>
                <span className="block text-xs text-muted-foreground">{v.messages.last.who} · {v.messages.last.ago}</span>
                <span className="block truncate">{v.messages.last.body}</span>
              </>
            ) : (
              t("queue.noMessages")
            )}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{t("queue.messages", { count: v.messages.count })}</span>
        </Link>
        {v.agreement ? <p className="mt-3 text-xs text-muted-foreground">{v.agreement}</p> : null}
      </div>

      {/* Sticky decision bar */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-card px-6 py-4">
        {v.decision === "decide" ? (
          <>
            <Button variant="outline" disabled={pending} onClick={() => setDialog("decline")}>{t("queue.decline")}</Button>
            <Button variant="ghost" disabled={pending} onClick={() => setDialog("info")}>{t("queue.askInfo")}</Button>
            <Button className="ml-auto" disabled={pending} onClick={() => start(async () => void (await decide("accepted")))}>
              <Check className="size-4" aria-hidden /> {t("queue.accept")}
            </Button>
          </>
        ) : v.decision === "waiting" ? (
          <>
            <span className="text-sm text-muted-foreground">{t("queue.waitingPartner")}</span>
            <Button variant="outline" className="ml-auto" disabled={pending} onClick={() => setDialog("decline")}>{t("queue.decline")}</Button>
          </>
        ) : (
          <>
            <StatusPill tone={v.status.tone} label={v.status.label} />
            <Button variant="outline" className="ml-auto" asChild>
              <Link href={v.fullHref}><ExternalLink className="size-4" aria-hidden /> {t("queue.openFull")}</Link>
            </Button>
          </>
        )}
      </footer>

      <DeclineDialog open={dialog === "decline"} onOpenChange={(o) => setDialog(o ? "decline" : null)} count={1} onConfirm={(code, note) => decide("declined", code, note)} />
      <InfoDialog open={dialog === "info"} onOpenChange={(o) => setDialog(o ? "info" : null)} onConfirm={(note) => decide("info_requested", undefined, note)} />
    </aside>
  );
}

function CheckIcon({ state }: { state: ReqCheck["state"] }) {
  const t = useT("referrals");
  if (state === "ok") return <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-success text-white dark:text-black" role="img" aria-label={t("queue.checkOk")}><Check className="size-3" strokeWidth={3} /></span>;
  if (state === "warn") return <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-amber-500 text-white dark:text-black" role="img" aria-label={t("queue.checkWarn")}><span className="text-[10px] font-bold">!</span></span>;
  return <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" role="img" aria-label={t("queue.checkUnknown")}><Minus className="size-3" strokeWidth={3} /></span>;
}

// ---------------------------------------------------------------------------
// Dialogs

export function DeclineDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: (code: DeclineReason, note: string) => Promise<boolean>;
}) {
  // The form lives inside DialogContent, which unmounts on close, so every opening starts blank.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DeclineForm count={count} onCancel={() => onOpenChange(false)} onConfirm={async (c, n) => { const ok = await onConfirm(c, n); if (ok) onOpenChange(false); }} />
      </DialogContent>
    </Dialog>
  );
}

function DeclineForm({ count, onCancel, onConfirm }: { count: number; onCancel: () => void; onConfirm: (code: DeclineReason, note: string) => Promise<void> }) {
  const t = useT("referrals");
  const [code, setCode] = useState<DeclineReason | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const needsNote = code === "other";
  const ready = code && (!needsNote || note.trim());
  return (
    <>
      <DialogHeader>
        <DialogTitle>{count > 1 ? t("queue.declineTitleMany", { count }) : t("queue.declineTitle")}</DialogTitle>
        <DialogDescription>{t("queue.declineHint")}</DialogDescription>
      </DialogHeader>
      <div role="radiogroup" aria-label={t("queue.reason")} className="flex flex-wrap gap-2">
        {DECLINE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={code === r}
            onClick={() => setCode(r)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              code === r ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
            )}
          >
            {t(`declineReasons.${r}`)}
          </button>
        ))}
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={needsNote ? t("queue.notePlaceholderRequired") : t("queue.notePlaceholder")}
        aria-label={t("queue.note")}
      />
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>{t("queue.cancel")}</Button>
        <Button variant="destructive" disabled={!ready || pending} onClick={() => start(() => onConfirm(code!, note.trim()))}>
          {count > 1 ? t("queue.declineMany", { count }) : t("queue.decline")}
        </Button>
      </DialogFooter>
    </>
  );
}

function InfoDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (note: string) => Promise<boolean> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <InfoForm onCancel={() => onOpenChange(false)} onConfirm={async (n) => { if (await onConfirm(n)) onOpenChange(false); }} />
      </DialogContent>
    </Dialog>
  );
}

function InfoForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (note: string) => Promise<void> }) {
  const t = useT("referrals");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("queue.infoTitle")}</DialogTitle>
        <DialogDescription>{t("queue.infoHint")}</DialogDescription>
      </DialogHeader>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} placeholder={t("queue.infoPlaceholder")} aria-label={t("queue.infoTitle")} />
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>{t("queue.cancel")}</Button>
        <Button disabled={!note.trim() || pending} onClick={() => start(() => onConfirm(note.trim()))}>
          {t("queue.askInfo")}
        </Button>
      </DialogFooter>
    </>
  );
}
