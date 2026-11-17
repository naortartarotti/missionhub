# Copy review: duplicate-prior-presentation (N1)

Reviewer: ux-writer-marketing · 2026-11-15
Scope: shipped strings in `src/i18n/messages/{en,fr,pt}` (`referrals`, `labels`, `candidate`, `jobs`, `admin`, `errors`, `emails`), backend-added keys, `referrals.detail.adminActor`, `referrals.claim.file.uploading`, the in-app notification text in `supabase/migrations/20261113*.sql`, and JSX in the N1 components (`submit-referral-form.tsx`, `claim-dialog.tsx`, `claim-panel.tsx`, `release-dialogs.tsx`, `review-queue.tsx`, `referrals/[referralId]/page.tsx`, `candidate/[token]/page.tsx`, `admin/disputes/page.tsx`, `referral-dispute-controls.tsx`).
JSON and code were not edited.

## Verdict

**No blocking findings. 12 polish items.**

### What was checked and passes

- **Matches §5 word for word.** I compared all §5.1 to §5.10 keys in en, fr and pt: the composer, referral page, withdraw and release, queue and objection form, objection panel and contest, deadlines, candidate page, errors, job form, admin, labels and emails. Every key exists in all three locales and matches §5 exactly.
- **Glossary.** UI keys use objection / objection / objeção, prior presentation / présentation antérieure / apresentação anterior, release / libérer / liberar and first position / priorité / prioridade everywhere. "Claim" never appears in user-facing text. The only glossary slips are in duplicate server-side validation keys (P3).
- **BR-9 neutrality.** `referrals.duplicate.stopTitle`, `message`, `stopNext` and the support line are the same for every stop. `StopState` adds no conditional wording; it uses the `Info` icon and neutral styling. `supportSubject` carries only `{reference}`. `detail.next.alreadyPresentedBody`, `candidate.states.already_sent.body` and the `referral.already_presented` notification name only the submitter's own partner and "this client" (or "{job}" for the candidate).
- **No ids or internal details in errors.** All new `errors.*` strings are free of ids, codes, org names and existence hints. `toActionError` maps unknown codes to `errors.generic`, and the raw message goes only to the server log. A refused evidence upload returns `claim_not_allowed` whatever the cause.
- **Plurals.** `deadline.left`, `claim.file.waiting`, `claim.file.selectedSr`, `admin.flags.stops` and `admin.flags.rejectedClaims` have `{count}` in both branches in all locales.
- **fr typography.** Every N1 key in `referrals`, `admin`, `labels`, `emails` and `jobs` has a non-breaking space before `:` and inside `« »`. Questions end in `?` with no space, which is the project's fr-CA convention. The one exception is a backend key (P1).
- **`referrals.claim.file.uploading`.** "Uploading…" / "Téléversement…" / "Carregando arquivo…" match §5 with no `{percent}`. The indeterminate progress bar uses the same string for `aria-label` and `aria-valuetext`.
- **`referrals.detail.adminActor`.** "Workatent admin" / "Administration Workatent" / "Admin do Workatent" are fine. The fr collective noun avoids gender agreement. It's distinct from `systemActor` ("Workatent"), and `page.tsx:189` picks it from `actor_kind = "admin"`. No change.
- **SQL in-app notifications (PD-026, English only).** All four titles match §5.10 exactly: "Referral not delivered: already presented", "Prior-presentation objection on your referral", "Objection contested", and "Objection upheld" / "Objection rejected". The bodies match too, with "The partner" / "the partner" as the fallback when the org name is missing. The latest definitions are in `20261113000400`, `0600`, `0800` and `0900`; `001000` and `001100` don't change them.
- **Hard-coded JSX text.** None in the N1 components; every visible string goes through `t()` / `tg()`. The only literals are the `“ ”` around quotes on the admin card (P8).
- **Toasts.** The objection form overrides the server message with `claim.messages.filed`, including `{partner}` and `{when}` (`claim-dialog.tsx:263`). Contest uses `contest.messages.contested`. `success.withdrawn` is shown only from `WithdrawDialog`, which renders only while the referral still counts, so the "keeps first position" claim is true.
- **Stable codes `invalid_token`, `conflict`, `failed`.** These aren't in `CODES`, so they show `errors.generic` ("Something went wrong. Please try again."). They only happen on internal faults (token collision, unique violation, unexpected failure), and a generic message without detail is correct there. No new keys needed. `rate_limited` maps to `errors.rateLimited`. `reason_required`, `claim_already_filed` and `dispute_already_open` map to their existing or §5 strings.

---

## Blocking

None.

---

## Polish

### P1. fr: regular space before a colon in a backend error
`src/i18n/messages/fr/errors.json` : `claim_evidence_invalid`

| | Text |
|---|---|
| Current | `Ajoutez une pièce justificative␣: au moins un fichier, ou une recommandation antérieure.` (U+0020 before `:`) |
| Proposed | `Ajoutez une pièce justificative : au moins un fichier ou une recommandation antérieure.` (U+00A0 before `:`; comma before "ou" dropped, as in the other fr strings) |

### P2. "Under 2,000" is wrong: 2,000 characters are allowed
`errors.json` : `claim_note_too_long` (all locales). The textarea and schema allow up to 2,000 characters inclusive.

| Locale | Current | Proposed |
|---|---|---|
| en | Keep the note under 2,000 characters. | Keep the note to 2,000 characters or less. |
| fr | La note doit faire moins de 2 000 caractères. | La note doit faire 2 000 caractères ou moins. (U+00A0 in "2 000") |
| pt | A nota deve ter menos de 2.000 caracteres. | A nota deve ter no máximo 2.000 caracteres. |

### P3. Duplicate server validation keys break the glossary in fr and pt
`referrals.json` : `validation.evidenceRequired`, `validation.priorDateRequired`. These come from `fileClaimSchema` (`schemas.ts:94–99`). Today `claim-dialog.tsx:248–253` swaps them for `claim.validation.*`, so users don't see them. But any other caller of `fileClaim` would. Make them match the §5 strings.

| Key | Locale | Current | Proposed (= `claim.validation.*`) |
|---|---|---|---|
| `validation.evidenceRequired` | en | Add at least one piece of evidence | Upload at least one file, or pick an earlier referral |
| | fr | Ajoutez au moins une **preuve** | Téléversez au moins un fichier ou choisissez une recommandation antérieure |
| | pt | Adicione pelo menos uma **prova** | Anexe pelo menos um arquivo ou escolha uma indicação anterior |
| `validation.priorDateRequired` | en | Enter the date the candidate was last in process with this client | Enter the date |
| | fr | …était **en processus** avec ce client pour la dernière fois | Entrez la date |
| | pt | …esteve **em processo** com este cliente | Informe a data |

(Glossary: fr *pièce justificative* / *en processus de recrutement*; pt *comprovante* / *processo seletivo*.) A simpler fix is to point the schema at the `claim.validation.*` keys and delete these two.

### P4. Two different wordings for the same attestation error
`referrals.json` : `validation.attestationRequired` and `errors.json` : `claim_attestation_required` both say "Confirm that the information is true and accurate." The inline §5 key `claim.validation.attestationRequired` says "Confirm the statement to file the objection". Use one message.

| Key | Locale | Proposed |
|---|---|---|
| both | en | Confirm the statement to file the objection. |
| | fr | Cochez la confirmation pour déposer l'objection. |
| | pt | Marque a confirmação para registrar a objeção. |

### P5. Server toast keys that never show
`referrals.json` : `success.claimFiled` ("Objection filed.") and `success.contested`. Both actions return them, but the client replaces them with `claim.messages.filed` and `contest.messages.contested`. No change needed for users. To avoid a short toast showing up if the override is ever removed, either delete these keys and return no message, or have `fileClaim` return `claim.messages.filed` with `{partner, when}`. Backend's choice.

### P6. Wrong status line for a failed upload (network or size)
`claim-dialog.tsx:204–205` treats `failed` like `rejected`, so the footer says `claim.file.removeRejected` ("To continue, remove the file that can't be used"). But that row offers **Try again**, and the file itself is fine. Add a key and use it when only `failed` rows block the button:

| Key (new) | en | fr-CA | pt-BR |
|---|---|---|---|
| `referrals.claim.file.retryOrRemove` | To continue, try the upload again or remove the file | Pour continuer, réessayez le téléversement ou supprimez le fichier | Para continuar, tente carregar de novo ou remova o arquivo |

(frontend adds the key in all three locales; I'll add it to the §5.4 table.)

### P7. Deadline passes during an upload: the row and the error disagree
`claim-dialog.tsx:129–131`. When `register_claim_evidence` returns `claim_window_closed`, the top error correctly says the deadline passed. But the file row shows "Upload didn't finish." with **Try again**, which can't succeed. And because `windowClosed: false`, **Back to decline reasons** isn't offered, which §2.4 requires. Proposed behaviour, with no new strings: set `windowClosed` with the same prefix check used in `submit`, and mark that row `rejected` instead of `failed` so it shows "This file can't be used. Remove it to continue." without Try again.

### P8. Hard-coded English quote marks on the admin card
`src/app/admin/disputes/page.tsx:152` (note) and `:159` (contest reason). `:93` (closed list) does the same; that line predates N1 but uses the same fix. `“{…}”` renders in fr, where it should be `« … »`. Use a localized key, following `referrals.detail.reasonQuote`:

| Key (new) | en | fr-CA | pt-BR |
|---|---|---|---|
| `admin.disputes.quote` | “{text}” | « {text} » (U+00A0 inside) | “{text}” |

### P9. The admin referral column reuses a toast and a bare pill label as status lines
`src/app/admin/disputes/page.tsx:210–217`. The released flag shows `referrals.success.released` ("Candidate released for this client."), which is a toast sentence. The upheld flag shows `labels.claimStatus.upheld` ("Upheld"), which has no subject next to the referral-status pill. Add:

| Key (new) | en | fr-CA | pt-BR |
|---|---|---|---|
| `admin.disputes.claim.flagReleased` | Candidate released by the sourcing side | Candidat libéré par le recruteur d'origine | Candidato liberado pelo recrutador de origem |
| `admin.disputes.claim.flagUpheld` | Earlier objection upheld | Objection antérieure retenue | Objeção anterior mantida |

(The already-presented flag can stay `labels.referralStatus.already_presented`.)

### P10. `admin.messages.claimResolved` doesn't name the outcome, and fr uses a different word
`admin.json` : `messages.claimResolved` (backend-added). The toast doesn't say which decision was recorded, and fr "Litige fermé" differs from the existing `messages.disputeClosed` "Litige clos". Proposed: split by outcome (`resolveReferralDispute` knows `claim_upheld`):

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `admin.messages.claimUpheld` (new) | Objection upheld. Both organizations were notified. | Objection retenue. Les deux organisations ont été avisées. | Objeção mantida. As duas organizações foram notificadas. |
| `admin.messages.claimRejected` (new) | Objection rejected. The referral is back in review, and both organizations were notified. | Objection rejetée. La recommandation est de nouveau en examen, et les deux organisations ont été avisées. | Objeção rejeitada. A indicação voltou para análise, e as duas organizações foram notificadas. |

If the split isn't wanted, at least change fr `claimResolved` to "Litige clos. Les deux organisations ont été avisées."

### P11. The resolution validation limit lacks a thousands separator
`admin.json` : `validation.resolution`. This key predates N1, but it's now the error for the objection resolution (5 to 2,000 characters).

| Locale | Current | Proposed |
|---|---|---|
| en | Describe the resolution (5–2000 characters). | Write a resolution of 5 to 2,000 characters. |
| fr | Décrivez la résolution (5 à 2000 caractères). | Rédigez une résolution de 5 à 2 000 caractères. (U+00A0 in "2 000") |
| pt | (same pattern) | Escreva uma resolução de 5 a 2.000 caracteres. |

### P12. `errors.duplicate_referral` is still reachable on submit. Confirm it's in line with BR-9
`supabase/migrations/20261113000400_presentation_submit.sql:74–80` raises `duplicate_referral` when the **same candidate record** already has a live referral to **this job**. The user then sees "This candidate has already been submitted to this job." instead of the neutral stop. This leaks nothing: it concerns the submitter's own record, which is visible in their Sent list. But it does tell them it's this job and their own referral, and §2.1 says the response is the same whether the earlier referral came from the submitter's org or not. **Question for product-designer and PM:** is a resubmission of the same record outside BR-9? If yes, keep it and make the copy actionable:

| Locale | Proposed `errors.duplicate_referral` |
|---|---|
| en | You already submitted this candidate to this job. Open it from your sent referrals. |
| fr | Vous avez déjà soumis ce candidat à ce poste. Retrouvez la recommandation dans vos recommandations envoyées. |
| pt | Você já enviou este candidato para esta vaga. Veja a indicação nas suas indicações enviadas. |

If no, backend should return `stopped` for this case too, and the copy stays as it is.

---

## Outside N1 (not counted)

- fr question-mark spacing is inconsistent across the app. N1 and `referrals` use `?` with no space (fr-CA), but `connectors.json:283, :334` use ` ?`. That belongs in the app-wide audit (`docs/content/copy-audit.md`).

## Glossary

No new terms. The new keys proposed in P6 to P10 use existing glossary words.

## Legal

No change to the ⚖️ draft strings (C-1, C-3, C-5, C-6). They shipped exactly as written in §5 and still need counsel sign-off before the draft markers come off. Affected keys: `referrals.duplicate.message`, `referrals.form.methodRecordedHint`, `referrals.withdraw.description` / `release` / `releaseHint` / `releaseConfirmDescription`, `referrals.release.description` / `confirmDescription`, `referrals.claim.attestation`, `candidate.consent`, `admin.dispute.languageHint`.
