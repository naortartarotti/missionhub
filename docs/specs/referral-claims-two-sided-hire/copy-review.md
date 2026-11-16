# Copy review: N3 referral-level claims and two-sided hire reporting

- **Reviewer:** UX Writer & Marketing · **Date:** 2026-11-16
- **Against:** `spec.md` §5 (rev. 2.1, incl. new §5.11), `docs/content/voice-and-tone.md` §5.8, `frontend.md` §D2.
- **Verdict:** **no blockers.** One major (wrong minimum in a validation message) is fixed in the JSON and needs a one-line rewiring by frontend/backend. Everything else is fixed or minor.

## What I checked

| Check | How | Result |
|---|---|---|
| ~45 frontend-drafted strings (frontend.md §D2.2) | Read en / fr / pt values in `referrals.json` and `admin.json` | 12 changed in JSON, the rest approved. All now in spec §5.11 |
| §5 keys that are both label and value group | spec §5.8 vs JSON | §5 updated to `….label` + value keys (`clientConfirmation`, `finding`, `requestedBy`) |
| `admin.validation.resolution` minimum | grep of `src/` | 5 is used by N1 and placement disputes; 20 by hire-report and auth-check decisions → new key `admin.validation.resolutionLong` |
| Hard-coded JSX text | grep for JSX text nodes, literal strings in braces, `aria-label` / `title` / `placeholder` / `alt` literals in `src/features/hire-reports/**`, `hire-report-admin.tsx`, `src/app/admin/hire-reports/**`, `report-hire-dialog.tsx` | None. Only `placeholder="https://"` (a format example, fine in all locales) and enum defaults. One string concatenation (finding 4) |
| Hiring / sourcing wording | grep for "source org", "job owner", "hiring side", "sourcing side", *organisation d'origine*, *organização de origem* in N3 member and admin strings | One N3 drift fixed (finding 6). "Hiring side" / "sourcing side" stays in admin-only strings (glossary §5.7). The remaining *organisation d'origine* hits are N2 admin amendment keys, out of scope |
| Glossary terms | hire report / record a hire / statement / rebuttal / void across the N3 keys | Consistent after the §5 pass and the drift fixes in the previous follow-up |
| fr length | character counts against the layouts in `frontend.md` §D2.1 | See "fr length risks" below |

## Findings

| # | Severity | File:key | Current | Proposed / done | Status |
|---|---|---|---|---|---|
| 1 | **Major** | `admin.validation.resolution` (en/fr/pt), used by the hire-report and auth-check decision forms | "Write a resolution of 5 to 2,000 characters." shown when the form needs 20 | New `admin.validation.resolutionLong`: "Write a resolution of 20 to 2,000 characters." / « Rédigez une résolution de 20 à 2 000 caractères. » / "Escreva uma resolução de 20 a 2.000 caracteres." The old key stays for disputes (minimum 5) | **Key added.** Wiring: `src/features/admin/actions.ts` lines 236, 286 (backend); `hire-report-admin.tsx` lines 156, 368 (frontend) |
| 2 | Minor | `referrals.hireReport.panel.rows.tail` | "Tail statement" / « Déclaration sur le délai » / "Declaração sobre o prazo" | "Selection process start" / « Début du processus de sélection » / "Início do processo seletivo". "Tail" is team jargon, and fr *déclaration* and pt *declaração* collide with the hire report and the attestation | Fixed |
| 3 | Minor | `referrals.hireReport.panel.rows.learnedVia` | "How they learned" / « Comment ils l'ont appris » / "Como souberam" | "How the sourcing recruiter learned" / « Comment le recruteur d'origine l'a appris » / "Como o recrutador de origem soube". "They" is unclear when the sourcing side reads its own report | Fixed |
| 4 | Minor | `hire-report-admin.tsx` line 392: `{t("authCheck.evidenceDue")}: {…}` | Label + colon + date joined in JSX: no space before the fr colon, no reordering in fr/pt | New `admin.authCheck.evidenceDueAt`: "Evidence due {when} ET" / « Pièces justificatives attendues d'ici le {when} HE » / "Comprovantes até {when} (horário de Toronto)" | **Key added.** Frontend to wire |
| 5 | Minor | `admin.hireReports.detail.legacy` | "Legacy referral (terms not recorded): {value}" (fr/pt similar) | The glossary's legacy label: "Terms not recorded (sent before the terms card): {value}" + fr/pt equivalents. "Legacy" isn't a glossary term | Fixed |
| 6 | Minor | `admin.authCheck.candidateContacted` ⚖️ Q-4 | "Candidate contacted through an identifier the source org didn't set" | "I contacted the candidate through contact details the sourcing recruiter didn't provide" / « J'ai joint le candidat par des coordonnées que le recruteur d'origine n'a pas fournies » / "Contatei o candidato por um contato que o recrutador de origem não forneceu". Removes "source org" and "identifier"; it's a checkbox, so first person | Fixed |
| 7 | Minor | `admin.hireReports.detail.note`, `detail.adminFields` | "Internal note", "Admin fields" | "Admin note" (same as `admin.hireRecord.note`), "Admin follow-up" + fr/pt | Fixed |
| 8 | Minor | `referrals.hireReport.validation.role` | "Enter the role (120 characters or fewer)" on an **optional** field | "Use 120 characters or fewer for the role" + fr/pt. Doesn't imply that the field is required | Fixed |
| 9 | Polish | `referrals.hireReport.validation.attestation` (en) | "Tick the box to confirm" | "Check the box to confirm" (Canadian English, §6.10) | Fixed |
| 10 | Polish | fr typography, N3 keys I wrote earlier | `hire.startRange` and `admin.validation.resolutionLong` had regular spaces where the file uses U+00A0 | Written as ` ` escapes in the JSON | Fixed |
| 11 | Polish, app-wide | fr files | The fr JSON mixes U+00A0 and regular spaces before « : » and inside « » (older keys use regular spaces, newer N3 keys use U+00A0) | Normalize in one app-wide pass (or in the renderer), not key by key. Logged for `docs/content/copy-audit.md` | Open, not N3 |
| 12 | Polish, marketing | `landing.projectedBody` (en/fr/pt) | "Hire reported with fee and start date" | "Hire recorded with fee and start date" (hiring-side action). Left for a marketing pass | Open, not N3 |

## fr length risks (not visually verified, frontend.md gap 13)

- **Panel row labels** (`dl`, `12rem` label column from `sm`): `rows.learnedVia` fr is 41 characters, and `detail.legacy` fr is 85 characters before `{value}`. Both wrap to two lines in 12rem; acceptable because the column doesn't clamp. Check at 640–768 px.
- **Buttons** (from §5.10): `panel.confirm` (35), `commissions.feePending.enter` (33), `authCheck.request` (43) in fr must wrap, not truncate.
- **Admin auth-check checkbox** `authCheck.candidateContacted`: fr is 87 characters. It's a checkbox label (`text-pretty`), so it wraps; make sure the 44 px target covers the whole label.
- **Status chip** `labels.placementStatus.fee_pending` fr (33): wrap to two lines.

## Legal items (⚖️, unchanged by this review except where noted)

- **Q-4:** `admin.authCheck.candidateContacted` (reworded here; admin contact with the candidate), `hireReport.filesHint`, `authCheck.requestBody`, `admin.hireReports.candidateContactedHint`, `admin.authCheck.invalidBody`.
- **RD-029 voiding:** `admin.authCheck.status.invalid` ("Invalid: referral void"), plus the §5 void rows.
- **Q-1, Q-2, Q-3, 4.8, 7.2, 7.5, N7:** as listed in spec §5. No new legal wording was added in this review.

## Not verified

- **JSON validity:** I have no shell in this run, so I couldn't run `node -e 'JSON.parse(…)'`. Each edit replaced or inserted whole lines that end with a comma inside an existing object, and I re-read every edited region. Frontend: run `npm run typecheck` (fr and pt are typed against en) or a `JSON.parse` over `src/i18n/messages/*/{referrals,admin}.json`.
- **On-screen check** at 375 px, fr, light and dark (frontend.md gap 13).
