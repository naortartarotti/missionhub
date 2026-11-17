# Copy review: Job terms card (N2)

Owner: UX Writer · Date: 2026-11-15 · Mode: review (no JSON or code edited)

Reviewed against `spec.md` §5 (final copy, 268 keys per locale + 3 notification texts) and `docs/content/voice-and-tone.md` (glossary §5.6, §4 words to avoid, §6 mechanics).

**Result: 1 blocking, 16 polish.**

## What I checked

| Area | Scope | Result |
|---|---|---|
| Verbatim match with §5 | `labels`, `jobs`, `opportunities`, `referrals`, `commissions`, `admin`, `errors` in en, fr, pt | **All §5.1–§5.9 keys match**, including both "changed" keys (`referrals.agreement.title`, `referrals.claim.validation.priorDateTooOld`) |
| Notification texts (§5.10) | `20261116000200` (`job.terms_changed`), `20261116000400` (`placement.fee_difference`, `referral.terms_amended`) | **Bodies match en verbatim.** The reason labels in SQL match `labels.feeDifferenceReason` en exactly. `app.money_code` gives "CAD 20,000.00". The amendment text never includes the reason or references. Titles weren't in §5.10: see P15 |
| Glossary | All N2 strings | Consistent: terms/conditions/termos, computed/invoiced fee, difference/écart/diferença, expected share/part attendue/parte esperada, ownership window, first position. "Frozen" is used only for the split |
| Currency codes | Every `f.money` call on N2 surfaces | `code: true` everywhere (job form preview, terms summary, composer, opportunities, overview, referral page, hire dialog, placement page, commissions list and KPIs, admin amendment). Differences use `signed: true` |
| Neutral fee differences and negative shares | Hire dialog, placement page, commissions list | Neutral. Callouts are side-specific with `bg-muted` and an info icon. The negative tile has no danger colour and uses the hint. No "penalty", "bonus" (as a judgement), "debt" or "owe" in N2 keys. Pre-existing "owe" on the same page: see P6 |
| Workatent moving money | All N2 strings + SQL | None. `network.payout` says "directly". `negativeTarget` says "You pay it to {partner} directly" |
| "release" in the response line | `jobs.terms.network.response` en/fr/pt | Not present ✓ |
| ⚖️ markers | Spec §5 rows; UI | Markers are kept in the spec. `NetworkRules` shows `draftMarker` on the composer (expanded) and the referral page (inside the disclosure). The agreement descriptions both say the rules are a draft |
| Plurals | 13 plural keys | `{one, other}`, with `{count}` in both branches in every locale. T8 = 0 uses `paymentTermsZero`, and a 0-day guarantee uses `noGuarantee`, so "0 days" never shows |
| fr typography | 7 fr files | Every N2 fr key uses U+00A0 before `:` and inside « ». No space before `?` or `;`. Apostrophes are straight throughout (0 `’`), so each file is consistent. The 46 ASCII-space hits are all pre-N2 keys (not counted, listed at the end) |
| Hard-coded text | N2 components in `frontend.md` | No JSX text nodes or hard-coded labels. Remaining concatenations: character counters (P11), `" · "` separators, the "—" none glyph, the `%` adornment (allowed by §5.3) and the legacy currency codes |
| Truncation in practice | Chips, KPI tile, sent-list line, buttons | The nudge chip is `whitespace-normal` (fr wraps to 2 lines). The Fee terms KPI uses `text-lg` + `break-words` below `sm`. The sent-list terms line isn't truncated. `termsChanged.submit` and `amendSubmit` are within limits. **Not re-measured:** admin overview at fr 375 (frontend fixed it in code only) |

### The four codes mapped to `errors.generic`

The question was whether `hire_base_invalid`, `fee_difference_not_allowed`, `fee_difference_note_too_long` and `amendment_reason_required` need their own copy. **None of them does.** In all four cases the Server Action already refuses the input with a field error, using the same rule against the referral's *current* terms, before the RPC runs:

- `hire_base_invalid` → `reportHire` re-reads `getReferralTerms` and returns `referrals.validation.baseRequired` / `bonusRequired`. A flat referral ignores a posted base.
- `fee_difference_not_allowed` → reason and note are only posted when "Invoiced fee is different" is ticked, and I = C returns `invoicedSame`.
- `fee_difference_note_too_long` → JS `length` (UTF-16 units) is never smaller than Postgres `char_length`, so `noteTooLong` always fires first.
- `amendment_reason_required` → `amendSchema` returns the `admin.referralTerms.validation.*` keys (checked in `src/features/admin/actions.ts`: `reasonLength`, `requestLength` ×2, `bothAskedRequired`).

So in practice the generic message only appears for forged requests. The real gap is next to these codes: a hire dialog left open while an amendment is recorded. See P16. I wrote copy for it.

---

## Blocking

### B1. The agreement dialog says "the terms this referral was submitted under" while showing amended terms

`src/features/referrals/components/referral-terms.tsx` (`AgreementDialog`) renders `recorded.effective` (the amendment, if there is one) under the "Amended on {date}…" line. The description above it still says the terms are the ones the referral was submitted under on the submission date. An amendment can be recorded between acceptance and the sourcing side's confirmation: `admin_amend_referral_terms` allows any status before a hire, and PD-051 Q8 re-points a pending agreement. In that case the dialog misstates what the sourcing recruiter is committing to, in ⚖️ wording, at the moment of commitment. This is my miss in §5, not a frontend error.

**Fix: make the sentence true in both cases.** The version line right above it already says which version applies, or that the terms were amended. Frontend can drop the `{ date }` argument; it's harmless if left in.

| Key | Current | Proposed |
|---|---|---|
| `referrals.agreement.descriptionSnapshot` (en) | These are the terms this referral was submitted under on {date}. They can't be changed for this referral unless both organizations ask Workatent in writing before a hire. The network rules are a draft pending legal review. | These are this referral's terms. They can't be changed for this referral unless both organizations ask Workatent in writing before a hire. The network rules are a draft pending legal review. |
| (fr) | Voici les conditions selon lesquelles cette recommandation a été soumise le {date}. Elles ne peuvent pas être modifiées … | Voici les conditions de cette recommandation. Elles ne peuvent pas être modifiées pour cette recommandation, sauf si les deux organisations le demandent par écrit à Workatent avant l'embauche. Les règles du réseau sont une ébauche en attente de révision juridique. |
| (pt) | Estes são os termos com que esta indicação foi enviada em {date}. Eles não podem ser alterados … | Estes são os termos desta indicação. Eles não podem ser alterados para esta indicação, a menos que as duas organizações peçam por escrito ao Workatent antes da contratação. As regras da rede são um rascunho pendente de revisão jurídica. |

Still ⚖️ draft (frozen terms, amendment rule). Owner: frontend-engineer (JSON in 3 locales + the call site). After that, I'll update the §5.6 row in the spec.

---

## Polish

### Accuracy after an amendment (same root cause as B1, lower stakes)

**P1.** `referrals.hire.descriptionSnapshot`: **en only** (fr/pt already say "this referral's terms"). The hire dialog's Terms box shows "Amended on…" when there's an amendment.
- en, current: "Creates the placement from the terms this referral was submitted under. Commission stays projected until the client's payment is verified."
- en, proposed: "Creates the placement from this referral's terms. Commission stays projected until the client's payment is verified."

**P2.** `referrals.detail.agreement.pendingSnapshot`: the agreement is created from `app.effective_terms_version`, so an amendment recorded before acceptance is the one used.

| Locale | Current | Proposed |
|---|---|---|
| en | Created when the hiring recruiter accepts, from the terms and split this referral was submitted under. The split is frozen for this referral. | Created when the hiring recruiter accepts, from this referral's terms and the split in force when it was submitted. The split is frozen for this referral. |
| fr | Créée lorsque le recruteur du poste accepte, à partir des conditions et du partage en vigueur à la soumission. Le partage est figé pour cette recommandation. | Créée lorsque le recruteur du poste accepte, à partir des conditions de cette recommandation et du partage en vigueur à la soumission. Le partage est figé pour cette recommandation. |
| pt | Criado quando o recrutador da vaga aceitar, com os termos e a divisão vigentes no envio. A divisão fica congelada para esta indicação. | Criado quando o recrutador da vaga aceitar, com os termos desta indicação e a divisão vigente no envio. A divisão fica congelada para esta indicação. |

**P3.** `referrals.detail.terms.newerOnJob` on an amended referral reads "This referral keeps version 2", but the referral now runs on its amendment. Either hide the line when `terms.amended`, or add a key for that case (**new**):

| Key | en | fr | pt |
|---|---|---|---|
| `referrals.detail.terms.newerOnJobAmended` | This job's terms are now version {current}. This referral keeps its amended terms. | Les conditions de ce poste en sont maintenant à la version {current}. Cette recommandation conserve ses conditions modifiées. | Os termos desta vaga estão agora na versão {current}. Esta indicação mantém os termos alterados. |

### Glossary drift in existing keys now shown on N2 flows

**P4.** Legacy branch of `ReportHireDialog` (`LegacyFields` + the dialog description). These keys are pre-N2, but they appear right under the N2 "Terms not recorded" alert. The glossary marks "contracted fee" and "replacement guarantee (as the field)" as avoid, fr ledger "Projected" is *prévue* (not *projetée*), and "frozen" is for the split only.

| Key | Locale | Current | Proposed |
|---|---|---|---|
| `referrals.hire.description` | en | Creates the placement using the frozen agreement. Commission stays projected until the client payment is verified. | Creates the placement from the fee, currency and guarantee you enter. Commission stays projected until the client's payment is verified. |
| | fr | Crée le placement selon l'entente figée. La commission reste projetée jusqu'à ce que le paiement du client soit vérifié. | Crée le placement à partir des honoraires, de la devise et de la garantie que vous entrez. La commission reste prévue jusqu'à ce que le paiement du client soit vérifié. |
| | pt | Cria a colocação usando o acordo congelado. A comissão fica prevista até o pagamento do cliente ser verificado. | Cria a colocação com a taxa, a moeda e a garantia que você informar. A comissão fica prevista até o pagamento do cliente ser verificado. |
| `referrals.hire.fee` | en / fr / pt | Contracted placement fee / Honoraires de placement convenus / Taxa de colocação contratada | Placement fee / Honoraires de placement / Taxa de colocação |
| `referrals.hire.guarantee` | en / fr / pt | Replacement guarantee (days) / Garantie de remplacement (jours) / Garantia de reposição (dias) | Guarantee (days) / Garantie (jours) / Garantia (dias) |

Note for QA: `tests/e2e/journey.spec.ts` looks up "Contracted placement fee" by label (frontend.md, Server behaviour gaps). Update it together with this change.

**P5.** `commissions.detail.flashCreated` is shown after every hire, snapshot hires included.
- en: "Placement created from the frozen agreement. Next: record the client invoice." → "Placement created. Next: record the client invoice."
- fr: « Placement créé à partir de l'entente figée. Prochaine étape : enregistrer la facture au client. » → « Placement créé. Prochaine étape : enregistrer la facture au client. »
- pt: "Colocação criada a partir do acordo congelado. Próximo passo: registrar a fatura do cliente." → "Colocação criada. Próximo passo: registrar a fatura do cliente."

**P6.** `commissions.kpi.owed` is on the same page as N2's negative shares. Voice §4 bans "owe" there.
- en "You owe partners" → "To pay partners"
- fr « Dû aux partenaires » → « À verser aux partenaires »
- pt "Você deve a parceiros" → "A repassar a parceiros"

`owedHint` can stay.

**P7.** `jobs.detail.visible.compensation`: in N2, `share_salary` controls the band **and** the fee estimate, and the glossary says "salary band" in new copy.
- en "Compensation" → "Salary band and fee estimate"
- fr « Rémunération » → « Fourchette salariale et estimation des honoraires »
- pt "Remuneração" → "Faixa salarial e estimativa da taxa"

Same wording as the switch label `jobs.form.terms.shareSalary`, without the verb.

### Admin

**P8.** `admin.referralTerms.meta.delivered` (fr, pt): the label is a date prefix, so an undelivered referral reads « Transmise le / Non transmise » and "Entregue em / Não entregue".
- fr « Transmise le » → « Transmission »
- pt "Entregue em" → "Entrega"

en "Delivered" works for both values.

**P9.** `admin.referralTerms.meta.viewPlacement` is unused, because admins have no placement route (frontend.md). Keep it if N3 adds the link; otherwise remove it in all three locales.

**P14.** Forged-value messages in the admin amendment say "…to open this job to partner referrals", which doesn't fit an amendment.
- `src/features/admin/actions.ts` uses `jobs.errors.termsIncomplete` for an off-list `guaranteeDays` and a missing `flatCurrency` → use `errors.invalidFields`, as §5.3 says for forged values.
- The RPC's `terms_incomplete` maps to `errors.terms_incomplete` in admin context. That's only reachable when forged, so it's acceptable, but the action could map it to `errors.invalidFields` for this call.

Owner: backend/frontend. This changes message keys only.

### Stale keys

**P10.** These keys appear unused since `CommissionFields` was deleted: grep finds no reference in `src/`, so frontend should confirm before removing them. Several use wording the glossary now avoids ("Expected placement fee", *prévus*, "Compensation band"). Remove them from en, fr and pt together.
- `jobs.form.commission`, `commissionHint`, `feeMode`, `feeModeAmount`, `feeModePercent`, `feePercent`, `feePercentHint`, `feePercentNoSalary`, `feeEffectivePercent`, `splitPreview`, `splitPreviewHint`, `shareSalary`, `shareFee`, `expectedFee`, `expectedFeeHint`, `feeCurrency`;
- `jobs.detail.placementFee`, `jobs.detail.visible.placementFee`.

Keep `jobs.form.splitJobOwner`, `splitSourcing` and `splitPlatform`: the S1 preview still uses them (`terms-fields.tsx:259`), and that reuse is fine.

### Accessibility and composition

**P11.** Character counters are concatenated onto hints: `report-hire-dialog.tsx:244` (`${noteHint} ${n}/500`) and `amend-terms-form.tsx:165` (`${reasonHint} ${n}/1000`). Screen readers read "37 slash 1000" as part of the hint on every focus. The admin hint also says "1,000" (en) or "1.000" (pt) while the counter says "1000".

Proposed **new** key, rendered as its own `aria-live="off"` element with `f.number()`:

| Key | en | fr | pt |
|---|---|---|---|
| `common.charCount` | {count} of {max} characters | {count} caractères sur {max} | {count} de {max} caracteres |

The visual can stay compact ("37/1,000") if the sr text uses the key.

**P12.** Pipeline card (`pipeline-board.tsx:334`): the "Fee terms" label exists only as a `title` attribute, so touch and screen-reader users get a bare "20% of base". Add `<span className="sr-only">{tg("jobs.detail.feeTerms")}: </span>` before the value. Uses an existing key.

**P13.** Internal referrals: `ExpectedShareRow` puts the whole `referrals.detail.agreement.internal` paragraph (two sentences) in a `dl` value. A short value would fit the row better (**new**):

| Key | en | fr | pt |
|---|---|---|---|
| `jobs.terms.internalShare` | No sourcing recruiter share (internal referral) | Aucune part pour le recruteur d'origine (recommandation interne) | Sem parte para o recrutador de origem (indicação interna) |

### Notifications and the stale-dialog gap

**P15.** Backend wrote the notification **titles** in SQL, and §5.10 didn't list them. They're neutral and match the glossary, so I approve the en as shipped. Here are fr/pt for N7's localized pipeline; I'll add them to §5.10.

| Kind | Title en (SQL, approved) | fr-CA (N7) | pt-BR (N7) |
|---|---|---|---|
| `job.terms_changed` | Job terms updated | Conditions du poste mises à jour | Termos da vaga atualizados |
| `placement.fee_difference` | Invoiced fee differs from the computed fee | Honoraires facturés différents des honoraires calculés | Taxa faturada diferente da taxa calculada |
| `referral.terms_amended` | Referral terms amended | Conditions de la recommandation modifiées | Termos da indicação alterados |

**P16.** An amendment doesn't bump `referrals.version`. As a result, a hire dialog opened before an amendment can still submit afterwards. `reportHire` validates against the new terms, so the hire is recorded at a computed fee the user never saw. In the worst case (% → flat), the posted base is silently ignored. This is a trust problem, not a wording one.

Suggestion for backend/frontend: post the effective terms version the dialog rendered, and refuse when it no longer matches, with a new code `hire_terms_changed` (**new**, `errors`). This is the one place where dedicated copy is worth it:

| Key | en | fr | pt |
|---|---|---|---|
| `errors.hire_terms_changed` | This referral's terms were amended while this form was open. Refresh the page to see the new terms, then report the hire again. | Les conditions de cette recommandation ont été modifiées pendant que ce formulaire était ouvert. Actualisez la page pour voir les nouvelles conditions, puis déclarez l'embauche de nouveau. | Os termos desta indicação foram alterados enquanto este formulário estava aberto. Atualize a página para ver os novos termos e informe a contratação de novo. |

Nothing was recorded, the message gives no id, and it doesn't name the other organization.

---

## Noted, not counted (outside N2)

- Pre-N2 fr keys use an ASCII space before `:` or inside « » (for example `opportunities.card.yourCandidate`, `referrals.detail.disclosed`, `commissions.detail.disputeOpen`, `admin.organizations.description`). This belongs in the next app-wide audit (`docs/content/copy-audit.md`).
- `errors.generic` / `errors.invalidFields` (en, fr) start with "Please" / « Veuillez », against voice §4. App-wide.
- Admin pages outside N2 (`/admin` revenue line, disputes, evidence, organization placements) show amounts without the ISO code. That's acceptable under §6.6, but `contracted_fee_minor` is now the invoiced fee (I). If those pages ever show C next to it, they need the N2 code display.

## Legal review (⚖️)

- B1 changes ⚖️ draft text (frozen terms and amendment rule). The meaning is the same and it's now accurate in the amended case. It still goes to counsel with the rest of brief §8.3.
- No other N2 legal wording changes. The network rules, direct-client statement, floor wording and amendment description ship as drafts, unchanged.
