"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, CircleDot, CircleSlash, ExternalLink, Handshake, Lock, MoreHorizontal, PartyPopper, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReportHireDialog } from "@/features/referrals/components/referral-actions";
import { transitionReferral } from "@/features/referrals/actions";
import { minorToMajorString } from "@/lib/money/format";
import { cn } from "@/lib/utils";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import type { Paths } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages";
import { HIRE_FROM, PIPELINE_CLOSED, PIPELINE_STAGES, type PipelineCard, type PipelineTransition } from "../stages";

type ColumnKey = (typeof PIPELINE_STAGES)[number] | "closed";
const COLUMNS: ColumnKey[] = [...PIPELINE_STAGES, "closed"];
const CLOSED = new Set<string>(PIPELINE_CLOSED);
const columnOf = (status: string): ColumnKey => (CLOSED.has(status) ? "closed" : (status as ColumnKey));

/** Column accent: same pastel tiles as the rest of the app. */
const ACCENT: Record<ColumnKey, string> = {
  accepted: "bg-tile-blue",
  interviewing: "bg-tile-lilac",
  offer: "bg-tile-yellow",
  hired: "bg-tile-green",
  closed: "bg-muted",
};

/** Card status pill: soft background + matching border, like the rest of the app's badges. */
const STATUS_STYLE = {
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  info: "border-info/25 bg-info-soft text-info",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

/** What a drop (or a card action) will do. */
type Move =
  | { kind: "transition"; to: string; requiresReason: boolean; blockedByAgreement: boolean }
  | { kind: "hire"; blockedByAgreement: boolean };

export function PipelineBoard({
  orgSlug,
  cards,
  transitions,
  canMove,
  showJob,
  currency,
}: {
  orgSlug: string;
  cards: PipelineCard[];
  transitions: PipelineTransition[];
  canMove: boolean;
  /** Show the job title on cards (board across all jobs). */
  showJob: boolean;
  /** Fallback currency for the hire form when the job has none. */
  currency: string;
}) {
  const t = useT("pipeline");
  const tg = useGlobalT();
  const [optimistic, setOptimistic] = useOptimistic(cards, (state, u: { id: string; status: string }) => state.map((c) => (c.id === u.id ? { ...c, status: u.status } : c)));
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ColumnKey | null>(null);
  const [hireFor, setHireFor] = useState<PipelineCard | null>(null);
  const [closeFor, setCloseFor] = useState<{ card: PipelineCard; to: string } | null>(null);

  const tr = useT("referrals");
  const stageLabel = (s: string) => tg(`labels.referralStatus.${s}` as Paths<Messages>);
  // Button wording for a closing move ("Not selected", "Cancel"), same as on the referral page.
  const actionLabel = (to: string) => (to === "rejected" || to === "cancelled" ? tr(`actions.${to}`) : stageLabel(to));

  /** Allowed moves for one card, straight from referral_transitions (target side). */
  const movesFor = useMemo(() => {
    const byFrom = new Map<string, PipelineTransition[]>();
    for (const tr of transitions) byFrom.set(tr.from_status, [...(byFrom.get(tr.from_status) ?? []), tr]);
    return (card: PipelineCard, col: ColumnKey): Move | null => {
      if (!canMove || !card.canMove) return null;
      if (col === "hired") return card.status === HIRE_FROM ? { kind: "hire", blockedByAgreement: !card.agreementActive } : null;
      const options = (byFrom.get(card.status) ?? []).filter((tr) => columnOf(tr.to_status) === col);
      // Closing: "not selected" when the stage allows it, otherwise "cancelled".
      const tr = options.find((o) => o.to_status === "rejected") ?? options[0];
      if (!tr) return null;
      return { kind: "transition", to: tr.to_status, requiresReason: tr.requires_reason, blockedByAgreement: tr.requires_active_agreement && !card.agreementActive };
    };
  }, [transitions, canMove]);

  const nextColumn = (card: PipelineCard): ColumnKey | null => {
    const i = PIPELINE_STAGES.indexOf(card.status as (typeof PIPELINE_STAGES)[number]);
    return i >= 0 && i < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[i + 1] : null;
  };

  const run = (card: PipelineCard, to: string, reason = "") => {
    start(async () => {
      setOptimistic({ id: card.id, status: to });
      const r = await transitionReferral(orgSlug, { referralId: card.id, to, reason, version: card.version });
      if (!r.ok) toast.error(r.error);
      else toast.success(t("moved", { stage: stageLabel(to) }));
    });
  };

  const apply = (card: PipelineCard, col: ColumnKey) => {
    const move = movesFor(card, col);
    if (!move) return;
    if (move.blockedByAgreement) {
      toast.error(t("waitingAgreement"));
      return;
    }
    if (move.kind === "hire") setHireFor(card);
    else if (move.requiresReason) setCloseFor({ card, to: move.to });
    else run(card, move.to);
  };

  const dragged = dragId ? optimistic.find((c) => c.id === dragId) ?? null : null;

  return (
    <>
      {/* Part of the page, not a framed box: starts at the content's left edge, scrolls out to the screen's right
          edge (bleeds past main's padding), and fills the height below the header. Vertical scrolling stays on the page. */}
      <div className="-mx-4 flex min-h-[calc(100dvh-10.5rem)] flex-col overflow-x-auto overflow-y-hidden overscroll-x-contain pb-3 sm:-mr-8 sm:ml-0 lg:-mr-10">
        <div className="grid w-max flex-1 auto-cols-[20rem] grid-flow-col gap-3 px-4 sm:pl-0 sm:pr-8 lg:pr-10">
          {COLUMNS.map((col) => {
            const list = optimistic.filter((c) => columnOf(c.status) === col);
            const droppable = dragged ? !!movesFor(dragged, col) : false;
            return (
              <section
                key={col}
                aria-labelledby={`col-${col}`}
                onDragOver={(e) => {
                  if (!droppable) return;
                  e.preventDefault();
                  setOverCol(col);
                }}
                onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverCol(null);
                  if (dragged && droppable) apply(dragged, col);
                  setDragId(null);
                }}
                className={cn(
                  "flex min-w-0 flex-col rounded-2xl bg-muted/35 p-2 transition-colors",
                  dragged && droppable && "outline-2 outline-dashed outline-foreground/20",
                  overCol === col && "bg-muted outline-foreground/50",
                  dragged && !droppable && columnOf(dragged.status) !== col && "opacity-60",
                )}
              >
                <header className="flex items-center gap-2 px-2 pb-2 pt-1.5">
                  <span className={cn("size-2.5 rounded-full", ACCENT[col])} aria-hidden />
                  <h2 id={`col-${col}`} className="text-sm font-semibold">{col === "closed" ? t("closed") : stageLabel(col)}</h2>
                  <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{list.length}</span>
                </header>
                <ul className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
                  {list.map((card) => (
                    <li key={card.id}>
                      <Card
                        orgSlug={orgSlug}
                        card={card}
                        showJob={showJob}
                        next={nextColumn(card)}
                        nextMove={nextColumn(card) ? movesFor(card, nextColumn(card)!) : null}
                        closeMove={movesFor(card, "closed")}
                        onApply={(c) => apply(card, c)}
                        draggable={canMove && card.canMove && columnOf(card.status) !== "closed" && card.status !== "hired"}
                        onDragStart={() => setDragId(card.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        dragging={dragId === card.id}
                      />
                    </li>
                  ))}
                  {list.length === 0 ? <li className="rounded-2xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{t("columnEmpty")}</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {hireFor ? (
        <ReportHireDialog
          orgSlug={orgSlug}
          referralId={hireFor.id}
          version={hireFor.version}
          currency={hireFor.feeCurrency ?? currency}
          defaultFee={hireFor.expectedFeeMinor && hireFor.feeCurrency ? minorToMajorString(hireFor.expectedFeeMinor, hireFor.feeCurrency) : ""}
          open
          onOpenChange={(o) => !o && setHireFor(null)}
          trigger={null}
        />
      ) : null}

      {closeFor ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setCloseFor(null)}
          title={tr("actions.confirmTitle", { label: actionLabel(closeFor.to) })}
          description={<><span className="font-medium text-foreground">{closeFor.card.candidateName}</span> · {t("closeDialog.description")}</>}
          confirmLabel={actionLabel(closeFor.to)}
          destructive
          reasonLabel={t("closeDialog.reason")}
          reasonRequired
          onConfirm={async (reason) => {
            setCloseFor(null);
            run(closeFor.card, closeFor.to, reason);
          }}
        />
      ) : null}
    </>
  );
}

function Card({
  orgSlug,
  card,
  showJob,
  next,
  nextMove,
  closeMove,
  onApply,
  draggable,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  orgSlug: string;
  card: PipelineCard;
  showJob: boolean;
  next: ColumnKey | null;
  nextMove: Move | null;
  closeMove: Move | null;
  onApply: (col: ColumnKey) => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const t = useT("pipeline");
  const tg = useGlobalT();
  const f = useFormatter();
  const tr = useT("referrals");
  const closed = CLOSED.has(card.status);
  const stageLabel = (s: string) => tg(`labels.referralStatus.${s}` as Paths<Messages>);
  const waiting = nextMove?.blockedByAgreement;

  // One status per card, in priority order. Color only where it means something.
  const status: { label: string; tone: "success" | "warning" | "neutral" | "info"; hint?: string } =
    card.status === "hired"
      ? { label: stageLabel("hired"), tone: "success" }
      : closed
        ? { label: stageLabel(card.status), tone: "neutral" }
        : !card.canMove
          ? { label: t("status.viewOnly"), tone: "neutral", hint: card.owner ? t("ownerOnly", { name: card.owner }) : t("ownerOnlyUnknown") }
          : waiting
            ? { label: t("status.awaitingSplit"), tone: "warning", hint: t("waitingAgreement") }
            : { label: t("status.ready"), tone: "info", hint: t("status.readyHint") };
  const StatusIcon = { success: CheckCircle2, warning: Handshake, neutral: card.canMove || closed ? CircleSlash : Lock, info: CircleDot }[status.tone];
  const subtitle = [showJob ? card.jobTitle : card.candidateName !== card.candidateLabel ? card.candidateLabel : null, card.partner].filter(Boolean).join(" · ");

  return (
    <article
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow",
        draggable && "cursor-grab active:cursor-grabbing hover:shadow-md",
        dragging && "opacity-40",
        closed && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/workspace/${orgSlug}/referrals/${card.id}`} className="block text-[15px] font-semibold leading-snug break-words underline-offset-4 hover:underline">
            {card.candidateName}
          </Link>
          {subtitle ? <p className="mt-1 text-sm leading-snug break-words text-muted-foreground">{subtitle}</p> : null}
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-8 shrink-0 rounded-lg! text-muted-foreground" aria-label={t("menu", { candidate: card.candidateName })}>
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {nextMove && next ? (
                <DropdownMenuItem disabled={waiting} onSelect={() => onApply(next)}>
                  <ArrowRight className="size-4" aria-hidden />
                  {next === "hired" ? t("reportHire") : t("moveTo", { stage: stageLabel(next) })}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/workspace/${orgSlug}/referrals/${card.id}`}>
                  <ExternalLink className="size-4" aria-hidden />
                  {t("openReferral")}
                </Link>
              </DropdownMenuItem>
              {card.placementId ? (
                <DropdownMenuItem asChild>
                  <Link href={`/workspace/${orgSlug}/wallet/placements/${card.placementId}`}>
                    <PartyPopper className="size-4" aria-hidden />
                    {t("openPlacement")}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {closeMove && closeMove.kind === "transition" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onApply("closed")}>
                    <X className="size-4" aria-hidden />
                    {tr(`actions.${closeMove.to as "rejected" | "cancelled"}`)}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/80">
        {card.expectedFeeMinor && card.feeCurrency ? (
          <>
            <span className="inline-flex items-center gap-1.5" title={t("feeHint")}>
              <CircleDollarSign className="size-4 text-muted-foreground" aria-hidden />
              <span className="tabular-nums">{f.money(card.expectedFeeMinor, card.feeCurrency, { whole: true })}</span>
            </span>
            <span className="text-muted-foreground/60" aria-hidden>·</span>
          </>
        ) : null}
        <span className="inline-flex items-center gap-1.5" title={`${t("inStage")} · ${f.dateTime(card.stageSince)}`}>
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          {/* Relative time can tick between the server render and hydration ("11" vs "12 minutes ago"). */}
          <span suppressHydrationWarning>{f.relative(card.stageSince)}</span>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        {card.owner ? (
          <span className="flex min-w-0 items-center gap-2 text-sm" title={t("ownerHint")}>
            <InitialsAvatar name={card.owner} className="size-6 text-[10px]" />
            <span className="break-words">{card.owner}</span>
          </span>
        ) : (
          <span />
        )}
        <span
          title={status.hint}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            STATUS_STYLE[status.tone],
          )}
        >
          <StatusIcon className="size-3.5" aria-hidden />
          {status.label}
        </span>
      </div>
    </article>
  );
}
