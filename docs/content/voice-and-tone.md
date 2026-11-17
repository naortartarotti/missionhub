# Workatent voice & tone

This guide covers every word Workatent shows to people: UI strings, errors, emails, notifications, the candidate confirmation page and the marketing site. It is built from the copy already in `src/i18n/messages/{en,fr,pt}` and the product docs (`docs/product-flows.md`, `docs/domain-model.md`, `docs/security-and-privacy.md`).

- **`en` is the source of truth.** `fr` means fr-CA (Québec and the rest of French Canada). `pt` means pt-BR. Localize, don't translate word for word (see §7).
- **The glossary (§5) is binding.** When a string uses a product concept, it uses the glossary term in every locale. If you need a new term, add it to the glossary in the same change.
- Known gaps between this guide and the current copy are listed in [`copy-audit.md`](./copy-audit.md).

---

## 1. Who we write for

Workatent is a private, permission-based referral network for recruiters in Canada. One recruiter has a candidate, another has the job, and they split the fee when the candidate is hired. Four groups read our copy. They want different things.

| Audience | Who they are | What they care about | What they fear | Where they read us |
|---|---|---|---|---|
| **Recruiters at agencies** (main user). Both sides of a referral: the *sourcing recruiter* and the *hiring recruiter*. | Agency recruiters, headhunters and independents. They use the app daily, often between calls. | More placements from candidates they already have. Getting paid their share. Speed. | Losing a candidate to a partner ("candidate ownership"). Not getting paid. Exposing a candidate without permission. | The whole app, emails, the landing page. |
| **Employers / hiring clients** | The company that hires. In v1 they are **not** users. The hiring recruiter represents them. They appear as a "client" (sometimes confidential). | Good candidates, discretion. | Their name leaking to other agencies. | Indirectly: job descriptions, the confidential-client setting. Write copy about clients with discretion. |
| **Candidates** | People being put forward. They aren't users. They only see the confirmation email and the private confirmation page (`candidate.json`, `emails.candidateRequest`). | Knowing who will see their profile, for which job, and that they can say no. | Being shared without consent. Spam. Their current employer finding out. | One email, one page, maybe once. Often on a phone. |
| **Platform admins** (Workatent staff, `/admin`) | They verify payment evidence, resolve disputes, publish commission rules and suspend organizations. | Accuracy, an audit trail, a clear view of what's waiting. | Making an irreversible money decision on bad data. | The admin console. |

Org admins and recruiter managers are recruiters with more permissions: team, privacy requests, audit log, connectors. Write for them like recruiters, and be more precise about consequences.

**Default reader:** a busy Canadian recruiter, reading in their second or third language about a third of the time. Aim for grade 8 in English, and the same plainness in fr and pt.

---

## 2. Voice principles

The voice stays the same everywhere. Tone adapts (§3).

### 2.1 Clear before clever
Use plain words, short sentences and one idea per sentence. Product jargon, database words and engineering words don't belong in the UI.

| Don't | Do |
|---|---|
| "Changes to matching attributes trigger a background re-match." (`candidates.edit.description`) | "Changes to the matching profile refresh this candidate's opportunities within a few minutes." |
| "This record is immutable. Record a correcting entry instead." (`errors.immutable_record`) | "This record can't be changed. Add a correcting entry instead." |
| "Only checked fields are copied into an immutable snapshot for {recipient}." (`referrals.form.step1Body`) | "Only the fields you check are copied into the shared profile {recipient} sees. Later edits aren't shared." |
| "Distributable received" (`commissions.party.client`) | "Fee received from client" |

### 2.2 Say exactly what happens, especially about privacy and money
People decide to share a person's data, or to record a payment, based on our words. Name the object, the person and the consequence. Never overpromise.

| Don't | Do |
|---|---|
| "Add someone you represent… Only you can see them." (`overview.gettingStarted.candidate.description`). This is wrong: everyone in the organization can see them. | "Add someone you represent, or import a CSV. Only your organization can see them." |
| "Revoke this permission?" | "Revoke sharing for this job? {partner} loses access to the shared profile and documents right away. You can't undo this." |
| "Amounts are estimates until the client pays. Shares become owed once that payment is confirmed." | "Amounts are projected until the client's payment is verified. Then each share is owed." *(Client payments are **verified**, not "confirmed". See §3.5.)* |

### 2.3 Respectful partner, not a salesperson
We stand between two recruiters who compete as well as collaborate. We stay neutral, don't take sides and don't hype. Use "you" and "your", and "we" only for Workatent the service ("We emailed {email}"). Be warm, but not cute. Exclamation marks: at most one, on a welcome.

| Don't | Do |
|---|---|
| "Bullhorn is one of the most used agency ATS." (unverified claim) | "Sync candidates and jobs from Bullhorn." |
| "Free to start" (no pricing exists yet, see audit) | Leave pricing claims out until a real price exists. |
| "Welcome back, {name}!" ✓ *(fine: one exclamation mark, on a welcome)* | |

### 2.4 Help the next step
Every screen state ends with what to do next. Empty states say what the screen is for and how to start. Errors say what happened and how to fix it. Success messages say what changed and what happens next.

| Don't | Do |
|---|---|
| "Invalid identifier" (`errors.invalidId`) | "This link isn't valid. Check it, or go back and try again." |
| "Nothing here yet." | "No candidates in this stage. Accepted referrals appear here." |
| "Placement created from the frozen agreement. Next: record the client invoice." ✓ *(good model: it says what changed, then what comes next)* | |

### 2.5 Fair and human about people
Candidates are people, not inventory. Feedback on candidates must be job-related and non-discriminatory (the product already says this, so keep it). Don't use words like "inventory", "bench" or "pipeline full of". "Trusted bench" on the landing page is the limit.

| Don't | Do |
|---|---|
| "Turn idle profiles into placements." | "Find the right job for candidates who don't fit your own roles." |
| "Rejected" (candidate outcome) | "Not selected" ✓ *(already `labels.referralStatus.rejected`)* |

---

## 3. Tone by context

| Context | Tone | Rules | Model string (en) |
|---|---|---|---|
| **3.1 Success / toasts** | Brief and factual | Use past tense, then what happens next (if anything). No "Success!" or "Yay". At most 2 short sentences. | "Agreement confirmed. Commission terms are now frozen for this referral." |
| **3.2 Empty states** | Encouraging and practical | Title: what isn't here yet, or a direct call to action ("Add your first candidate"). Body: what the screen is for, then how to start. One button, verb first. If the empty state comes from filters, say how to clear them. | Title "No referrals sent yet" · Body "When a partner job fits one of your candidates, submit them from Opportunities. You'll follow their progress here." · Button "View opportunities" |
| **3.3 Errors** | Calm, no blame | Say what happened, then how to fix it. No codes, ids, stack traces, env var names, other tenants, or whether an account exists ("If an account exists for that email…" ✓). Don't write "Oops", "invalid" (alone), "failed to" or "error occurred". Field validation: an imperative fix ("Enter a valid email"). | "This record changed in the meantime. Refresh and try again." |
| **3.4 Destructive / irreversible actions** | Serious and precise | The dialog title is a question that names the action and the object ("Anonymize this candidate?"). The body gives the consequence, who is affected and whether it can be undone ("You can't undo this."). The confirm button repeats the verb ("Anonymize permanently", "Revoke key"), never "OK" or "Yes". Cancel is always "Cancel". | "Permanently removes name, contact details, notes, experience and documents, and revokes all authorizations. Referral history and financial records are kept for audit. You can't undo this." |
| **3.5 Money & commissions** | Exact and neutral | Use the glossary words exactly: *placement fee, share, projected, payable, paid, payout, platform remittance, evidence, verified*. Say who pays whom. Say whether money moves through Workatent: **it never does**. Never promise payment dates. Show currency with every amount (§6.6). Wording: **verify** = an independent check of evidence (a platform admin, or the receiving recruiter). **Confirm** = a party agreeing (agreement, receipt). **Record** = entering something that happened outside Workatent. | "Recorded as pending. It changes the ledger only after someone other than you verifies it against the bank record." |
| **3.6 Privacy, consent & legal** | Careful and plain | Describe what the product does, never what the law requires. Don't claim compliance (PIPEDA, Law 25, CASL). Don't give legal advice ("Most recruiters use Consent" ✗). Anything ⚖️ in `docs/security-and-privacy.md`, plus Terms, privacy notices, consent text and statutory deadlines, needs counsel. Mark it `⚖️ needs legal review` in specs. Keep the "draft pending legal review" notices until counsel signs off. | "Sharing requires the candidate's authorization for this recipient and this job. Uploading a resume doesn't authorize sharing." |
| **3.7 Emails** | Direct and trustworthy | Subject: what it is, with the brand or actor ("{inviter} invited you to {org} on Workatent"). ≤ 50 characters before placeholders where possible. Preheader adds new information, never repeats the subject. One CTA, verb first. Security note last: expiry, then "If you didn't…, ignore this email." Don't write "click". Use "the button below", or name the button. Never ask people to reply unless someone reads the inbox. | Subject "Reset your Workatent password" · CTA "Choose a new password" · Note "The link expires in 1 hour. If you didn't ask for this, ignore this email; your password stays the same." |
| **3.8 Candidate-facing (email + confirmation page)** | Respectful, reassuring, short | The candidate isn't a user and may not know Workatent. Lead with the recruiter's name. Say what will be shared, with whom, and for which job. Make it clear they can say no and that nothing is shared without them. No recruiter jargon (no "referral snapshot", "sourcing", "partner"). Use "recruiter" plus the name. | "{recruiter} ({org}) would like to present your profile to {partner} for this job. Nothing is shared without your confirmation." |
| **3.9 Marketing** | Confident, concrete, benefit-led | Talk to one side at a time ("You have the candidate" / "You have the job"). Use real product facts only: the 45/45/10 default split, anonymized match counts, no funds through Workatent. No invented stats, logos or testimonials. Mark anything that needs data as `[TODO: source]`. SEO: `title` ≤ 60 characters, `description` ≤ 155 characters, per locale. Marketing may say "agency" because the reader is an agency. The product object is still "organization". | "Your candidates. Their jobs. One shared win." |
| **3.10 Admin console** | Operational and precise | Admins handle money and suspensions, so put the consequence first. Say "organization", not "tenant" or "workspace". Staff-only jargon is OK if it's in the glossary ("four-eyes" is not; say "a second person must verify"). | "Members immediately lose access. Jobs and candidates stop matching. Existing referrals and finance records are kept." |
| **3.11 Loading / in-progress** | Invisible | Use a present participle plus an ellipsis character: "Saving…", "Submitting…". Never "Please wait". | "Importing…" |

---

## 4. Words to avoid (everywhere)

| Avoid | Why | Use instead |
|---|---|---|
| snapshot, instantané | Engineering word | shared profile (§5) |
| immutable, frozen *(for records)* | Jargon | "can't be changed" (*"frozen"* is acceptable only for the commission split: "the split is frozen for this referral") |
| tenant, slug, id/ids, RLS, row-level security, env var names (`RESEND_API_KEY`), localhost URLs | Internal details | organization, workspace URL, "link", or nothing |
| four-eyes | Jargon | "someone other than the person who recorded it" |
| click, click here | Device-specific; meaningless link text | select, choose, or the button's name |
| Oops, Uh-oh, Whoops | Unserious about real problems | (nothing; state the problem) |
| Please *(in errors)* | Adds length; sounds like begging | imperative fix ("Enter a reason") |
| simply, just, easy, seamless | Condescending when it isn't | (delete) |
| guaranteed, secure *(as a promise)*, compliant, GDPR/PIPEDA-compliant | Legal/security promises we can't make | describe the control ("Row-level access checks keep each organization's data separate") ⚖️ |
| inventory, bench, idle profiles, talent pool *(in product UI)* | Treats people as stock | candidates |
| submission *(as a noun for the object)* | Second word for referral | referral ("No referrals received yet") |
| claim *(in any member-facing copy)* | It's the code and team name for N1's prior-presentation objection (PD-028, RD-050). It collides with dispute, and N3 doesn't use it for hire reports | objection / objection / objeção (§5.3); hire report (§5.8) |
| can't be hired, may not be hired, blocked candidate | Implies a no-hire rule (Competition Act, C-6) | "already presented" |
| job owner, job recruiter, candidate recruiter, referring partner | Competing names for the two sides | hiring recruiter, sourcing recruiter |
| permission *(for candidate authorization)*, consent *(outside legal basis)* | Three words for one record | authorization |
| agency *(as the product object)*, workspace *(as the tenant)* | Three words for one tenant | organization |
| Potential *(match band)* | Conflicts with "Partial match" in the app | Partial match |
| fr: opportunité, titulaire du poste, recruteur source, remise *(remittance)*, preuve *(evidence)* | Anglicism / wrong meaning (*titulaire* = the employee in the job, *remise* = discount) | occasion, recruteur du poste, recruteur d'origine, versement à la plateforme, pièce justificative |
| pt: snapshot, sourcing, fee, ledger, dono da vaga, captação, indicador | Anglicisms / variants | perfil compartilhado, recrutador de origem, taxa de colocação, extrato, recrutador da vaga |
| contract, deal *(for a job's terms)*; terms card, fiche, cartão *(user-facing, except in the legacy label)* | The terms are the hiring recruiter's declaration, not a contract we draft | terms / conditions / termos (§5.6) |
| floor, cap, bonus, penalty, debt, owe *(for fee differences and negative shares)* | Takes sides; sounds like blame | "Shares are never calculated on less than the computed fee"; "your share covers the difference"; "you pay it to {partner} directly" (§5.6) |
| release, libérer, liberar *(in the network response rule)* | **release** is the sourcing side giving up first position (§5.3); an unanswered referral keeps it | "the sourcing recruiter may submit the candidate to other jobs, and the referral keeps its first position" |
| fr/pt prévue, prevista *(for an expected share before hire)* | Reserved for the ledger state "Projected" | part attendue, parte esperada |

---

## 5. Glossary (canonical terms)

**One concept = one term per locale.** Use this table for UI, emails and marketing. "Notes" says where a variant is allowed.

### 5.1 People & organizations

| Concept | en | fr-CA | pt-BR | Avoid | Notes |
|---|---|---|---|---|---|
| The company account (tenant) | **organization** | **organisation** | **organização** | agency, workspace, company, account, tenant | Marketing may address readers as "agencies", but the thing you create and manage is an organization. Allowed fixed compound: **workspace URL** / **adresse de l'espace** / **endereço do workspace** (the slug). See the audit's "Needs decision" section about "Create your workspace". |
| Person in an organization | **member** | **membre** | **membro** | user *(except platform admin views)*, seat | "teammate / collègue / colega" is allowed only in invite CTAs ("Invite a teammate"). |
| Organization roles | Organization admin · Recruiter manager · Recruiter | Administrateur de l'organisation · Gestionnaire de recrutement · Recruteur | Administrador da organização · Gerente de recrutamento · Recrutador | admin *(alone, when ambiguous)* | `labels.role.*` |
| Workatent staff | **platform admin** | **administrateur de la plateforme** | **admin da plataforma** | administrator, Workatent administrator, support | Use "Workatent" (not "the platform") in candidate-facing or marketing text. |
| The other organization in a referral | **partner** | **partenaire** | **parceiro** | other agency, external recruiter | "partner recruiter" is OK when you mean the person. |
| Side A: recruiter who has the candidate | **sourcing recruiter** | **recruteur d'origine** | **recrutador de origem** | candidate recruiter, referring partner, sourcing *(alone)*, recruteur source, captação, indicador | In "you" contexts, prefer "Your candidate → partner's job". |
| Side B: recruiter who has the job | **hiring recruiter** | **recruteur du poste** | **recrutador da vaga** | job owner, job recruiter, titulaire/propriétaire/responsable du poste, dono da vaga | We don't use "job owner" because "owner" already means the member responsible for a record (below). DB/enum keys (`job_owner`) stay as they are. |
| Member responsible for a candidate or job | **owner** | **responsable** | **responsável** | recruiter *(as a column label)*, assignee | "Owner: {name}", "Transfer portfolio", "New owner". |
| Hiring company | **client** | **client** | **cliente** | employer *(in UI)*, customer | "Confidential client / Client confidentiel / Cliente confidencial". |
| Person being placed | **candidate** | **candidat** | **candidato** | talent, profile *(for the person)*, applicant | fr: use inclusive phrasing where natural, otherwise the generic masculine (OQLF). |

### 5.2 Candidates, jobs, matching

| Concept | en | fr-CA | pt-BR | Avoid | Notes |
|---|---|---|---|---|---|
| A candidate's information | **profile** | **profil** | **perfil** | record, fiche/ficha *(user-facing)* | "record" is acceptable in privacy/audit contexts ("privacy record", "audit log"). |
| What the partner sees in a referral | **shared profile** | **profil partagé** | **perfil compartilhado** | snapshot, instantané, approved profile | |
| An open role | **job** | **poste** | **vaga** | position, opening, role, offre | Candidate-facing copy and marketing may say **role** (candidates don't see team roles). "Position filled" (decline reason) → "Job filled". |
| External ad text being imported | **job posting** | **offre d'emploi** | **anúncio da vaga** | posting *(alone)* | Only in import flows. |
| The engine running | **matching** (turn on / pause matching) | **jumelage** (activer le jumelage) | **matching** (ligar o matching) | activate for matching, correspondance *(for the process)* | |
| A candidate × job result | **match** | **correspondance** | **match** (m.) | compatibility, fit *(as a noun for the result)* | pt: "match" is the established pt-BR term in recruiting tech. **Human decision**, see audit. |
| Match bands | **Strong match · Partial match · Not eligible** | **Forte correspondance · Correspondance partielle · Non admissible** | **Match forte · Match parcial · Não elegível** | Potential, Potentielle, Potencial | Source: `labels.band.*`. Docs and landing must follow. |
| Indicative score | **fit score** | **score d'adéquation** | **nota de aderência** | compatibility score, rating | Always say "indicative"; humans decide. |
| A partner job that fits your candidate | **opportunity** | **occasion** | **oportunidade** | opportunité | fr follows OQLF. Nav, page titles and tabs must match. |

### 5.3 Referrals & authorization

| Concept | en | fr-CA | pt-BR | Avoid | Notes |
|---|---|---|---|---|---|
| Putting a candidate forward to a partner job (the object) | **referral** | **recommandation** (f.) | **indicação** | submission, application, candidature | fr candidate-facing copy (`candidate.json`, `emails.candidateRequest`) may use **candidature**, because candidates read it as "my application". Recruiter-side copy always uses *recommandation*. |
| The action | **submit** (a candidate) | **soumettre** | **enviar** | refer *(as the button)*, send | "Submit candidate", "Submitted". |
| Directions | **Sent · Received** | **Envoyées · Reçues** | **Enviadas · Recebidas** | Outgoing/Incoming, Sortante/Entrante | |
| A referral from submission until it is hired, declined, rejected, withdrawn, cancelled or released | **in progress** ("referrals in progress") | **en cours** (« recommandations en cours ») | **em andamento** ("indicações em andamento") | in flight, active, open, ongoing, pending; fr active, ouverte; pt ativa, aberta, pendente | Network Rules v1 (1.5, 3.4, 9.1, 10.3). Matches the existing "In progress / En cours / Em andamento" in `overview`. Covers the statuses Submitted, Info requested, Accepted, Interview and Offer (RD-038). Already presented is not in progress. Not a status label: don't add it to `labels.referralStatus`. |
| Candidate's recorded agreement | **authorization** | **autorisation** | **autorização** | permission, consent, approval | **Consent / Consentement / Consentimento** is allowed only as the *legal basis* value (`labels.legalBasis.consent`) and in "withdrawal of consent" (privacy request type). |
| Authorization to store and match | **matching authorization** | **autorisation de jumelage** | **autorização de matching** | processing authorization, permission to represent and match | |
| Authorization to share for one job + recipient | **sharing authorization** | **autorisation de partage** | **autorização de compartilhamento** | job-specific authorization, permission to share for one job | |
| Taking it back | **revoke** (authorization), **withdraw** (referral) | **révoquer** / **retirer** | **revogar** / **retirar** | cancel *(for these)* | Candidate-facing: "withdraw your authorization" is OK in plain language. |
| Asking the partner a question | **Request information** (button) · **Info requested** (status) | **Demander des précisions** · **Précisions demandées** | **Pedir informações** · **Informações solicitadas** | Ask for info, Request more info | |
| Commission terms both sides confirm | **collaboration agreement** | **entente de collaboration** | **acordo de colaboração** | contract, deal | |
| The percentages | **commission split** | **partage de la commission** | **divisão da comissão** | répartition *(mixing)* | Default **45/45/10**. "Split" alone is OK in tight UI. |
| Referral reaches the hiring recruiter (candidate confirmed, or authorization recorded) | **deliver / delivered** | **transmettre / transmise** | **entregar / entregue** | send *(for this)*, submitted *(for this)* | A referral can be submitted and never delivered (waiting for the candidate). |
| An earlier delivered referral of the same person, to the same hiring organization, for the same job or client | **prior presentation** | **présentation antérieure** | **apresentação anterior** | first submission, duplicate *(for the rule)* | "Presented" = delivered. Used as the decline reason and the admin dispute type. |
| The rank a delivered referral holds for a client | **first position** | **priorité** | **prioridade** | first right, exclusivity, ownership *(for this)* | "keeps / gives up first position" = "conserve / perd sa priorité" = "mantém / perde a prioridade". |
| The hiring side's evidenced statement that it already had the candidate for this client | **prior-presentation objection** (short: **objection**) | **objection pour présentation antérieure** (short: **objection**, f.) | **objeção por apresentação anterior** (short: **objeção**, f.) | **claim** *(user-facing)*, complaint, dispute; fr réclamation, revendication, déclaration; pt alegação, reivindicação, declaração | PD-028 (N1). **"Claim" stays the team and code name for this objection (RD-050), never a member-facing word.** N3's sourcing-side action is a **hire report** (§5.8), not a claim. "Dispute" is what a contest opens; don't use it for this object. fr *déclaration* is taken by hire reporting ("Déclarer une embauche"). Code identifiers stay `claim*` / `prior_presentation`. Verb: **file** / **déposer** / **registrar**. States (`labels.claimStatus`): Open · Contested · Final · Upheld · Rejected = Ouverte · Contestée · Définitive · Retenue · Rejetée = Aberta · Contestada · Definitiva · Mantida · Rejeitada. |
| The sourcing side challenges an objection; the hiring side challenges a hire report (N3, §5.8) | **contest** | **contester** / **contestation** | **contestar** / **contestação** | dispute *(as a verb)*, appeal, challenge, deny; fr refuser; pt negar, impugnar | A contest opens a **dispute** that a platform admin resolves. Same word on both sides and for both objects. |
| The platform admin's decision on a contested objection | **uphold / reject**, written **resolution** | **retenir / rejeter**, **résolution** | **manter / rejeitar**, **resolução** | approve, deny, verdict | Both organizations read the resolution. |
| Give up first position | **release** (a candidate, for a client) | **libérer** / **libération** | **liberar** / **liberação** | waive, drop, unlock | Sourcing side and platform admins only; never shown to the hiring side. Not the same as **withdraw**: a withdrawn referral keeps first position. Can't be undone. |
| Status of a referral closed because the candidate was already presented | **Already presented** | **Déjà présenté** | **Já apresentada** | duplicate, blocked, can't be hired | fr follows the existing masculine referral statuses (Soumis, Retiré); pt the existing feminine ones (Recusada, Retirada). Never write or imply "can't be hired" (C-6). |
| A submission refused by the duplicate check | **stopped** (referral) | **bloquée** (recommandation) | **bloqueada** (indicação) | rejected, refused | Admin metrics and the support email subject only. The composer itself says "Candidate already presented". |
| Admin comparison of two referrals' contact details | **Same · Different · Not available** | **Identique · Différent · Non disponible** | **Igual · Diferente · Indisponível** | match / no match | "match" is the candidate × job result (§5.2). |

### 5.4 Placements & money

| Concept | en | fr-CA | pt-BR | Avoid | Notes |
|---|---|---|---|---|---|
| A reported hire and its finances | **placement** | **placement** | **colocação** | hire *(as the object)*, contratação *(for the object)* | pt "contratação" = the hire event ("Informar contratação"). |
| Total fee the hiring recruiter invoices the client | **placement fee** | **honoraires de placement** | **taxa de colocação** | commission *(for the fee)*, fee *(pt)*, honorários *(pt)* | "Fee" alone is OK in table headers. |
| Each party's part | **share** | **part** | **parte** | cut, allocation *(user-facing)* | "Your share". |
| The whole area / total of shares | **commission** | **commission** | **comissão** | earnings *(except "Highest earnings" sort)* | |
| Ledger states | **Projected → Payable → Paid** | **Prévue → À verser → Versée** | **Prevista → A pagar → Paga** | estimated, owed *(as a state)*, projetada, pagável | Applies to commission (f. in fr/pt). |
| Placement statuses | `labels.placementStatus.*` | | | | Source of truth. |
| Sourcing recruiter receives their share | **payout** | **versement** | **repasse** | transfer, payment *(alone)* | |
| Hiring recruiter pays Workatent's share | **platform remittance** | **versement à la plateforme** | **repasse à plataforma** | remise, remessa | |
| Proof of a payment, or files and earlier referrals backing a prior-presentation objection | **evidence** | **pièce justificative** | **comprovante** | preuve, evidência, proof | Same term in both contexts. Plural is natural in fr/pt (*pièces justificatives*, *comprovantes*). |
| Working day for deadlines | **business day** | **jour ouvrable** | **dia útil** | working day, jour ouvré | Federal + Ontario + Québec holiday calendar (N1 BR-17). |
| Independent check of evidence | **verify / verified** | **vérifier / vérifiée** | **verificar / verificado** | confirm, approve | |
| Record of money entries | **ledger** · **entry** | **registre** · **écriture** | **extrato** · **lançamento** | ledger *(pt)*, livro-razão, journal | |
| Fixing an entry | **correcting entry** | **écriture de correction** | **lançamento de correção** | reversing/compensating entry, contrepassation, estorno *(UI)* | |
| Disagreement resolved by a platform admin (on a placement, a contested prior-presentation objection, or a contested hire report) | **dispute** | **litige** | **disputa** | claim, complaint, objection | Types (`labels.disputeType`): Placement · Prior presentation · Hire report (N3: Déclaration d’embauche · Relato de contratação). |
| Client invoice | **invoice** | **facture** | **fatura** | bill | |
| Sales tax | **sales tax** | **taxes de vente** | **impostos** | GST/HST *(unless explicit)* | ⚖️ Tax handling is an open legal item. Don't explain tax rules. |

### 5.5 Brand & product names
- **Workatent**: one word, capital M and H, never translated. pt uses the article ("o Workatent"). fr uses no article.
- Third-party names are written the way their owners write them: Greenhouse, Lever, Ashby, Workable, Google Sheets, Bullhorn, Zapier, Make, LinkedIn, OpenAI.
- Product areas are capitalized when used as navigation names: Opportunities, Referrals, Commissions, Candidates, Jobs, Activity, Settings › Team. Use the same name in all three locales (e.g. fr "Occasions" everywhere, never "Opportunités" in one place).

### 5.6 Job terms (N2, terms for partners)

Source: `docs/specs/job-terms-card/spec.md` §5 (final copy) and recruiting-input §2. Enum values live in `labels.feeBasis`, `labels.searchType`, `labels.guaranteeRemedy` and `labels.feeDifferenceReason`. fr agrees with *conditions* (f. pl.) and *honoraires* (m. pl.). pt agrees with *termos* (m. pl.) and *taxa* (f.).

| Concept | en | fr-CA | pt-BR | Avoid | Notes |
|---|---|---|---|---|---|
| A job's commercial terms, as the hiring recruiter declares them | **terms** · on the job form: **terms for partners** | **conditions** · **conditions pour les partenaires** | **termos** · **termos para parceiros** | contract, deal, snapshot, card *(user-facing)*, fiche, cartão, modalités | Matches the existing "Review & confirm terms" / « Examiner et confirmer les conditions » / "Analisar e confirmar termos". "Can't be changed for this referral", not "frozen" (frozen is for the split only). |
| One published set of terms | **terms version** ("Version 3" in tight UI) | **version des conditions** ("Version 3") | **versão dos termos** ("Versão 3") | revision, edition | "Terms version {version} · {date}" / « Version {version} des conditions · {date} » / "Versão {version} dos termos · {date}". |
| T1: what the fee is calculated on | **fee basis**: **% of base salary** · **% of total cash** · **flat fee** | **base de calcul des honoraires** : **% du salaire de base** · **% de la rémunération globale** · **honoraires forfaitaires** | **base de cálculo da taxa**: **% do salário-base** · **% da remuneração total** · **taxa fixa** | % of salary *(alone)*, fixed fee, montant fixe, valor fechado | Total cash = **base salary + target bonus** = *salaire de base + prime cible* = *salário-base + bônus-alvo*. Equity, signing bonus, benefits and relocation are excluded. Short form (KPI, lists): "{rate} of base" / « {rate} du salaire de base » / "{rate} do salário-base". |
| T3 | **minimum fee** | **honoraires minimaux** | **taxa mínima** | floor fee, plancher, piso | % bases only. "Minimum fee applies" / « Les honoraires minimaux s'appliquent » / "Vale a taxa mínima". |
| T5: how the client engaged the hiring recruiter | **search type**: **Contingent, exclusive** · **Contingent, shared** · **Retained** | **type de mandat** : **Au succès, exclusif** · **Au succès, non exclusif** · **Avec provision** | **tipo de busca**: **Por sucesso, exclusiva** · **Por sucesso, não exclusiva** · **Com adiantamento** | à contingence, contingência, retainer *(pt, as the label)* | The upfront part of a retained fee = **retainer** / **provision** / **adiantamento**. The split applies to the total fee, retainer included (RD-026). |
| T7: what happens if the hire leaves early | **guarantee** (length in days from the start date) + **remedy**: **Replacement only** · **Replacement, then pro-rata refund** · **Pro-rata refund** · **Full refund** | **garantie** + **recours** : **Remplacement seulement** · **Remplacement, puis remboursement au prorata** · **Remboursement au prorata** · **Remboursement complet** | **garantia** + **solução**: **Somente reposição** · **Reposição e, depois, reembolso proporcional** · **Reembolso proporcional** · **Reembolso integral** | warranty, replacement guarantee *(as the field)*, garantie de remplacement *(as the field)* | "Remedy" is a glossary concept. On screen, its legend reads "If the hire leaves during the guarantee". None = **No guarantee** / **Aucune garantie** / **Sem garantia**. |
| T8 | **client payment terms** ("Net {count} days from the invoice") | **conditions de paiement du client** (« Net {count} jours après la facture ») | **prazo de pagamento do cliente** ("{count} dias após a fatura") | payment delay, délai de paiement, condições de pagamento | The invoice is issued at the start date. 0 days = "Due on the invoice date" / « Payable à la date de la facture » / "À vista, na data da fatura". |
| T9: how long a delivered referral keeps first position with the client | **ownership window** | **période de propriété** | **período de titularidade** | protection period, exclusivity, délai, prazo de exclusividade | Counted in months from **delivery**. Not the same as **first position** (§5.3), which is the rank. "Ownership protected until {date}" stays. An undelivered referral never shows a date. |
| T6: the hiring recruiter's statement | **direct client** ("We hold the fee agreement directly with the end client.") | **client direct** | **cliente direto** | sub-vendor *(user-facing)* | ⚖️ draft. Verb: **states** / **déclare** / **declara**. Fee agreement = **entente d'honoraires** / **contrato de taxa**. |
| Referral sent before N2 | **Terms not recorded (sent before the terms card)** | **Conditions non enregistrées (recommandation antérieure aux conditions du poste)** | **Termos não registrados (indicação anterior aos termos da vaga)** | legacy, unknown terms | The only place "terms card" appears. Use the whole label every time (BR-37). |
| The five fixed lines on every card | **network rules** + the marker "Draft network rules, pending legal review." | **règles du réseau** + « Ébauche des règles du réseau, en attente de révision juridique. » | **regras da rede** + "Rascunho das regras da rede, pendente de revisão jurídica." | platform terms, house rules | ⚖️ draft until N7. The response line never says release (§4). |
| C: fee from the terms and the reported salary | **computed fee** | **honoraires calculés** | **taxa calculada** | contracted fee, expected fee, frozen fee | |
| I: what the hiring recruiter actually invoiced the client for this hire | **invoiced fee** | **honoraires facturés** | **taxa faturada** | actual fee, real fee, honoraires réels | Retainer included, other services excluded. "Invoiced fee is different" / « Les honoraires facturés sont différents » / "A taxa faturada é diferente". |
| I − C | **difference** | **écart** | **diferença** | discount *(unless that's the reason)*, shortfall, perte | Reasons: `labels.feeDifferenceReason`. Always neutral (§3.5). |
| Basis of Workatent's share when I ≠ C | **Calculated on the fee collected** (shipped) · **Calculated on the computed fee** (test value) | **Établie sur les honoraires encaissés** · **Établie sur les honoraires calculés** | **Baseada na taxa recebida** · **Baseada na taxa calculada** | platform cut, commission Workatent | Shown under the platform tile, only when I ≠ C (PD-049). fr/pt use *établie* / *baseada* to avoid "calculée sur les honoraires calculés". |
| Estimate before hire (from the salary band midpoint) | **estimated fee** · **estimated share** (with "~") | **honoraires estimés** · **part estimée** | **taxa estimada** · **parte estimada** | projected *(before hire)*, prévu(e), previsto(a) | Projected / Prévue / Prevista is the ledger state after hire (§5.4). |
| A's share as frozen at commit, on the referral | **expected share** | **part attendue** | **parte esperada** | projected share, part prévue | With no frozen estimate: "{percent} of the fee (fee: {rate} of the base salary at hire)". |
| The salary range on a job | **salary band** | **fourchette salariale** | **faixa salarial** | compensation band *(new copy)*, fourchette de rémunération *(new copy)* | Older keys ("Compensation band", `jobs.form.shareSalary`) are replaced by the N2 card. |
| Concierge change to one referral's terms | **terms amendment** · verb **record** · "Amended on {date}" | **modification des conditions** · **enregistrer** · « Modifiées le {date} » | **alteração dos termos** · **registrar** · "Alterados em {date}" | renegotiation, override, avenant | Platform admin only. Needs both organizations' written requests, and only before a hire (RD-035). ⚖️ amendment rule. |
| The terms that apply to a referral now (snapshot or latest amendment) | **effective terms** | **conditions en vigueur** | **termos vigentes** | current terms *(ambiguous with the job's)*, live terms | Admin console. Members see "Terms" plus the version line. |

**Tone notes for N2 money copy (extends §3.5):**
- **Fee differences:** state both numbers and the rule. Don't comment on why. "The invoiced fee is higher than the computed fee. Shares are never calculated on less than the computed fee, so every share follows the invoiced fee." Use the same sentence for both sides.
- **Negative shares:** they're an obligation, not an error. Use a minus sign from the formatter, a one-line reason, and no danger colour. Say who pays whom: "You pay it to {partner} directly." Never use "owe", "debt", "penalty" or "from your own funds".
- **Money always carries its ISO code** on N2 surfaces ("CAD 20,000.00", « 20 000,00 CAD », "CAD 20.000,00"), including in notifications. This tightens §6.6 for N2: the code appears even when only one currency is on screen.

### 5.7 Network rules and governance

Source: `docs/content/network-rules/` (Network Rules v1, draft), PD-053, `docs/strategy/network-rules-v1.md`. ⚖️ all wording here is pending counsel with the rules themselves.

| Concept | en | fr-CA | pt-BR | Avoid | Notes |
|---|---|---|---|---|---|
| Who joins the network | **your organization joins** · membership of the organization: **joining** | **adhérer** · **adhésion** | **entrar na rede** · **participação** | "your organization is the member" | **member** stays the person (§5.1). Don't call the organization a member. Leaving: "{org} is no longer part of the Workatent network." / « {org} ne fait plus partie du réseau Workatent. » / "{org} não faz mais parte da rede Workatent." (`network.partner.noLongerMember`; PD-065 replaced the PD-057 "no longer a member" exception, so there's no exception any more). |
| Not following a rule | **breach** | **manquement** | **violação** | violation *(en)*, infraction, faute; pt infração, descumprimento *(as the noun)* | Verb: "break the rules" / « enfreindre les règles » / "descumprir as regras". |
| A member's report that another member broke the rules | **conduct report** · verb **report** · button **Report a problem** | **signalement** · **signaler** · **Signaler un problème** | **relato de conduta** · **relatar** · **Relatar um problema** | complaint, accusation; fr plainte, dénonciation; pt denúncia, reclamação | Not a **dispute** (§5.4). It can lead to a sanction, never to an amount. |
| Measures for a breach | **sanction** | **sanction** | **sanção** | penalty, punishment | Four levels, always in this order. |
| Level 1 | **warning** | **avertissement** | **advertência** | strike | Counts for 12 months. |
| Level 2: no new partner activity, referrals in progress continue | **network hold** | **restriction réseau** (f.) | **restrição de rede** | partial suspension, freeze, gel, bloqueio, pause *(for this)* | Not the same as a job **paused** for partners (rule 4.6). |
| Level 3 | **suspension** | **suspension** | **suspensão** | ban, block | Organization access to Workatent is suspended (existing admin action). |
| Level 4 | **termination** (the organization is removed from the network) | **exclusion** | **exclusão** | expulsion, ban; fr résiliation *(in member copy)* | Can reapply after 12 months (rule 9.7). |
| A second admin's look at a sanction | **review** | **révision** | **revisão** | appeal, appel, recurso | One review per sanction (rule 9.6). |
| The sourcing side's report of a hire on a referral | **hire report** (see §5.8) | **déclaration d’embauche** | **relato de contratação** | see §5.8 | Moved to §5.8 (N3). pt changed from "registro da contratação". |
| A member's formal statement of fact (e.g. the authorization checkbox) | **attestation** · verb **confirm** | **attestation** | **declaração** | certification, sworn statement | Rule 4.2. A false one is a breach of rule 4.8. |
| The rules document (proper name) | **Network Rules** · with a version: "Network Rules {label}" | **Règles du réseau** · « version {label} des Règles du réseau » | **Regras da rede** · "versão {label} das Regras da rede" | house rules, code of conduct, terms; fr Règlement; pt Regulamento | N10. Capitalized as a name in every locale (fr/pt: first word only). Lower case "network rules" stays for the N2 card lines (§5.6). |
| Agreeing to a rules version | **accept** · **acceptance** | **accepter** · **acceptation** | **aceitar** · **aceite** | agree, sign, consent; fr adhésion *(that's joining)*; pt aceitação | Two separate acceptances: by the organization (an organization admin, "on behalf of {org}") and by each member. "I have the authority" / « j'ai le pouvoir » / "tenho poderes": never "authorized", which belongs to the candidate's **authorization** (§5.3). |
| Version types | **Material change** · **Minor change** · **Required by law** · **First version** | **Modification importante** · **Modification mineure** · **Exigée par la loi** · **Première version** | **Mudança relevante** · **Mudança menor** · **Exigida por lei** · **Primeira versão** | substantial, minor update | `labels.rulesVersionType`. Matches rule 10.2 in each file. |
| Workatent's written notice to a reported organization | **notice** | **avis** (m.) | **aviso** | warning *(that's level 1)*, notification *(in-app)*; fr mise en demeure; pt notificação | Regular notice or immediate-hold notice. Every notice carries the fixed possible-outcomes line (RD-049). |
| The admin's conclusion that a rule was broken | **finding** | **constat** | **constatação** | verdict, ruling, judgment | Outcomes (`labels.conductOutcome`): **No breach found · Not enough evidence · Breach found** = **Aucun manquement constaté · Pièces insuffisantes · Manquement constaté** = **Nenhuma violação constatada · Comprovantes insuficientes · Violação constatada**. |
| What the reporter sees (`network.reports.outcome`) | **Action taken · No breach found · Not enough evidence to act · Closed without a finding**; open status **Looking into it** | **Mesures prises · Aucun manquement constaté · Pièces insuffisantes pour agir · Fermé sans constat**; **En examen** | **Medidas tomadas · Nenhuma violação constatada · Comprovantes insuficientes para agir · Encerrado sem constatação**; **Em análise** | In review, under review *(review is the 9.6 word)*, sanction applied | RD-045. Never the level. Every outcome adds "This report doesn't change your referral, your first position or any amount owed." |
| Ending a hold, suspension or termination | **lift** · **lifted** | **lever** · **levée** | **encerrar** · **encerrada** | remove, cancel; pt suspender, levantar, revogar | pt avoids "suspender a restrição" (collides with **suspensão**). |
| The org-admin page for notices and sanctions; the clean state | **Network standing** · **Good standing** | **Statut réseau** · **En règle** | **Situação na rede** · **Regular** | record, reputation, score | Settings tab, `org_admin` only. |
| Suspended or terminated org that can still settle | **settlement mode** | **mode finalisation** | **modo de finalização** | read-only mode, liquidation; fr mode règlement *(reads as "payment method" or "regulation")*; pt liquidação, modo de acerto | Only referrals in progress and open obligations. "Settle commissions" = « régler les commissions » = "acertar as comissões". |
| The fixed partner-facing sentence for any restriction | "{org} **isn't taking new referrals right now**." | « {org} **n'accepte pas de nouvelles recommandations pour le moment**. » | "{org} **não está recebendo novas indicações no momento**." | paused, blocked, on hold, suspended | BR-14. One key, byte-identical for every reason. Never add a cause. |
| A conduct report as an admin queue item (admin only) | **case** · **conduct case** | **dossier** · **dossier de conduite** | **caso** · **caso de conduta** | ticket, complaint | Members never see "case": the reporter sees "report", the reported org sees "notice". |
| Who sent the report (admin only) | **reporter** | **signalant** | **autor do relato** | complainant, accuser; fr plaignant, dénonciateur; pt denunciante, relator | The reported org is the **reported organization** / **organisation signalée** / **organização relatada**. |
| Factual notice to orgs whose data a partner shared (2.3 finding) | **data incident notice** | **avis d'incident lié à des renseignements** | **aviso de incidente com dados** | breach notice, leak; fr incident de confidentialité *(Law 25 term, until counsel says otherwise)*; pt vazamento | ⚖️ C-4. Never names the sanction or the reporter. Two fixed guidance lines by the recipient's side on the referrals concerned: **sourcing side** (revoke / withdraw / release) and **hiring side** (no revoke / withdraw / release advice: those are sourcing-side tools). Admin labels use the §5.1 side names: **Sourcing side · Hiring side** / **Recruteur d'origine · Recruteur du poste** / **Recrutador de origem · Recrutador da vaga**. |
| Who decided, in member-facing copy | **a Workatent platform admin** | **un administrateur de la plateforme Workatent** | **um admin da plataforma Workatent** | the admin's name | PD-058 (Q-D13): neither the deciding nor the reviewing admin is named to the organization. |

### 5.8 Hire records and hire reports (N3)

Source: `docs/specs/referral-claims-two-sided-hire/brief.md` (rev. 1, PD-071), RD-050 to RD-055, rules 6.3, 6.4 and 7.2 drafts in `docs/content/network-rules-n3.md`. ⚖️ legal wording (6.3, 6.4, 7.2, non-permanent engagement, void) is pending counsel.

**The two paths have two different words, in every locale.** The hiring side **records a hire**. The sourcing side files a **hire report**. "Claim" isn't used for either (§5.3).

| Concept | en | fr-CA | pt-BR | Avoid | Notes |
|---|---|---|---|---|---|
| The hiring side enters a hire on a referral (any status, BR-7) | **record a hire** · button **Record hire** | **enregistrer l’embauche** · **Enregistrer l’embauche** | **registrar a contratação** · **Registrar contratação** | report a hire *(that's the sourcing side)*, log; fr déclarer *(that's the hire report)*; pt informar contratação, relatar | **Today's copy uses "Report hire" for this action** (`pipeline.reportHire`, `referrals.hire.trigger` / `title`; fr « Déclarer une embauche », pt "Informar contratação"). Renamed in N3 spec §5 (values only; `labels.placementStatus.hire_reported` becomes **Hire recorded** / **Embauche enregistrée** / **Contratação registrada**). The result is still a **placement** (§5.4). On a released referral, the result is a hire recorded without a split. |
| The sourcing side's dated, evidenced report that the client hired its candidate | **hire report** · verb **report a hire** · button **Report a hire** | **déclaration d’embauche** (f.) · **déclarer une embauche** · **Déclarer une embauche** | **relato de contratação** (m.) · **relatar uma contratação** · **Relatar contratação** | claim, inquiry, hire claim, backdoor report; fr réclamation, revendication, signalement *(that's a conduct report)*; pt registro da contratação *(reads as the hiring side's record)*, informe, denúncia, alegação | RD-050, PD-028. Always needs at least one dated piece of evidence. pt follows the conduct-report pattern (**relato** / **relatar**, §5.7). Outcomes reuse §5.3: **Upheld · Not upheld** = **Retenue · Non retenue** = **Mantido · Não mantido**, plus **Not this client** = **Pas ce client** = **Não é este cliente** (the only finding the sourcing side sees about the client). Today's `admin.blockedHired` uses "hire report" for the hiring side's record: reword in N3 §5. |
| The hiring side challenges a hire report | **contest** · noun **contest** | **contester** · **contestation** | **contestar** · **contestação** | deny, dispute *(verb)*, reject; fr refuser; pt negar, impugnar | Same word as for objections (§5.3). Opens a **dispute** of type Hire report. Four reasons: Not hired · Outside the window · Different person · Not this client (wording in §5 of the spec, ⚖️ Q-3 for "not hired"). |
| The sourcing side's one answer to a contest (5 business days) | **rebuttal** · verb **add a rebuttal** | **réplique** (f.) · **ajouter une réplique** | **réplica** · **apresentar uma réplica** | response, reply, appeal, counter-claim; fr réponse, appel, contre-preuve *(uses preuve)*; pt resposta, recurso, tréplica | Only one per contest. fr and pt use the usual procedure terms that follow a *contestation* / *contestação*. Never "appeal": the review of a sanction is **review** (§5.7). |
| A hire is deemed confirmed because the hiring side didn't answer in time and the email notice reached two people (BR-29) | **deemed confirmed** · noun **deemed confirmation** | **réputée confirmée** · **confirmation réputée** | **considerada confirmada** · **confirmação tácita** | auto-confirmed, automatically confirmed, implied; fr confirmée automatiquement, présumée; pt confirmada automaticamente, presumida | **Ships with N7.** fr *réputé* is the Civil Code term for "deemed". **en member UI** says "Confirmed on {date}: no answer by the deadline" and the label "Confirmed (no answer)" (plainer). "Deemed" is for the rules and admin copy. fr uses « Réputée confirmée » everywhere; pt uses "considerado(a) confirmado(a)" in sentences and "Confirmado (sem resposta)" as the label. ⚖️ with rule 7.2. |
| Placement state: hire established, fee details not entered yet (BR-31) | **Fee details pending** · long: "Fee details pending from the hiring recruiter" | **Détails des honoraires en attente** · « Détails des honoraires attendus du recruteur du poste » | **Detalhes da taxa pendentes** · "Detalhes da taxa aguardando o recrutador da vaga" | fee pending *(alone, reads as unpaid)*, unpaid, awaiting payment *(that's the ledger)*, fee unknown; fr honoraires impayés; pt taxa em aberto | **Fee details** = start date, base salary, bonus, invoiced fee and reason = *détails des honoraires* = *detalhes da taxa*. Show the frozen estimate labelled as an estimate (§5.6, **estimated fee**), never as the fee. "Pending" is fine here: it's a placement state, not a referral (§5.3 "in progress"). |
| The one referral a hire attaches to: the counting referral for that candidate, hiring organization and client (BR-3) | **governing referral** | **recommandation de référence** | **indicação de referência** | counting referral, original referral, main referral, first referral; fr recommandation applicable / principale; pt indicação principal / original | **Admin console, docs and specs.** Member copy says "this referral" or "the referral that has first position" (rule 6.4), because members already know **first position** (§5.3). |
| I ≠ C reason for a contractor, PJ, EOR, payroll-provider, affiliate or other-agency engagement (BR-15) | **Non-permanent engagement** | **Engagement non permanent** | **Contratação não permanente** | contract hire, temp, freelance; fr contrat temporaire, pigiste; pt temporário, terceirizado, contrato PJ *(as the label)* | `labels.feeDifferenceReason.non_permanent_engagement`. ⚖️ Q-3, helper text is a draft. It's still a hire (RD-055): never imply it isn't. pt uses *contratação* on purpose, and the helper can name PJ. |
| A referral whose candidate authorization or confirmation an admin found invalid (BR-37) | **void** | **invalidée** | **invalidada** | voided by Workatent, cancelled; fr annulée *(that's the Cancelled status)*; pt anulada, cancelada | It stops counting: no first position, no fee. ⚖️ voiding wording (RD-029). Shown as an admin outcome and on the source org's referral. |
| The client's process that led to the hire, used in the coverage test (rule 6.3) | **selection process** (starts with a first interview or assessment) | **processus de sélection** | **processo seletivo** | hiring process *(ambiguous with the hire itself)*; fr processus d’embauche; pt processo de contratação | Contest reason "Outside the window" asks for the date it started. |
| A hire recorded with no placement (released referral, or no confirmed agreement while the deemed-agreement flag is off) | **hire recorded without a split** | **embauche enregistrée sans partage** | **contratação registrada sem divisão** | record-only hire *(team word)*, no-split hire; fr embauche sans commission; pt contratação sem comissão | To the hiring side on a released referral, always "This referral doesn't carry a split" / « Cette recommandation ne donne pas lieu à un partage » / "Esta indicação não gera divisão". Never give the reason (RD-054). |
| The RD-029 challenge to a candidate's authorization or confirmation | **authorization check** | **vérification de l’autorisation** | **verificação da autorização** | consent check, audit, investigation; fr contrôle, enquête; pt auditoria, checagem | Outcomes: **valid** / **invalid** = *valide* / *invalide* = *válida* / *inválida*. Invalid makes the referral **void**. ⚖️ RD-029. |
| An organization that shares a member with the hiring recruiter's organization | **related organization** | **organisation liée** | **organização relacionada** | sister org *(team word)*, affiliate *(that's the client's group)*; fr organisation sœur, société affiliée; pt organização irmã, empresa do grupo | Rule 6.3 (PD-076): its placement at the client counts as the hiring recruiter's hire. Admin note in N3, no member-facing field. ⚖️ |
| Free-text field where a member explains, in a hire report or a contest | **statement** | **explication** | **explicação** | fr déclaration *(that's the hire report)*; pt relato *(that's the hire report)*, declaração *(that's the attestation, §5.7)* | Keeps the field label apart from the object it belongs to. |

---

## 6. Mechanics

### 6.1 Capitalization
- **Sentence case everywhere**: titles, buttons, tabs, labels, menu items, email subjects ("Review & submit", "Record client invoice"). Capitalize only the first word and proper nouns.
- Status labels are sentence case ("Under review"). Mid-sentence they stay as written in `labels` (lower-case values like `labels.travel.*` are designed to sit mid-sentence).
- Don't use all caps except the **DEMO** badge.
- fr and pt follow their own sentence-case rules (no title case). Don't capitalize days, months or languages.

### 6.2 Punctuation
- **Full sentences end with a period**: descriptions, hints, errors, toasts. **Fragments don't**: labels, buttons, titles, short validation messages ("Enter a job title"). Within one file, a group of sibling keys follows the same rule.
- **Ellipsis**: use the single character `…`, for in-progress states ("Saving…") and truncated search prompts. Never three dots.
- **Quotes**: curly quotes in en ("“Resume file”") and pt (“ ”). fr uses « guillemets » with non-breaking spaces. Never use straight `"` or `'` in visible text (`\"` in JSON is a smell).
- **Apostrophes**: en typographic `’` is preferred but straight `'` is tolerated (current baseline). **fr must pick one per file**, and `’` is preferred. Mixing them in the same email is a defect.
- **fr-CA spacing**: non-breaking space before `:` and inside « ». No space before `?`, `!` or `;` (Québec usage; the current copy follows this, so keep it). Write `%` as `45 %` with a non-breaking space.
- **pt**: `45%` with no space. `ex.:` for "e.g.".
- **Ampersand `&`**: OK in short labels and headings ("Source & privacy", "Review & submit"). In sentences, use "and / et / e".
- **Middle dot `·`**: the separator for metadata on one line ("Synced 2h ago · 3 new"). Keep spaces around it.
- **Em dash `—`**: use sparingly in UI. Prefer a period or a colon. `—` alone (`common.none`) means "no value".
- **Exclamation marks**: welcome only.
- **Lists in a sentence**: no serial (Oxford) comma in en ("skills, seniority and location"), matching the current copy. Add one only if the sentence is ambiguous without it.

### 6.3 Buttons and links
- **Verb first, says what happens**: "Submit candidate", "Record hire", "Revoke key", "Turn on matching". Not "OK", "Yes" or "Submit" alone when the object is unclear.
- The confirm button in a dialog repeats the title's verb ("Decline this candidate?" → "Decline").
- Primary and secondary pair: "Save changes" / "Cancel". "Cancel" always closes without changes. Don't use "Cancel" for a status change. The referral status action "Cancel" is a known conflict (see the audit).
- Link text makes sense on its own: "View opportunities", not "click here" or "here".
- Destructive buttons say "permanently" when it is permanent ("Anonymize permanently").
- Progressive form for pending state: "Submit candidate" → "Submitting…".
- Length: en button ≤ 25 characters. Leave **30% room for fr** (fr is about 20–30% longer). Truncation is a bug.

### 6.4 Numbers
- Formatting comes from `format.ts` (`Intl`, `en-CA` / `fr-CA` / `pt-BR`). Never hard-code separators in strings.
- Use numerals for every count ("3 candidates"), including 1 when it's a count.
- Ranges use an en dash with no spaces in en: "10–2000 characters". In fr/pt write "10 à 2000" / "10 a 2000".
- Percentages: `45%` (en, pt), `45 %` (fr). The split is written **45/45/10** in all locales.
- Scores: "{score} out of 100" / "{score} sur 100" / "{score} em 100". Always qualify as indicative.

### 6.5 Dates and times
- Always format through `f.date()` / `f.relative()`. Never write dates in strings.
- Examples inside hints use the locale's natural short date: en "Nov 6", fr "6 nov.", pt "6 nov.". Don't use ISO (`2026-11-06`) in visible text.
- Relative times ("{time}") read naturally after a verb: "Synced {when}", "Submitted {time}".
- Deadlines state the timezone only when it matters (it rarely does in v1). **Business-day deadlines do** (N1 objections and contests end at 23:59 in Toronto): en `{when} ET`, fr `{when} HE` (heure de l'Est), pt `{when} (horário de Toronto)` in sentences and `{when} (Toronto)` in compact lines (chips, file rows).
- Expiry wording: "The link expires in 1 hour" (duration) / "This link expires on {date}" (date).

### 6.6 Money and CAD
- All amounts are stored in minor units with an ISO currency code. Display with `f.money(minor, currency)`. Never concatenate "$" in a string.
- **CAD is the default currency**, but every placement keeps its own currency. Never imply conversion. "Totals include only {currency} placements; other currencies are listed below and never converted." ✓
- Write the currency whenever more than one currency could appear, or in any form field ("Amount ({currency})").
- Estimated amounts get a tilde and a qualifier: "~{amount} for you", "~{amount} projected".
- Never say money "moves", "is sent" or "is paid" *by* Workatent. Payments happen between organizations. Workatent records and verifies evidence.
- Taxes: say "before tax" / "avant taxes" / "antes de impostos". Don't explain GST/HST/QST ⚖️.

### 6.7 Plurals
- Use ICU-style objects `{ "one": …, "other": … }` with `{count}` in **both** branches.
- **fr-CA and pt-BR treat 0 as "one"** (`Intl.PluralRules`: 0 → one). So never hard-code "1" in a `one` branch ("1 offre trouvée" would display for 0). Always use `{count}`.
- Don't build plurals with "(s)" ("candidat(s)").
- When a number is 0, prefer an empty state over "0 results".

### 6.8 Placeholders and interpolation
- Interpolate with `{name}`. Never concatenate translated fragments. Put the whole sentence in one key so fr and pt can reorder it. Exception from `src/i18n/README.md`: a link inside a sentence uses three keys named **`…Before` / `…Link` / `…After`**.
- Placeholder names describe the value: `{candidate}`, `{partner}`, `{job}`, `{org}`, `{amount}`, `{date}`, `{time}`, `{count}`, `{email}`.
- **Input placeholders** show an example, not the label: "e.g. Senior backend engineer, fintech". Start with "e.g." / "p. ex." / "ex.:". Never put required instructions only in a placeholder; use a hint.
- **Hints** (helper text) are full sentences when they explain, and fragments when they show format ("2-letter code").
- Stored data (candidate names, job titles, client names) is never translated.

### 6.9 Accessibility
- `aria-label`s are verb + object + name: "Save {name} for {job}", "Remove {country}".
- Alt text describes the image's purpose in ≤ 125 characters. Decorative images get `alt=""`.
- Screen-reader-only keys end in `Sr` ("doneSr", "stepSr").
- Statuses always pair an icon with text (product rule). The text must stand on its own.

### 6.10 English spelling
Canadian English: **-ize** (organize, authorize, recognize), **-our** (colour, behaviour), **cancelled**, **cheque**, **résumé → "resume"** (keep the current unaccented "resume" for UI). Not British "-ise" ("recognised" ✗).

---

## 7. Localization notes

### fr-CA
- Use Québec vocabulary: *courriel* (never "e-mail" in visible text), *téléverser*, *clavarder*, *occasion* (not "opportunité"), *jumelage*, *rétroaction*, *entrevue*, *fin de semaine*.
- Use *vous* everywhere, including candidates.
- Gender agreement follows the noun the label refers to: referral statuses agree with *recommandation* (f.): **Soumise, Acceptée, Refusée, Retirée, Annulée**. Job statuses agree with *poste* (m.).
- Infinitive for buttons ("Enregistrer", "Soumettre le candidat"). Imperative *vous* for instructions ("Entrez un titre").
- Expect +20–30% length. Check buttons, tabs and table headers.

### pt-BR
- Use *você*. Keep a friendly but professional register ("Fale com a gente" is OK in emails, not in errors).
- Established anglicisms that recruiters use are accepted: **match, matching, pipeline, workspace** *(only in "endereço do workspace")*. Others are not: snapshot, sourcing, fee, ledger, feedback *(prefer "retorno" in formal text; "feedback" tolerated)*.
- Imperative for buttons ("Salvar", "Enviar candidato"). "Informe…" for field validation.
- Seniority values are person-levels: *Estagiário, Júnior, Pleno, Sênior…*.

---

## 8. i18n key naming (observed conventions)

These rules describe what the JSON files already do. New keys follow them. Deviations are listed in the audit.

### 8.1 Files and namespaces
- **One namespace per product area**, matching `src/features/<area>`: `candidates`, `jobs`, `opportunities`, `referrals`, `commissions`, `pipeline`, `overview`, `activity`, `settings`, `connectors`, `onboarding`, `auth`, `profile`, `admin`, `landing`, `emails`, `candidate` (the public confirmation page).
- **Shared namespaces**: `common` (generic actions, account menu, location pickers), `errors` (server error markers returned by `msg()` / `guard()`), `labels` (enum values), `nav` (sidebar).
- All three locale files have identical key trees. `fr`/`pt` are type-checked against `en`.

### 8.2 Key casing
- **camelCase** for UI keys: `searchPlaceholder`, `emptyFilteredTitle`, `flashPublished`.
- **snake_case only when the key *is* a data value** coming from the DB or the domain:
  - enum values in `labels` (`active_for_matching`, `hire_reported`), and enum-keyed maps elsewhere (`referrals.actions.info_requested`, `commissions.detail.entryType.allocation_reversal`, `opportunities.dismissReasons.candidate_not_interested`, `connectors.providers.google_sheets`);
  - DB/RPC error codes at the root of `errors` (`slug_taken`, `four_eyes_required`). App-side generic errors in `errors` are camelCase (`invalidFields`, `rateLimited`).
- Numeric keys only for enum-like numeric options (`connectors.interval.15`).

### 8.3 Standard keys and groups

| Purpose | Convention | Examples |
|---|---|---|
| Page heading / intro | `title`, `description` (root, or under a sub-page object) | `jobs.title`, `referrals.pages.received.description` |
| Browser tab title when it differs from `title` | `metaTitle` | `candidates.detail.metaTitle`, `onboarding.metaTitle` |
| Empty states | `empty.{title, description, action}`, with a sub-object per variant | `referrals.empty.sent.title`, `opportunities.empty.caughtUp.description` |
| Forms | `form.<field>`, `form.<field>Hint`, `form.<field>Placeholder`, `form.submit` / `form.saveChanges` | `jobs.form.requiredSkillsHint`, `candidates.form.skillsPlaceholder` |
| Client/Zod validation | `validation.<rule>` imperative fragment | `jobs.validation.titleRequired` |
| Feature errors | `errors.<case>` full sentence | `candidates.errors.fileSize` |
| Toasts / flashes after an action | `messages.<pastTense>` (most namespaces). Page flashes use `flash<Thing>` or `<thing>Flash` | `commissions.messages.invoiceRecorded`, `jobs.detail.flashPublished` |
| Confirm dialogs | `<action>Title`, `<action>Description`, `<action>Confirm` | `connectors.connection.disconnectTitle` |
| In-progress button | gerund of the action key | `submit` → `submitting`, `invite` → `inviting` |
| Table | `columns.<col>` or `table.<col>`, plus `caption` for the `<caption>` | `referrals.columns.status`, `commissions.table.caption` |
| Accessibility-only | suffix `Aria` (label with a name), `Sr` (screen-reader text) | `opportunities.triage.saveAria`, `overview.gettingStarted.stepSr` |
| Plurals | object with `one` / `other`, both containing `{count}` | `candidates.import.submit` |
| Link inside a sentence | `<key>Before`, `<key>Link`, `<key>After` | (target pattern; see audit for `noneInactive…` and `auth…`) |
| Enum labels for display | always `labels.<enum>.<value>`, never duplicated in feature namespaces | `labels.referralStatus.offer` |
| Detail / show page | `detail.*` | `jobs.detail.kpiStrong` |
| Create / edit pages | `new.*`, `edit.*` | `candidates.new.submit` |

### 8.4 Rules for new keys
1. Name keys by **meaning, not by text**: `declineHint`, not `shareJobRelatedFeedback`. Then the text can change without renaming.
2. **Don't reuse a key across contexts** just because the English matches. "Cancel" the button (`common.actions.cancel`) and "Cancelled" the status are different keys.
3. Put generic actions in `common.actions` and use them. Don't add `cancel` to every namespace (several namespaces do this today; see the audit).
4. Use `messages` for success toasts (not `success`), `errors` for failures, and `validation` for field rules.
5. Use `description` for subtitles and dialog bodies. Don't add new `body` / `subtitle` / `intro` variants. (Existing ones in `candidate`, `onboarding` and `landing` can stay until those files are touched.)
6. When a new term enters the product, add it to §5 in the same PR.
