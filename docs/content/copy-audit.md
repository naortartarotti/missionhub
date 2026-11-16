# Copy audit: whole app

**Scope:** every namespace in `src/i18n/messages/{en,fr,pt}`, the marketing components in `src/features/landing/components`, and a scan of `src/app`, `src/features` and `src/server` for visible text that isn't in the message files. Checked against [`voice-and-tone.md`](./voice-and-tone.md) (glossary §5, mechanics §6).
**Status:** P0 (§1) and hard-coded 7.3 fixed on 2026-11-12. Everything else is findings only.
**Format:** `namespace:key` refers to `src/i18n/messages/<locale>/<namespace>.json`. If no locale is given, the finding applies to en, and fr and pt should be updated to match the glossary when en changes.

| Severity | Meaning | Count |
|---|---|---|
| **P0** | Wrong or misleading for users, leaks internal details, or breaks in a locale | 9 |
| **P1** | The same concept goes by different names (glossary violations) | 14 groups (~120 strings) |
| **P2** | Tone, clarity, jargon | 16 |
| fr-CA / pt-BR | Locale-specific grammar, anglicisms, SEO length (§4–5) | 8 / 6 |
| **P3** | Mechanics, typography, key naming | 13 |
| Hard-coded | Visible text outside the message files (§7) | 6 (2 need action) |
| ⚖️ | Needs legal review, or a product/human decision (§9) | 10 |

---

## 1. P0: fix first

> ✅ All nine fixed on 2026-11-12 with the proposed text, in en/fr/pt where applicable. The Mailpit hint already lives in the README.

| # | Where | Problem | Current → Proposed |
|---|---|---|---|
| 1.1 | `overview:gettingStarted.candidate.description` (en/fr/pt) | **Factually wrong.** Candidates are visible to the whole organization, as `candidates:list.emptyBody` and the landing page say. | "Add someone you represent, or import a list from a CSV. Only you can see them." → "Add someone you represent, or import a CSV. Only your organization can see them." · fr "… Seule votre organisation peut les voir." · pt "… Só a sua organização pode vê-los." |
| 1.2 | `auth:messages.resetSent` (en/fr/pt) | Developer instructions with a localhost URL reach production users. | "If an account exists for that email, a reset link is on its way. In local development, open Mailpit at http://127.0.0.1:55324." → "If an account exists for that email, a reset link is on its way." (Put the Mailpit hint in the README or a dev-only banner.) |
| 1.3 | `activity:emailOff` (en/fr/pt) | Shows an env var name to end users. | "Email delivery isn't configured (set RESEND_API_KEY). Notifications are in-app only; no emails have been sent." → "Email notifications are turned off for now. You'll find every update here." *(Only org admins should see a configuration hint, and it should point to Settings, not an env var.)* |
| 1.4 | `connectors:connect.foundJobs.one`, `connect.foundCandidates.one`, `connect.rejected.one`, `messages.uploaded.one` (**fr, pt**) | **Plural bug:** fr-CA and pt-BR use the `one` form for **0**, so "1 candidat trouvé" / "1 candidato encontrado" appears when 0 rows are found (`connect-form.tsx:154` falls back to candidates when `preview.jobs` is 0). | fr "1 offre trouvée" → "{count} poste trouvé" · "1 candidat trouvé" → "{count} candidat trouvé" · "1 ligne illisible" → "{count} ligne illisible" · "1 fiche importée." → "{count} fiche importée." · pt "1 vaga encontrada" → "{count} vaga encontrada" (same for the others). Update en to `{count}` too, for consistency. |
| 1.5 | `referrals:actions.cancelled` | The status action is labelled **"Cancel"**, and `actions.confirmTitle` "{label}?" makes the dialog read "Cancel?" with a "Cancel" button next to the confirm button. | "Cancel" → "Cancel referral" · fr "Annuler" → "Annuler la recommandation" · pt "Cancelar" → "Cancelar indicação" |
| 1.6 | `landing:privacy.subtitle`, `landing:privacy.mock.visible`, `landing:faq.items.a.a`, `landing:faq.items.b.a`, `admin:rules.jobOwner` (**fr**) | "Titulaire du poste" means the **employee who holds the job**, not the recruiter. The meaning is wrong on the public site. | "Le titulaire du poste voit…" → "Le recruteur du poste voit…" · "Ce que voit le titulaire du poste" → "Ce que voit le recruteur du poste" · "Les titulaires de postes voient…" → "Les recruteurs des postes voient…" · "au recruteur titulaire du poste" → "au recruteur du poste" · "Titulaire du poste %" → "Recruteur du poste %" |
| 1.7 | `labels:evidenceKind.platform_remittance`, `commissions:detail.recordPayout`, `commissions:detail.entryType.remittance`, `errors:remittance_exceeds_balance`, `admin:revenue.line` (**fr**) | "Remise" usually means **discount** in French, which is a dangerous misreading in a money screen. | "remise" → "versement à la plateforme" (e.g. "Enregistrer un versement / une remise" → "Enregistrer un versement"; entryType "remise" → "versement à la plateforme"; error "La remise dépasse…" → "Le versement à la plateforme dépasse le solde dû.") |
| 1.8 | `connectors:providers.bullhorn.description` | Unverified market claim. | "Bullhorn is one of the most used agency ATS. This connector is being built." → "This connector is being built." |
| 1.9 | `connectors:providers.bullhorn.does2` | Promises an unbuilt capability ("both ways"), while the page says MissionHub "never changes anything in the source". | "Will keep them in sync both ways." → "Will keep them in sync." |

---

## 2. P1: terminology (glossary violations)

> ✅ Applied on 2026-11-12 (2.1–2.14, en/fr/pt, plus `docs/product-flows.md`). Skipped rows: none. The leftovers outside the table (fr "preuve" ×4, pt "Livro-razão" and "Projetada", fr "offres" ×2, tenant "workspace" in `landing:privacy.features.isolation.body` and `admin:backToWorkspace`) were fixed the same day. "Workspace" now remains only in "Workspace URL" and the landing CTAs pending §9.1.

### 2.1 The tenant: organization / workspace / agency
One onboarding form uses three words: title "Name your workspace", field "Agency name", error "Enter your organization name". Also, organizations can be `independent` (`admin:orgs.kind`), so "agency" is wrong for some users.

| Key | Current → Proposed |
|---|---|
| `onboarding:titles.workspace` | "Name your workspace" → "Name your organization" |
| `onboarding:titles.company` / `companyNamed` | "Set up your agency" → "Set up your organization" · "Welcome, {name}! Set up your agency" → "Welcome, {name}! Set up your organization" |
| `onboarding:titles.companyDescription` | "This is your recruitment company on MissionHub…" → "This is your agency or recruiting business on MissionHub. Your recruiters join it by invitation, and its candidates and jobs are never visible to other organizations." |
| `onboarding:workspace.agencyName` / `agencyPlaceholder` | "Agency name" → "Organization name" (placeholder "e.g. Northbound Talent" can stay) |
| `onboarding:workspace.countryHint` | "Where your agency is based." → "Where your organization is based." |
| `onboarding:titles.workspaceDescription`, `review.protectionPrivate`, `review.creating`, `review.create`, `steps.workspace`, `review.workspace`, `review.editWorkspace`, `metaTitle` | "workspace" → "organization" ("Create workspace" → "Create organization"; "Set up your workspace" → "Set up your organization") — *pending the decision in §9.1* |
| `errors:notFound.home` | "Go to my workspace" → "Go to my dashboard" |
| `auth:signIn.subtitle` | "Sign in to your recruiter workspace." → "Sign in to MissionHub." |
| `connectors:description`, `connectors:messages.disconnected`, `connectors:connection.disconnectDescription`, `connectors:api.note2`, `connectors:providers.missionhub_api.description` | "your workspace" → "your organization" |
| `admin:orgs.description` | "Every workspace on the platform…" → "Every organization on MissionHub…" |
| `admin:orgs.search` | "Search by name or slug" → "Search by name or workspace URL" |
| `admin:orgDetail.slug` | "Slug" → "Workspace URL" |
| **pt** `common:demo.title` | "Espaço de demonstração" vs "workspace" (33×) → "Organização de demonstração" |

### 2.2 The two sides of a referral: sourcing recruiter / hiring recruiter
There are currently 7 en names (job owner, hiring recruiter, job recruiter, candidate recruiter, sourcing recruiter, referring partner, "Sourcing %"), 6 in fr and 6 in pt. "Owner" also means the member responsible for a record (`jobs:detail.owner`, `settings:team.transferTo`).

| Key | en current → proposed | fr → proposed | pt → proposed |
|---|---|---|---|
| `commissions:party.sourcing` / `job_owner` | "Sourcing recruiter" ✓ / "Job owner" → "Hiring recruiter" | "Recruteur source" → "Recruteur d'origine" / "Propriétaire du poste" → "Recruteur du poste" | ✓ / "Dono da vaga" → "Recrutador da vaga" |
| `referrals:detail.agreement.sourcing` / `jobOwner` | ✓ / "Job owner" → "Hiring recruiter" | "Recruteur source" → "Recruteur d'origine" / "Responsable du poste" → "Recruteur du poste" | ✓ / "Dono da vaga" → "Recrutador da vaga" |
| `referrals:detail.agreement.awaiting` | ✓ | "En attente du recruteur source" → "En attente du recruteur d'origine" | ✓ |
| `referrals:detail.agreement.pending`, `agreement.internal` | "the job owner" → "the hiring recruiter" | "responsable du poste" → "recruteur du poste" | "dono da vaga" → "recrutador da vaga" |
| `referrals:form.noteLabel`, `form.notePlaceholder`, `composer.noteTitle` | "Note to the job owner" → "Note to the hiring recruiter" | "Note au responsable du poste" → "Note au recruteur du poste" | "Nota para o dono da vaga" → "Nota para o recrutador da vaga" |
| `referrals:queue.agreementLine` | "Split: sourcing {sourcing} · you {owner} · platform {platform}" ✓ | "recruteur source" → "recruteur d'origine" | "indicador {sourcing}" → "origem {sourcing}" |
| `commissions:detail.sourcingConfirms` | ✓ | "Le recruteur source…" → "Le recruteur d'origine…" | ✓ |
| `commissions:forms.invoiceDescription` | "you (the job owner)" → "you (the hiring recruiter)" | "le propriétaire du poste" → "le recruteur du poste" | "dono da vaga" → "recrutador da vaga" |
| `jobs:form.splitJobOwner` / `splitSourcing` | "You (job owner) · {percent}" → "You (hiring recruiter) · {percent}" / "Referring partner · {percent}" → "Sourcing recruiter · {percent}" | "propriétaire du poste" → "recruteur du poste" | "dono da vaga" → "recrutador da vaga" |
| `admin:rules.sourcing` / `jobOwner` / `split` | "Sourcing %" → "Sourcing recruiter %" / "Job owner %" → "Hiring recruiter %" / "Candidate / Job / Platform" → "Sourcing / Hiring / Platform" | "Recrutement %" → "Recruteur d'origine %" | "Captação %" → "Recrutador de origem %" / "Dono da vaga %" → "Recrutador da vaga %" |
| `admin:orgDetail.sourcing` / `jobOwner` | "Candidate recruiter" → "Sourcing recruiter" / "Job recruiter" → "Hiring recruiter" | "Recruteur du candidat" → "Recruteur d'origine" | "Recrutador do candidato" → "Recrutador de origem" |
| `landing:commissions.split.source` / `job` | "Candidate recruiter" → "Sourcing recruiter" / "Job recruiter" → "Hiring recruiter" | "Recruteur du candidat" → "Recruteur d'origine" | "Recrutador do candidato" → "Recrutador de origem" |
| `landing:privacy.subtitle`, `privacy.mock.visible`, `faq.items.a.a`, `pages.privacy.description` | "Job owners…" → "Hiring recruiters…" | see 1.6 | "Quem tem a vaga / dono da vaga" → "recrutador da vaga" |
| `landing:faq.items.b.a` | "the recruiter who sourced the candidate / the recruiter who owns the job" → "the sourcing recruiter / the hiring recruiter" | see 1.6 | "recrutador que trouxe o candidato / recrutador dono da vaga" → "recrutador de origem / recrutador da vaga" |

### 2.3 Candidate authorization: permission / authorization / consent
54 strings say "authorization", 25 say "permission" and 6 say "consent" for the same records (`candidate_consents`). Also, "documented consent" is inaccurate, because the legal basis may be contract or legitimate interest.

| Key | Current → Proposed |
|---|---|
| `candidates:consent.processing` | "Permission to represent and match" → "Matching authorization" · fr "Autorisation de jumelage" · pt "Autorização de matching" |
| `candidates:consent.jobSharing` | "Permission to share for one job" → "Sharing authorization (one job)" · fr "Autorisation de partage (un poste)" · pt "Autorização de compartilhamento (uma vaga)" |
| `candidates:detail.permission`, `setup.stepPermission`, `setup.stepPermissionLink`, `setup.stepMatchingLocked`, `consent.none`, `consent.revokeTitle`, `consent.revokeConfirm`, `consent.recordTitle`, `consent.save`, `list.notMatchingHint`, `new.description`, `detail.created`, `errors.permissionRequired` | "permission" → "authorization" (e.g. "Record permission" → "Record authorization"; "Revoke this permission?" → "Revoke this authorization?"; "Save permission" → "Save authorization") · fr "permission" → "autorisation" · pt "permissão" → "autorização" |
| `opportunities:empty.inactive.description`, `opportunities:evidence.permissionMissing`, `overview:gettingStarted.matching.description` | "permission" → "matching authorization" |
| `landing:privacy.features.consent.title` | "Documented consent" → "Documented authorization" · fr "Autorisations consignées" · pt "Autorização documentada" |
| `landing:privacy.subtitle` | "with documented consent for that specific role" → "with the candidate's documented authorization for that specific job" |
| `landing:pages.privacy.description` | "records consent" → "records each candidate's authorization" |
| `landing:how.steps.one.body` | "Record the candidate's processing authorization, then activate them for matching." → "Record the candidate's matching authorization, then turn on matching." |

Keep "permission" where it means *user access rights* (`errors:forbidden`, `errors:page.forbiddenBody`) and in the brand adjective "permission-based" (`landing:footer.tagline`, `auth:app.description`).

### 2.4 Referral vs submission

| Key | Current → Proposed |
|---|---|
| `referrals:empty.received.title` | "No submissions received yet" → "No referrals received yet" · fr "Aucune soumission reçue…" → "Aucune recommandation reçue pour l'instant" · pt "Nenhum envio recebido ainda" → "Nenhuma indicação recebida ainda" |
| `referrals:caption.received` | "Received submissions" → "Referrals received" |
| `referrals:description` | "Track every submission from start to hire…" → "Track every referral from submission to hire…" |
| `referrals:queue.caughtUp.description` | "No submissions waiting for a decision." → "No referrals waiting for a decision." |
| `referrals:queue.noScore` | "No fit score for this submission" → "No fit score for this referral" |
| `activity:description`, `activity:emptyShort`, `activity:emptyBody` | "submissions" → "referrals" |
| `landing:privacy.features.audit.body` | "Every submission, decision…" → "Every referral, decision…" |
| **fr** `referrals:detail.next.awaitingSent`, `next.candidateDeclined`, `awaitingFlash`, `awaitingNotSentFlash`, `form.methodEmailHint` | Recruiter-side copy says "candidature" → "recommandation" (e.g. "Candidature créée." → "Recommandation créée."). *The candidate-facing "candidature" in `candidate.json` / `emails.candidateRequest` is allowed (glossary §5.3).* |

### 2.5 Match bands: "Partial" vs "Potential"

| Key | Current → Proposed |
|---|---|
| `landing:how.steps.two.body` | "…into Strong, Potential and Not eligible…" → "…into Strong, Partial and Not eligible…" · fr "Forte, Potentielle et Non admissible" → "forte, partielle ou non admissible" · pt "Forte, Potencial e Não elegível" → "forte, parcial ou não elegível" |
| `landing:privacy.mock.potential` | "2 potential" → "2 partial" · fr "2 potentielles" → "2 partielles" · pt "2 potenciais" → "2 parciais" |
| `docs/product-flows.md` | "(Strong / Potential / Not eligible)" → "(Strong / Partial / Not eligible)" |
| **pt** `jobs:detail.kpiStrong` / `kpiPartial` | "Correspondências fortes/parciais" vs `labels.band` "Match forte/parcial" → "Matches fortes" / "Matches parciais" |

### 2.6 Placement fee vs commission

| Key | Current → Proposed |
|---|---|
| `jobs:form.commission` | "Commission" (label of the fee field) → "Placement fee" · fr "Commission" → "Honoraires de placement" · pt "Comissão" → "Taxa de colocação" |
| `jobs:form.commissionHint` | "What you expect to invoice the client for this placement…" ✓ (keep the text, rename the key to `placementFeeHint` later) |
| `jobs:form.feeMode` | "How to enter the commission" → "How to enter the fee" |
| **pt** `admin:orgDetail.fee` | "Fee" → "Taxa" |
| **pt** `landing:how.steps.four.title`, `landing:commissions.ledger.projectedBody` | "Contrate e divida o fee" → "Contrate e divida a taxa" · "com fee e data de início" → "com taxa de colocação e data de início" |

### 2.7 Shared profile vs snapshot (en 7, fr 6, pt 6)

| Key | en current → proposed |
|---|---|
| `referrals:form.step1Body` | "Only checked fields are copied into an immutable snapshot for {recipient}…" → "Only the fields you check are copied into the shared profile {recipient} sees. Your private notes and the original profile are never shared." |
| `referrals:detail.disclosed` | "Snapshot taken {date}; later edits to the source record are not shared." → "Shared on {date}. Later edits to the candidate's profile aren't shared." |
| `referrals:detail.revokedSource`, `form.revocation` | "the snapshot" → "the shared profile" |
| `referrals:composer.shareHint` | "…copied into the snapshot." → "…copied into the shared profile." |
| `referrals:detail.agreement.pending` | "The snapshot is frozen after that." → "The split is frozen after that." |
| `admin:messages.rulePublished` | "Existing agreements keep their frozen snapshot." → "Existing agreements keep the split they were created with." |
| `referrals:detail.approvedProfile` | "Approved candidate profile" → "Shared profile" |

fr "instantané" → "profil partagé" / "partage", and pt "snapshot" → "perfil compartilhado" / "divisão", in the same keys.

### 2.8 Remittance, evidence and ledger words

| Key | Current → Proposed |
|---|---|
| **fr** `preuve(s)` in `admin:evidence.title`, `evidence.ownRecord`, `evidence.emptyHint`, `dispute.resolveDescription`, `commissions:detail.invoicesTitle`, `forms.recordEvidence`, `forms.verifyTitle`, `forms.rejectTitle`, `forms.rejectDescription`, `forms.disputeDescription`, `messages.evidenceRecorded`, `messages.rejected`, `errors:four_eyes_required`, `errors:already_reviewed`, `landing:commissions.note`, `landing:faq.items.c.a` | "preuve" → "pièce justificative" (e.g. "File des preuves de paiement" → "Pièces justificatives de paiement"; "Factures et preuves" → "Factures et pièces justificatives") |
| **pt** `landing:commissions.note`, `landing:faq.items.c.a` | "evidências" → "comprovantes" |
| **pt** `commissions:detail.recordPayout`, `commissions:detail.entryType.remittance` | "repasse / remessa", "remessa" → "repasse", "repasse à plataforma" |
| **pt** ledger: `landing:how.steps.four.body`, `privacy.features.audit.body`, `commissions.subtitle`, `facts.d.label`, `commissions.ledger.title`, `explore.items.commissions.body`, `admin:revenue.title`, `settings:integrations.paymentsDescription`, `commissions:detail.ledger`, `detail.ledgerCaption` | "ledger" / "livro-razão" / "Lançamentos" → "extrato" (e.g. "Ledger da contratação" → "Extrato da colocação"; "um ledger versionado" → "um extrato versionado"). Keep "lançamento" for an entry. |
| `commissions:detail.ledgerEmpty`, `admin:dispute.resolveDescription` | "reversing entries" / "compensating evidence" vs `errors:immutable_record` "correcting entry" → "correcting entries" everywhere |
| `commissions:detail.platformVerifies`, `commissions:forms.disputeDescription` | "platform administrator" → "MissionHub platform admin" / "platform admin" |

### 2.9 Placement (pt): colocação vs contratação
pt `landing` uses "contratação" for the placement object while the app uses "colocação".

| Key | Current → Proposed |
|---|---|
| pt `landing:meta.description`, `hero.subtitle` | "toda contratação termina em uma divisão" → "toda colocação termina em uma divisão" |
| pt `landing:how.title` | "…a uma contratação compartilhada." → "…a uma colocação compartilhada." |
| pt `landing:sides.owner.title` | "Transforme perfis parados em contratações." → "…em colocações." |
| pt `landing:cta.title` | "Sua próxima contratação já está…" → "Sua próxima colocação já está…" |
| pt `landing:commissions.ledger.title` | "Ledger da contratação" → "Extrato da colocação" |
| pt `landing:how.steps.four.body`, `referrals:hire.description`, `landing:pages.commissions.description` | "projetada" / "pagável" → "prevista" / "a pagar" (matches `commissions:kpi.*`) |

### 2.10 Opportunities (fr): Occasions vs Opportunités

| Key | Current → Proposed |
|---|---|
| fr `nav:opportunities` | "Opportunités" → "Occasions" (matches the page title `opportunities:title`) |
| fr `candidates:detail.tabs.opportunities` | "Opportunités" → "Occasions" |
| fr `overview:gettingStarted.referral.cta` | "Voir les opportunités" → "Voir les occasions" |
| fr `overview:best.title` | "Meilleures opportunités pour vos candidats" → "Meilleures occasions pour vos candidats" |

### 2.11 Requesting information: three button labels for one transition

| Key | Current → Proposed |
|---|---|
| `referrals:actions.info_requested` | "Request more info" → "Request information" · fr "Demander des précisions" · pt "Pedir informações" |
| `referrals:queue.askInfo` | "Ask for info" → "Request information" |
| `referrals:queue.infoTitle` | "Ask the partner for more information" ✓ |
| `landing:sides.jobOwner.points.c` | "…or request info" → "…or request information" |
| `labels:referralStatus.info_requested` | "Info requested" → "Information requested" · fr "Infos demandées" → "Précisions demandées" |

### 2.12 Record owner: "Recruiter" vs "Owner"

| Key | Current → Proposed |
|---|---|
| `candidates:list.columns.owner`, `candidates:detail.owner` | "Recruiter" → "Owner" |
| `candidates:detail.ownedBy` | "Recruiter: {name}" → "Owner: {name}" |

### 2.13 Admin wording

| Key | Current → Proposed |
|---|---|
| `errors:invitation_expired` | "Ask an admin for a new one." → "Ask an organization admin for a new one." |
| `onboarding:footer` | "…the invitation link your admin sent you." → "…the invitation link your organization admin sent you." |
| `admin:evidence.ownRecord` | "another admin must verify it" → "another platform admin must verify it" |

### 2.14 Smaller term drifts

| Key | Current → Proposed |
|---|---|
| `opportunities:evidence.jobClosed` | "Job is not open to external referrals" → "Job isn't open to partner referrals" |
| `connectors:detail.privacyJobs` | "allow external referrals" → "open them to partners" |
| `referrals:declineReasons.position_filled`, `jobs:messages.statusUpdatedReleased.*` | "Position filled" → "Job filled" · fr "Poste pourvu" ✓ · pt "Vaga preenchida" ✓ |
| `candidates:success.activated` | "Candidate activated. Matching runs in the background." → "Matching is on. New opportunities usually appear within a minute." (same as `setup.toast.active_for_matching`) |
| `jobs:messages.activated` | "Job is active. Matching runs in the background." → "Job published. Match counts appear within a minute." |
| `commissions:description` | "…Shares become owed once that payment is confirmed." → "…once that payment is verified." |
| `auth:form.workEmail` vs `profile:fields.email` | "Work email" / "Email": OK as-is (sign-up context); no change. |
| fr `connectors:entity.jobs`, `connectors:options.entity.jobs`, `connectors:description`, `connectors:connect.foundJobs.*`, `onboarding:titles.companyDescription`, `onboarding:messages.portfolioTransferred` | "Offres" / "offres" used for MissionHub jobs → "Postes" / "postes". "Offre (d'emploi)" stays only for the external posting being imported (`providers.*.tagline/does*`, `jobs:import.*`). |
| pt `landing:faq.items.e.a` | "Configurações › Time" → "Configurações › Equipe" (matches `settings:nav.team`) |
| pt `landing:nav.faq`, `landing:faq.eyebrow` | "Dúvidas" vs `explore.items.faq.title` / `pages.faq.title` "Perguntas frequentes" → choose one: "Perguntas frequentes" (nav may use "FAQ") |

---

## 3. P2: tone and clarity

| # | Key | Problem | Current → Proposed |
|---|---|---|---|
| 3.1 | `candidates:edit.description` | Jargon | "Changes to matching attributes trigger a background re-match." → "Changes to the matching profile refresh this candidate's opportunities within a few minutes." |
| 3.2 | `jobs:edit.description` | Jargon | "Requirement changes re-run matching in the background." → "Changes to requirements refresh match counts within a few minutes." |
| 3.3 | `jobs:messages.statusUpdated` | Jargon | "Status updated. Matches for inactive jobs expire immediately." → "Status updated. Partners stop seeing this job right away." *(check with product that this is accurate)* |
| 3.4 | `errors:invalidId` | Technical, no fix given | "Invalid identifier" → "This link isn't valid. Check it, or go back and try again." |
| 3.5 | `errors:immutable_record` | Jargon | "This record is immutable. Record a correcting entry instead." → "This record can't be changed. Add a correcting entry instead." |
| 3.6 | `commissions:detail.ledgerEmpty`, `forms.verifyDescription` | "immutable" | "Entries are immutable" → "Entries can't be changed"; "Verification writes immutable ledger entries." → "Verifying adds permanent entries to the ledger." |
| 3.7 | `commissions:party.client` | Jargon | "Distributable received" → "Fee received from client" |
| 3.8 | `commissions:kpi.projectedHint` | Missing article | "Hires not yet paid by client" → "Hires the client hasn't paid yet" |
| 3.9 | `referrals:form.authBefore` + `authAnd` + `authAfter` | Sentence built from 3 fragments (`submit-referral-form.tsx:336`). fr already needs "et à". Breaks the "never concatenate" rule. | Replace with one key: "Sharing requires the candidate's authorization for {recipient} and {job}. Uploading a resume doesn't authorize sharing." (render bold with rich text) |
| 3.10 | `emails:recovery.body` | "Click" | "Click the button to choose a new one." → "Use the button below to choose a new one." |
| 3.11 | `emails:candidateRequest.note` | Comma splice | "This link is personal, don't forward it." → "This link is personal. Please don't forward it." |
| 3.12 | `emails:candidateRequest.body` / `candidate:title` | Candidate-facing "put you forward" is fine, but the email says "this role" while the heading says "{job}" | OK. Minor: "for this role" → "for {job}" so the email makes sense in a notification preview. |
| 3.13 | `connectors:connect.previewHint`, `candidates:resume.subtitle` | "We'll pick up…" is fine. `jobs:import.doneAi` "Nothing was invented" is defensive. | "Read by AI. Nothing was invented: empty fields weren't stated in the posting." → "Read by AI. Fields the posting doesn't mention are left empty." |
| 3.14 | `landing:sides.owner.title` | "idle profiles" treats candidates as stock | "Turn idle profiles into placements." → "Find a home for candidates who don't fit your roles." |
| 3.15 | `landing:privacy.features.isolation.body` | Engineering jargon on the marketing site | "Row-level security keeps every agency's data inside its own workspace." → "Access checks on every record keep each agency's data inside its own organization." |
| 3.16 | `settings:integrations.residency` | Tells org admins to configure Supabase, which they can't do. It's an operator note. | "Data residency: configure your Supabase project in a Canadian region (ca-central-1)…" → show only to platform admins, or: "Data is hosted in Canada. Some service providers (AI, email) may process data outside Canada." ⚖️ *(only if hosting really is in ca-central-1)* |

---

## 4. fr-CA specific

| # | Key | Problem | Current → Proposed |
|---|---|---|---|
| 4.1 | `labels:referralStatus.submitted/accepted/declined/withdrawn/cancelled` | Agreement: *recommandation* is feminine (`candidate_declined` already says "Refusée") | "Soumis/Accepté/Refusé/Retiré/Annulé" → "Soumise/Acceptée/Refusée/Retirée/Annulée" |
| 4.2 | `referrals:queue.done.accepted`, `queue.done.declined`, `queue.done.under_review`, `detail.submittedFlash` | Same agreement problem | "Accepté." → "Acceptée." · "Refusé." → "Refusée." · "Marqué en évaluation." → "Marquée en évaluation." · "Soumis. {partner} a été avisé…" → "Recommandation soumise. {partner} a été avisé…" |
| 4.3 | `landing:hero.card.matchJob` | "Senior" became "principal" (a different level) | "Designer produit principal" → "Designer produit sénior" |
| 4.4 | `emails:*` (8 strings use `’`, 18 use `'`), `candidate:*` (2 `’` / 6 `'`) | Mixed apostrophes in the same email | Normalize to `’` (e.g. `emails:signup.note` "n'avez" → "n’avez") |
| 4.5 | `referrals:detail.agreement.internal` | "commission de recrutement" is vague for the sourcing share | "…il n'y a donc pas de commission de recrutement." → "…il n'y a donc pas de part pour le recruteur d'origine." |
| 4.6 | `landing:pages.commissions.description` | Gender | "passage d'un placement de prévu à payable puis payé" → "passage de la commission de prévue à à verser, puis versée" |
| 4.7 | `landing:commissions.ledger.payable` / `paid` | Ledger states don't match the app (`commissions:kpi.payable` "À vous verser") | "Payable" → "À verser" · "Payée" → "Versée" |
| 4.8 | SEO lengths | `landing:meta.title` 62 characters (> 60). `meta.description` 194, `pages.privacy.description` 218, `pages.how.description` 184, `pages.faq.description` 170 (> 155) | Shorten. Title: "MissionHub · Réseau privé de recommandation pour recruteurs" (59) |

## 5. pt-BR specific

| # | Key | Problem | Current → Proposed |
|---|---|---|---|
| 5.1 | `referrals:detail.agreement.internal` | Anglicism | "…então não há comissão de sourcing." → "…então não há parte para o recrutador de origem." |
| 5.2 | `labels:seniority.intern` | Not a person-level like the other values | "Estágio" → "Estagiário" |
| 5.3 | `landing:hero.imageAlt` | Anglicism in alt text | "…com um high five" → "…batendo as mãos" |
| 5.4 | `landing:marquee.items.j` | Mixed (en kept while the others are translated) | "Executive search" → "Recrutamento de executivos" |
| 5.5 | `landing:sides.eyebrow` | Anglicism | "Dois lados, um marketplace" → "Dois lados, uma rede" |
| 5.6 | SEO lengths | `meta.description` 189, `pages.privacy.description` 201, `pages.how.description` 184, `pages.faq.description` 166 (> 155) | Shorten. |

## 6. P3: mechanics

| # | Key(s) | Problem | Current → Proposed |
|---|---|---|---|
| 6.1 | en SEO: `landing:meta.description` (171), `pages.how.description` (181) | > 155 characters, will be cut off in search results | meta: "Match your private candidates to other recruiters' open jobs. Nothing is shared without your authorization. Every placement ends in a 45/45/10 split." (149) · how: "How MissionHub takes a candidate from your private pipeline to a partner's job in four steps, each one authorized and recorded." (127) |
| 6.2 | `connectors:providers.google_sheets.description`, `connectors:upload.columnsHint` | British spelling | "recognised" → "recognized" |
| 6.3 | `connectors:providers.missionhub_api.does1`, `connectors:api.note1` | "ids/id" | "your own ids" → "your own IDs"; "your system's id" → "your system's ID" |
| 6.4 | `jobs:messages.statusUpdatedReleased.*`, `jobs:import.errors.blockedSite`, `jobs:import.errors.notHtml`, `connectors:providers.greenhouse.step2`, `google_sheets.step1`, `connectors:errors.notFound`, `connectors:api.revokeTitle`, `referrals:form.evidenceHint`, `candidates:errors.csvFullName` | Straight quotes `\"…\"` / `'…'` in visible text (the candidates and referrals files already use curly quotes elsewhere) | `\"Position filled\"` → `“Job filled”`; `'Candidate approved…'` → `“Candidate approved…”`; `'full_name'` → `“full_name”` |
| 6.5 | `referrals:form.evidenceHint` (en/fr/pt) | ISO date in an example | "…on 2026-11-06…" → "…on Nov 6…" · fr "le 6 nov." · pt "em 6 nov." |
| 6.6 | `auth:form.passwordHint` vs `profile:password.hint` | Two wordings for one rule | "At least 10 characters, including a letter and a number." (use it in both) |
| 6.7 | `candidate:profile.country`, `candidates:form.countryHint`, `candidates:validation.countryCode` | Asks a candidate (non-user) for an ISO code | "Country (2-letter code)" → "Country" (use the country picker that `common.location` already provides) |
| 6.8 | `candidates:import.columnsHint` | Very dense: column codes, value enums and ISO codes in one sentence | Split into a short sentence plus a link to the template: "Use the template's column names. Only {required} is required. Lists go in one cell, separated by semicolons (e.g. {example})." |
| 6.9 | `admin:rules.effective` / `rules.inForce` | Two labels for "current": "In force" and "Current" | Use "Current" for both, or "In force since {date}" for the column |
| 6.10 | Duplicate generic keys | `cancel` is redefined in `candidate`, `candidates.form`, `jobs.form`, `referrals.queue`, `settings.team`. `close` in `referrals.queue`. `apply` in `jobs`, `candidates.list`, `admin.filters`. | Use `common.actions.*` (keep the keys until the components are migrated) |
| 6.11 | Success-toast groups | `candidates.success.*` and `referrals.success.*`, while every other namespace uses `messages.*` | Use `messages` for new keys. Migrate when the files are touched. |
| 6.12 | Empty-state key shapes | `empty.{title,description}` (most) vs flat `emptyTitle/emptyBody` (`candidates.list`, `activity`) vs `submittedEmptyTitle/Body` (`jobs.detail`) vs `emptyHint` (`admin`) | Target `empty.<variant>.{title,description,action}` |
| 6.13 | Link-in-sentence keys | `overview:best.noneInactive` / `noneInactiveLink` / `noneInactiveTail` | Rename to `noneInactiveBefore` / `noneInactiveLink` / `noneInactiveAfter` (README pattern) |

---

## 7. Hard-coded text outside the message files

The landing components (`src/features/landing/components/*`) are clean. All visible text goes through `t()`. Findings elsewhere:

| # | File | Text | Note / Proposed |
|---|---|---|---|
| 7.1 | `src/app/global-error.tsx:9-13` | "Something went wrong" / "Une erreur s'est produite" / "Algo deu errado" / "Try again · Réessayer · Tentar de novo" | Intentional (rendered outside the i18n provider). OK. Keep it in sync with `errors:page.title` / `common.actions.tryAgain`. Minor: the fr apostrophe is `&apos;`, so it renders `'`, not `’`. |
| 7.2 | `src/app/workspace/[orgSlug]/settings/connectors/[provider]/page.tsx:96` | "Google Sheets" link text | Brand name. OK. |
| 7.3 | `src/features/admin/actions.ts:58` | `"Standard marketplace split"`: the default commission rule name, stored and later shown to recruiters through `referrals:detail.agreement.rule` "{rule} v{version}" | ✅ Fixed: the DB name stays (it groups rule versions and is frozen in agreements); `commissionRuleLabel()` in `src/lib/labels` shows `labels.commissionRule.default` instead. |
| 7.4 | `src/server/auth/errors.ts:2,9` | "You do not have permission to perform this action." / "Not found." | Fallback exception messages. Make sure `guard()` maps them to `errors.forbidden` / a translated not-found and never shows them as-is. |
| 7.5 | `src/server/ingest/schema.ts:16,20` | "Use an ISO 3166-1 alpha-2 country code, e.g. \"CA\"" / "Use an ISO 4217 currency code…" | API-facing (developer audience, en only). Acceptable. Keep it out of the UI. |
| 7.6 | `src/features/matching/domain/engine.ts` (labels such as "Matching is turned off for this candidate") | English labels stored next to translation keys | OK if the UI always renders `opportunities:evidence.<key>`. Verify that no screen falls back to `label`. |

---

## 8. Consistent things worth keeping (no change)
- Errors are almost uniformly "what happened + how to fix", with no blame and no codes (`errors.*`).
- Destructive dialogs name the object and the consequence (`candidates:anonymize.*`, `connectors:api.revokeDescription`).
- Money copy is careful to say no funds move through MissionHub (`landing:commissions.note`, `settings:integrations.paymentsDescription`).
- fr-CA vocabulary is good overall (courriel, téléverser, jumelage, entrevue, rétroaction) and follows Québec punctuation (no space before `?`).
- pt-BR register is natural and consistent (*você*, "Informe…").

---

## 9. Needs a human decision or legal review

| # | Topic | Where | Question / why |
|---|---|---|---|
| 9.1 | **"Workspace" in marketing and onboarding** | `landing:hero.primary`, `landing:cta.primary`, `landing:cta.subtitle`, `onboarding:*` | The glossary makes **organization** the single term. "Create your workspace" is a common SaaS CTA and reads better in marketing. Decide: (a) "organization" everywhere (my default in §2.1), or (b) keep "workspace" as the marketing word for the thing you sign up for, and document it as the only allowed exception. |
| 9.2 | **pt "match/matching" vs Portuguese words** | ~80 pt strings | The glossary keeps the anglicisms (common in Brazilian recruiting tech). The alternative is "compatibilidade". Confirm with a pt-BR recruiter. |
| 9.3 | **"Free to start"** | `landing:hero.note` | No pricing exists in the product, and MissionHub takes 10% of each placement. "Free to start" may mislead. Confirm the pricing message, or change it to "No subscription · You only share a fee when a placement pays out" `[TODO: confirm pricing]`. |
| 9.4 ⚖️ | Statutory deadline in UI | `settings:privacy.messages.logged` "Respond within the statutory timeline (PIPEDA: generally 30 days)." | Legal statement inside the product. It ignores Québec Law 25 and Alberta PIPA. Counsel to confirm, or replace with "Due date set to 30 days. Check the deadline that applies to you." |
| 9.5 ⚖️ | Legal advice in hints | `candidates:form.legalBasisHint`, `candidates:consent.basisHint` "Most recruiters use Consent." | Unverified claim that nudges a legal choice. Proposed: "Choose the basis your privacy policy relies on. Ask your privacy counsel if you're not sure." |
| 9.6 ⚖️ | Candidate consent wording | `candidate:consent` (en/fr/pt), `emails:candidateRequest.*` | This is the authorization record. The wording, the withdrawal method ("by contacting {org}") and the fr/pt equivalence need counsel (Law 25 requires clear, separate consent in French for Québec residents). |
| 9.7 ⚖️ | Draft terms notices | `auth:form.terms`, `landing:footer.legal`, `referrals:agreement.description` | Keep them until Terms, Privacy Policy and the collaboration agreement template are approved. The sign-up checkbox text should link to the documents when they exist. |
| 9.8 ⚖️ | Replacement guarantee field | `referrals:hire.guarantee` "Replacement guarantee (days)" | `security-and-privacy.md` lists replacement guarantees as an open legal item. The UI records them, but must not imply that MissionHub enforces them. |
| 9.9 ⚖️ | Data-residency claim | `settings:integrations.residency` (see 3.16) | Any "hosted in Canada" statement needs confirmation of the real region and the subprocessor list. |
| 9.10 | **"Reply to this email"** | `emails:emailChanged.note` | Only keep it if the sender address goes to a monitored inbox. Otherwise: "If you didn't make this change, reset your password right away." |
