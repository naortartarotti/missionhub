"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormField } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";
import { commissionRuleLabel } from "@/lib/labels";
import { parseMajorToMinor, minorToMajorString } from "@/lib/money/format";
import { splitCommission } from "@/lib/money/allocate";
import {
  FEE_BASES,
  FLAT_FEE_CURRENCIES,
  GUARANTEE_DAYS,
  GUARANTEE_REMEDIES,
  OWNERSHIP_MONTHS_MAX,
  OWNERSHIP_MONTHS_MIN,
  SEARCH_TYPES,
  TERMS_DEFAULTS,
  bpsToRateInput,
  estimateFee,
  parseRateToBps,
  termsDiffer,
  type FeeBasis,
  type GuaranteeRemedy,
  type SearchType,
  type TermsValues,
} from "@/lib/money/terms";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import type { SplitView, TermsView } from "../terms-display";

/** What the card needs from the server (job page / edit page): the current version, if any. */
export type TermsFormContext = {
  current: (TermsView & { attestedByName: string | null; attestedAt: string | null }) | null;
  /** Referrals the hiring side can see on this job (BR-33 note). */
  referralCount: number;
  /** The current default commission rule (T10, read-only). */
  split: SplitView;
};

type Errors = Record<string, string[] | undefined> | undefined;
const err = (e: Errors, k: string) => e?.[k]?.[0];
const OWNERSHIP_MONTHS = Array.from({ length: OWNERSHIP_MONTHS_MAX - OWNERSHIP_MONTHS_MIN + 1 }, (_, i) => OWNERSHIP_MONTHS_MIN + i);

/** Midpoint inputs of the salary band in minor units of the salary currency (either end may be empty). */
function band(min: string, max: string, currency: string) {
  const lo = min.trim() ? parseMajorToMinor(min, currency) : null;
  const hi = max.trim() ? parseMajorToMinor(max, currency) : null;
  return { salaryMin: lo, salaryMax: hi };
}

/**
 * S1 "Terms for partners" (T1–T10). Rendered only while the job is open to partner referrals; the
 * field names are the backend.md §4.1 FormData contract, validated by the same `jobFormSchema` on
 * the server. The attestation is required only when this save publishes a new version (BR-4, BR-5):
 * the client diff drives the marker and notes, the server decides.
 */
export function TermsFields({
  ctx,
  salaryMin,
  salaryMax,
  salaryCurrency,
  shareSalary,
  onShareSalaryChange,
  errors,
  mode = "job",
  windowLockedHint,
  pctDisabledHint,
}: {
  ctx: TermsFormContext;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  shareSalary: boolean;
  onShareSalaryChange: (v: boolean) => void;
  errors: Errors;
  /**
   * `amend` (S10, admin concierge amendment): same T1–T9 fields prefilled with the effective terms; no
   * salary switch, no attestation (carried over), no preview or version notes; split read-only.
   */
  mode?: "job" | "amend";
  /** Amend mode on a delivered referral: T9 is disabled and described by this hint (BR-35). */
  windowLockedHint?: string | null;
  /** Amend mode, F-1: no usable currency for a % amendment, so the % bases are disabled with this helper text. */
  pctDisabledHint?: string | null;
}) {
  const amend = mode === "amend";
  const ta = useT("admin");
  const t = useT("jobs");
  const tg = useGlobalT();
  const f = useFormatter();
  const uid = useId();
  const cur = ctx.current;
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [basis, setBasis] = useState<FeeBasis>(cur?.feeBasis ?? TERMS_DEFAULTS.feeBasis);
  const [rate, setRate] = useState(bpsToRateInput(cur?.rateBps));
  const [minimum, setMinimum] = useState(cur?.minFeeMinor != null ? minorToMajorString(cur.minFeeMinor, cur.currency) : "");
  const [flatFee, setFlatFee] = useState(cur?.flatFeeMinor != null ? minorToMajorString(cur.flatFeeMinor, cur.currency) : "");
  const [flatCurrency, setFlatCurrency] = useState<string>(
    cur?.feeBasis === "flat" ? cur.currency : (FLAT_FEE_CURRENCIES as readonly string[]).includes(salaryCurrency) ? salaryCurrency : "CAD",
  );
  const [searchType, setSearchType] = useState<SearchType>(cur?.searchType ?? TERMS_DEFAULTS.searchType);
  const [guaranteeDays, setGuaranteeDays] = useState(String(cur?.guaranteeDays ?? TERMS_DEFAULTS.guaranteeDays));
  const [remedy, setRemedy] = useState<GuaranteeRemedy | "">(cur?.guaranteeRemedy ?? (cur ? "" : TERMS_DEFAULTS.guaranteeRemedy));
  const [paymentDays, setPaymentDays] = useState(String(cur?.paymentTermsDays ?? TERMS_DEFAULTS.paymentTermsDays));
  const [months, setMonths] = useState(String(cur?.ownershipMonths ?? TERMS_DEFAULTS.ownershipMonths));

  // Deep link from the nudge (`/edit#terms`): focus the panel heading (spec §6).
  useEffect(() => {
    if (window.location.hash !== "#terms") return;
    headingRef.current?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const pct = basis !== "flat";
  const days = Number(guaranteeDays);
  const rateBps = pct ? parseRateToBps(rate) : null;

  // BR-5 client diff: an unparseable value counts as a change (the save will report it anyway).
  const draft: TermsValues | null = (() => {
    const min = pct && minimum.trim() ? parseMajorToMinor(minimum, salaryCurrency) : null;
    const flat = !pct ? parseMajorToMinor(flatFee, flatCurrency) : null;
    if ((pct && rateBps === null) || (pct && minimum.trim() && !min) || (!pct && !flat)) return null;
    return {
      feeBasis: basis,
      rateBps,
      flatFeeMinor: flat,
      minFeeMinor: min,
      currency: pct ? salaryCurrency : flatCurrency,
      searchType,
      guaranteeDays: days,
      guaranteeRemedy: days === 0 ? null : remedy || null,
      paymentTermsDays: Number(paymentDays),
      ownershipMonths: Number(months),
    };
  })();
  const willPublish = !cur || !draft || termsDiffer(cur, draft);

  // Preview (existing split-preview styling): % → band midpoint estimate, flat → exact shares.
  const { salaryMin: lo, salaryMax: hi } = band(salaryMin, salaryMax, salaryCurrency);
  const hasBand = lo !== null || hi !== null;
  const flatMinor = !pct ? parseMajorToMinor(flatFee, flatCurrency) : null;
  const minMinor = pct && minimum.trim() ? parseMajorToMinor(minimum, salaryCurrency) : null;
  const previewFee = pct
    ? rateBps !== null && hasBand
      ? estimateFee({ feeBasis: basis, rateBps, flatFeeMinor: null, minFeeMinor: minMinor }, { shareSalary: true, salaryMin: lo, salaryMax: hi })
      : null
    : flatMinor;
  const previewCurrency = pct ? salaryCurrency : flatCurrency;
  const parts = previewFee && previewFee > 0 ? splitCommission(previewFee, ctx.split) : null;

  const basisHint = (b: FeeBasis) =>
    b === "pct_total_cash" && salaryCurrency === "BRL" ? `${t("form.terms.basisHint.pct_total_cash")} ${t("form.terms.basisHint.pct_total_cash_br")}` : t(`form.terms.basisHint.${b}`);

  const describedBy = (id: string, hasHint = false) => (err(errors, id) ? `${id}-error` : hasHint ? `${id}-hint` : undefined);

  return (
    <Panel id="terms" className="grid scroll-mt-24 gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">{amend ? ta("referralTerms.amendTitle") : t("form.terms.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{amend ? ta("referralTerms.amendDescription") : t("form.terms.description")}</p>
        </div>
        {amend ? null : <StatusPill tone="neutral" className="text-xs" label={cur ? t("form.terms.versionPill", { version: cur.versionNo, date: f.date(cur.publishedAt) }) : t("form.terms.notPublished")} />}
      </div>

      {/* 1. Placement fee */}
      <fieldset className="grid gap-4">
        <legend id={`${uid}-fee`} className="mb-3 text-sm font-semibold">{t("form.terms.feeLegend")}</legend>
        <input type="hidden" name="feeBasis" value={basis} />
        <RadioGroup
          value={basis}
          onValueChange={(v) => setBasis(v as FeeBasis)}
          aria-labelledby={`${uid}-fee`}
          aria-invalid={err(errors, "feeBasis") ? true : undefined}
          className="grid gap-2 sm:auto-rows-fr sm:grid-cols-3"
        >
          {FEE_BASES.map((b) => (
            <OptionCard
              key={b}
              id={`${uid}-basis-${b}`}
              value={b}
              selected={basis === b}
              label={tg(`labels.feeBasis.${b}`)}
              hint={basisHint(b)}
              disabled={Boolean(pctDisabledHint) && b !== "flat" && basis !== b}
              describedBy={pctDisabledHint && b !== "flat" ? `${uid}-pct-disabled` : undefined}
            />
          ))}
        </RadioGroup>
        {pctDisabledHint ? <p id={`${uid}-pct-disabled`} className="text-xs text-muted-foreground">{pctDisabledHint}</p> : null}
        {err(errors, "feeBasis") ? <p role="alert" className="text-xs font-medium text-danger">{err(errors, "feeBasis")}</p> : null}

        {pct ? (
          <div className="grid gap-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="feeRate" label={t("form.terms.rate")} error={err(errors, "feeRate")}>
                <Adorned adornment="%" srId={`${uid}-rate-unit`} srText="%">
                  <Input
                    id="feeRate"
                    name="feeRate"
                    inputMode="decimal"
                    placeholder={t("form.terms.ratePlaceholder")}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    aria-invalid={err(errors, "feeRate") ? true : undefined}
                    // The "%" adornment is aria-hidden: announce the unit with the field (P-13).
                    aria-describedby={[describedBy("feeRate"), `${uid}-rate-unit`].filter(Boolean).join(" ")}
                    className="pr-9"
                  />
                </Adorned>
              </FormField>
              <FormField id="minimumFee" label={t("form.terms.minimum")} hint={t("form.terms.minimumHint")} error={err(errors, "minimumFee")}>
                <Adorned adornment={salaryCurrency} srId={`${uid}-min-unit`} srText={salaryCurrency}>
                  <Input
                    id="minimumFee"
                    name="minimumFee"
                    inputMode="decimal"
                    value={minimum}
                    onChange={(e) => setMinimum(e.target.value)}
                    aria-invalid={err(errors, "minimumFee") ? true : undefined}
                    aria-describedby={[describedBy("minimumFee", true), amend ? `${uid}-min-unit` : `${uid}-fee-currency`].filter(Boolean).join(" ")}
                    className="pr-14"
                  />
                </Adorned>
              </FormField>
            </div>
            {amend ? null : <p id={`${uid}-fee-currency`} className="text-xs text-muted-foreground" aria-live="polite">{t("form.terms.currencyFollowsSalary", { currency: salaryCurrency })}</p>}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="flatFee" label={t("form.terms.flatAmount")} error={err(errors, "flatFee")}>
              <Input
                id="flatFee"
                name="flatFee"
                inputMode="decimal"
                value={flatFee}
                onChange={(e) => setFlatFee(e.target.value)}
                aria-invalid={err(errors, "flatFee") ? true : undefined}
                aria-describedby={describedBy("flatFee")}
              />
            </FormField>
            <FormField id="flatCurrency" label={t("form.terms.currency")} error={err(errors, "flatCurrency")}>
              <NativeSelect id="flatCurrency" name="flatCurrency" value={flatCurrency} onChange={(e) => setFlatCurrency(e.target.value)} aria-invalid={err(errors, "flatCurrency") ? true : undefined}>
                {FLAT_FEE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </NativeSelect>
            </FormField>
          </div>
        )}

        {amend ? null : <div className="grid gap-2 rounded-2xl border border-border bg-muted/40 p-4" aria-live="polite">
          <p className="text-sm font-medium">{pct ? t("form.terms.previewTitle") : t("form.terms.previewFlat")}</p>
          {pct && !hasBand ? (
            <p className="text-sm text-muted-foreground">{t("form.terms.previewNoBand")}</p>
          ) : parts && previewFee ? (
            <>
              {pct ? (
                <p className="text-sm font-semibold tabular-nums">
                  {t("form.terms.previewFee", { fee: f.money(previewFee, previewCurrency, { code: true, whole: true }) })}
                  {basis === "pct_total_cash" && rateBps !== null ? <span className="font-normal text-muted-foreground"> {t("form.terms.previewBonus", { rate: f.percent(rateBps) })}</span> : null}
                </p>
              ) : null}
              <dl className="grid gap-3 sm:grid-cols-3">
                {([
                  ["form.splitJobOwner", parts.jobOwner, ctx.split.jobOwnerBps],
                  ["form.splitSourcing", parts.sourcing, ctx.split.sourcingBps],
                  ["form.splitPlatform", parts.platform, ctx.split.platformBps],
                ] as const).map(([key, value, bps]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">{t(key, { percent: f.percent(bps) })}</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{f.money(Number(value), previewCurrency, pct ? { code: true, whole: true, approx: true } : { code: true })}</dd>
                  </div>
                ))}
              </dl>
              {pct ? <p className="text-xs text-muted-foreground">{t("form.terms.previewHint")}</p> : null}
            </>
          ) : null}
        </div>}
      </fieldset>

      {/* 2. Search type */}
      <fieldset className="grid gap-2">
        <legend id={`${uid}-search`} className="mb-3 text-sm font-semibold">{t("form.terms.searchLegend")}</legend>
        <input type="hidden" name="searchType" value={searchType} />
        <RadioGroup value={searchType} onValueChange={(v) => setSearchType(v as SearchType)} aria-labelledby={`${uid}-search`} className="grid gap-2">
          {SEARCH_TYPES.map((s) => (
            <OptionCard key={s} id={`${uid}-search-${s}`} value={s} selected={searchType === s} label={tg(`labels.searchType.${s}`)} hint={t(`terms.searchTypeHint.${s}`)} />
          ))}
        </RadioGroup>
        {err(errors, "searchType") ? <p role="alert" className="text-xs font-medium text-danger">{err(errors, "searchType")}</p> : null}
      </fieldset>

      {/* 3. Guarantee */}
      <fieldset className="grid gap-4">
        <legend className="mb-3 text-sm font-semibold">{t("form.terms.guaranteeLegend")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="guaranteeDays" label={t("form.terms.guaranteeLength")} error={err(errors, "guaranteeDays")}>
            <NativeSelect
              id="guaranteeDays"
              name="guaranteeDays"
              value={guaranteeDays}
              onChange={(e) => {
                setGuaranteeDays(e.target.value);
                if (e.target.value !== "0" && !remedy) setRemedy(TERMS_DEFAULTS.guaranteeRemedy);
              }}
              aria-invalid={err(errors, "guaranteeDays") ? true : undefined}
            >
              {GUARANTEE_DAYS.map((d) => (
                <option key={d} value={d}>{d === 0 ? t("form.terms.guaranteeNone") : t("form.terms.guaranteeDays", { count: d })}</option>
              ))}
            </NativeSelect>
          </FormField>
          {days === 0 ? (
            <p className="flex items-start gap-1.5 self-end text-sm text-muted-foreground sm:pb-2.5">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("form.terms.noGuaranteeNote")}
            </p>
          ) : (
            <fieldset className="grid gap-2">
              <legend id={`${uid}-remedy`} className="mb-1.5 text-sm font-medium">{t("form.terms.remedy")}</legend>
              {remedy ? <input type="hidden" name="guaranteeRemedy" value={remedy} /> : null}
              <RadioGroup
                value={remedy}
                onValueChange={(v) => setRemedy(v as GuaranteeRemedy)}
                aria-labelledby={`${uid}-remedy`}
                aria-invalid={err(errors, "guaranteeRemedy") ? true : undefined}
                className="grid gap-1"
              >
                {GUARANTEE_REMEDIES.map((r) => (
                  <Label key={r} htmlFor={`${uid}-remedy-${r}`} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 font-normal leading-5 hover:bg-muted/50">
                    <RadioGroupItem id={`${uid}-remedy-${r}`} value={r} />
                    <span className="text-pretty">{tg(`labels.guaranteeRemedy.${r}`)}</span>
                  </Label>
                ))}
              </RadioGroup>
              {err(errors, "guaranteeRemedy") ? <p role="alert" className="text-xs font-medium text-danger">{err(errors, "guaranteeRemedy")}</p> : null}
            </fieldset>
          )}
        </div>
      </fieldset>

      {/* 4. Payment and ownership */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="paymentTermsDays" label={t("form.terms.paymentTerms")} hint={t("form.terms.paymentHint")} error={err(errors, "paymentTermsDays")}>
          <Adorned adornment={t("form.terms.paymentDays")}>
            <Input
              id="paymentTermsDays"
              name="paymentTermsDays"
              type="number"
              min={0}
              max={90}
              step={1}
              inputMode="numeric"
              value={paymentDays}
              onChange={(e) => setPaymentDays(e.target.value)}
              aria-invalid={err(errors, "paymentTermsDays") ? true : undefined}
              aria-describedby={describedBy("paymentTermsDays", true)}
              className="pr-16"
            />
          </Adorned>
        </FormField>
        <FormField id="ownershipMonths" label={t("form.terms.window")} hint={windowLockedHint ?? t("form.terms.windowHint")} error={err(errors, "ownershipMonths")}>
          {/* A disabled select isn't posted: keep the locked value in a hidden input (BR-35). */}
          {windowLockedHint ? <input type="hidden" name="ownershipMonths" value={months} /> : null}
          <NativeSelect
            id="ownershipMonths"
            name={windowLockedHint ? undefined : "ownershipMonths"}
            value={months}
            disabled={Boolean(windowLockedHint)}
            onChange={(e) => setMonths(e.target.value)}
            aria-invalid={err(errors, "ownershipMonths") ? true : undefined}
            aria-describedby={describedBy("ownershipMonths", true)}
          >
            {OWNERSHIP_MONTHS.map((m) => <option key={m} value={m}>{t("form.terms.windowMonths", { count: m })}</option>)}
          </NativeSelect>
        </FormField>
      </div>

      {/* 5. Salary visibility (replaces the "Compensation band" checkbox, BR-9 / BR-10) */}
      {/* The whole row is the label: a ≥ 44px hit area around the small switch (B-3, §6). */}
      {amend ? null : (
        <Label htmlFor={`${uid}-share-salary`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 leading-5 font-normal">
          {shareSalary ? <input type="hidden" name="shareSalary" value="on" /> : null}
          <Switch id={`${uid}-share-salary`} checked={shareSalary} onCheckedChange={onShareSalaryChange} aria-describedby={`${uid}-share-salary-hint`} className="mt-0.5" />
          <span className="min-w-0">
            <span className="block font-medium">{t("form.terms.shareSalary")}</span>
            <span id={`${uid}-share-salary-hint`} className="mt-1 block text-xs text-muted-foreground">{t("form.terms.shareSalaryHint")}</span>
          </span>
        </Label>
      )}

      {/* 6. Commission split (T10, read-only) */}
      <div className="grid gap-1.5">
        <h3 className="text-sm font-semibold">{t("form.terms.splitTitle")}</h3>
        <dl>
          <dt className="sr-only">{t("form.terms.splitTitle")}</dt>
          <dd className="text-sm font-medium">
            {t("terms.split", { sourcing: f.percent(ctx.split.sourcingBps), hiring: f.percent(ctx.split.jobOwnerBps), platform: f.percent(ctx.split.platformBps) })}
            <span className="block text-xs font-normal text-muted-foreground">{t("terms.splitRule", { rule: commissionRuleLabel(ctx.split.ruleName, tg), version: String(ctx.split.ruleVersion) })}</span>
          </dd>
        </dl>
        <p className="text-xs text-muted-foreground">{amend ? ta("referralTerms.splitLocked") : t("form.terms.splitNote")}</p>
      </div>

      {amend ? <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{ta("referralTerms.attestationCarried")}</p> : null}

      {/* 8. Version notes (BR-5, BR-33) */}
      {amend ? null : <>
      <div aria-live="polite" className="grid gap-1 empty:hidden">
        {cur && willPublish ? <p className="text-sm text-muted-foreground">{t("form.terms.willPublish", { version: cur.versionNo + 1 })}</p> : null}
        {cur && willPublish && ctx.referralCount > 0 ? <p className="text-sm text-muted-foreground">{t("form.terms.existingReferrals", { count: ctx.referralCount })}</p> : null}
      </div>

      {/* 7. Direct client (T6): re-ticked on every save that publishes a version (BR-4) */}
      <div className="grid gap-2">
        {cur?.attestedByName && cur.attestedAt ? <p className="text-xs text-muted-foreground">{t("form.terms.lastAttested", { name: cur.attestedByName, date: f.date(cur.attestedAt) })}</p> : null}
        <div className={cn("grid gap-1.5 rounded-2xl border p-4", err(errors, "directClientAttested") ? "border-danger/50" : "border-border")}>
          <Label className="flex min-h-11 items-start gap-3 leading-5 font-normal">
            <Checkbox
              name="directClientAttested"
              className="mt-0.5"
              aria-invalid={err(errors, "directClientAttested") ? true : undefined}
              aria-describedby={`${uid}-attest-hint${err(errors, "directClientAttested") ? ` ${uid}-attest-error` : ""}`}
            />
            <span>
              <span className="font-medium">{t("form.terms.attestation")}</span>
              {willPublish ? <span className="ml-2 inline-block rounded-full bg-warning-soft px-2 py-0.5 align-middle text-xs font-medium text-warning">{t("form.terms.attestationRequired")}</span> : null}
            </span>
          </Label>
          <p id={`${uid}-attest-hint`} className="pl-7 text-xs text-muted-foreground">{t("form.terms.attestationHint")}</p>
          {err(errors, "directClientAttested") ? <p id={`${uid}-attest-error`} role="alert" className="pl-7 text-xs font-medium text-danger">{err(errors, "directClientAttested")}</p> : null}
        </div>
      </div>
      </>}
    </Panel>
  );
}

/** An enum option rendered as a card with a 1-line hint; the whole card is the hit area (≥ 44px). */
function OptionCard({ id, value, selected, label, hint, disabled = false, describedBy }: { id: string; value: string; selected: boolean; label: string; hint: string; disabled?: boolean; describedBy?: string }) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex h-full min-h-11 items-start gap-3 rounded-2xl border p-3 leading-5 font-normal transition-colors",
        disabled ? "cursor-not-allowed border-border opacity-60" : "cursor-pointer",
        !disabled && (selected ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/30"),
      )}
    >
      <RadioGroupItem id={id} value={value} disabled={disabled} aria-describedby={describedBy} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-pretty">{label}</span>
        <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">{hint}</span>
      </span>
    </Label>
  );
}

/** An input with a unit inside its right edge (%, currency code, "days"); the label already names it. */
function Adorned({ adornment, children, srId, srText }: { adornment: string; children: ReactNode; srId?: string; srText?: string }) {
  return (
    <div className="relative">
      {children}
      {srId ? <span id={srId} className="sr-only">{srText}</span> : null}
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm whitespace-nowrap text-muted-foreground" aria-hidden>{adornment}</span>
    </div>
  );
}
