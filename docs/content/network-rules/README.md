# Network Rules v1: member-facing text

- **Owner:** UX Writer & Marketing · **Date:** 2026-11-15 · **Status:** v1 — draft. Founder and counsel approval come next (PD-053.7). Nothing here is public until it's approved.
- **Source:** `docs/strategy/network-rules-v1.md` (recruitment-strategist), PD-053, RD-037 to RD-043.
- **Files:** [`en.md`](./en.md) · [`fr-CA.md`](./fr-CA.md) (offered first in Québec) · [`pt-BR.md`](./pt-BR.md). Rule numbers (1.1 to 10.6) are the same as the source and the same in all three files.
- **Markers (HTML comments, so they don't render):** `<!-- ⚖️ counsel: … -->` next to each clause pending legal review · `<!-- ships with X -->…<!-- /ships with X -->` around text for a mechanism that doesn't exist yet. Open values are written `[TODO: …]`. Each file lists all of these in a comment at the top. Comments are in English in all three files, so counsel can grep one set of markers.

## Length and reading time

| | Words (visible text, everything included) | Words if published today (without "ships later" text) | Reading time |
|---|---|---|---|
| Source (member-facing part) | ~2,050 | — | ~9 min |
| en | ~1,950 | ~1,890 | **~8.5 min** |
| fr-CA | ~2,300 (estimate) | ~2,230 | **~12 min** |
| pt-BR | ~2,050 (estimate) | ~1,990 | **~11 min** |

- **How I counted:** en was counted by hand, rule by rule (about ±3%). fr-CA and pt-BR are estimates from the en count and the usual expansion of each language. I had no word-count tool, so confirm with: `sed -e 's/<!--[^>]*-->//g' en.md | sed '/<!--/,/-->/d' | wc -w` (same for the other two files).
- **Reading rates:** standard silent reading rates for each language (IReST, Trauzettel-Klosinski et al., 2012): English ~228, French ~195, Portuguese ~181 words per minute. Dense rules text will read slower.
- **The 5-minute target isn't reachable without dropping or merging obligations.** The source says it has about 1,500 words, but by my count its member-facing part has about 2,050. Five minutes in English is about 1,150 to 1,200 words. I trimmed wording only, as asked, and every rule keeps all of its obligations. The en text is about 5% shorter than the source. Options for the founder (not done):
  1. A non-binding "key points" summary of about 150 words on the acceptance screen, with a link to the full rules. ⚖️ Counsel should confirm that a summary can't be read as changing the rules.
  2. Move clarifying examples (for example the list in 2.4, or the evidence list in 3.5) into help content. That saves about 40 words, and the rules get less clear.

## Trims and wording changes vs the source

Obligations, numbers, deadlines and exceptions are unchanged. Changes by rule (en; fr-CA and pt-BR follow them):

| Rule | Source | Final (en) | Why |
|---|---|---|---|
| Header / intro | "They protect your candidates, your clients and your fees, and they are part of the agreement…" | The "protect" line moved into the one-sentence header. The intro keeps "part of the agreement your organization accepts". | No repetition. |
| 1.1 | "Your organization is the member." | "Your organization is the one that joins." | Glossary: **member** means a person (§5.1). The source used "member" for both the organization and the person. |
| 1.3 | "Tell us within 30 days if your organization changes ownership or control." | "Tell us within 30 days if ownership or control changes." | Shorter. |
| 1.4 | "Membership is not exclusive." | "Joining isn't exclusive." | Same reason as 1.1. |
| 2.1 | "is for one purpose: that referral…" | "is only for that referral…" | Shorter. |
| 2.2 | "That means no searching… no adding… no contacting…" | One list: "finding… adding… or contacting…" | Shorter. Same three prohibitions. |
| 2.6 | Expiry sentence first, revocation second | Revocation first (can be published now), then expiry (ships later) | So the text that ships later is one sentence you can remove (as the source's internal note asks). |
| 3.1 | "Tell the candidate you are working with {sourcing recruiter} through Workatent." | "Name the sourcing recruiter to the candidate, and say you’re working together through Workatent." | Removes the template placeholder. Same duty. |
| 3.3 | "This applies for as long as the referral and the resulting placement last." | "This lasts as long as the referral and any resulting placement." | Shorter. "Any" covers referrals that end without a hire. Decided (PD-054): now explicit — through the guarantee and the final payout. |
| 3.4 | "take a direct mandate from the client" | "take the same job directly from the client" | Plain language. fr-CA keeps « mandat direct » because it's the usual Québec term. |
| 3.5 | "(signed terms, an invoice or an active job you can show)", "so you can agree…" | "(shown by signed terms, an invoice or an active job)", "to agree…" | Shorter. Keeps the internal note's point that evidence is needed only if challenged (it doesn't say to disclose anything up front). |
| 3.6 | "neither the sourcing nor the hiring recruiter" | "neither recruiter" (en). fr-CA and pt-BR name both sides. | Shorter in en. In fr and pt, the short form was ambiguous. |
| 4.3 | "If another recruiter wants to take part, they can join Workatent." | "Other recruiters can join Workatent to take part." | Shorter. |
| 4.5 | "jobs open to referrals" | "jobs open to partners" | Same phrase as 4.4 and 4.6. |
| 4.6 | Three sentences | Same text. The last two are in "ships with P1-5" markers | As the source's internal note says. |
| 4.8 | "claims, evidence…"; "Forged evidence and confirmations you control" | "objections, evidence…"; "Forged evidence and false candidate confirmations" | Glossary §5.3: "claim" is reserved for N3, and the hiring side's statement is an **objection**. "False candidate confirmations" is the same wording as 9.4. See the open items below. |
| 6.1 | "The terms on a job's card" | "The terms on a job" | Glossary §4: no "card" in member-facing copy. |
| 6.3 | "The first referral delivered wins." / "prior-presentation claim" | "The first referral delivered has first position." / "prior-presentation objection" | Glossary terms (**first position**, **objection**). |
| 6.7 | "the remedy on the card applies… If there is a replacement" | "the remedy in the terms applies… If a replacement is due" | No "card". Clearer trigger. |
| 7.1 | "a claim, hire report, placement dispute or conduct report" | "an objection, a hire report, a dispute or a conduct report" | Glossary. See the open items below. |
| 7.2 | Two sentences for the two 10-business-day deadlines | "You have 10 business days to contest an objection or to answer a hire report." | Shorter. Both deadlines are kept. |
| 7.3 | "only with the hiring recruiter's permission" | "only if the hiring recruiter agrees" | "Permission" is easy to confuse with candidate authorization (§4). |
| 8.1 | "report it from the referral or the job ("Report a problem")" | The same sentence in "ships with P0-3" markers, plus an alternative "by email at [TODO: support address]" for now | The source's internal note: the support address is used until P0-3 ships. The address is a user decision (PD-025). |
| 8.5 | "Reports made in bad faith are a breach." | "Reporting in bad faith is a breach." | Shorter. |
| 9.1, 9.7 | "your membership ends" / "whose membership was terminated" | "your organization is removed from the network" / "removed from the network" | Same reason as 1.1. |
| 10.4 | "A change to the rules" | "A rule change" | Shorter. |

## Glossary added to `docs/content/voice-and-tone.md`

- **§5.3, new row: in progress / en cours / em andamento.** It means a referral from submission until it is hired, declined, rejected, withdrawn, cancelled or released. It matches the existing `overview` copy. It isn't a status label.
- **§5.7 Network rules and governance (new section):** joining / adhésion / participação (the organization joins, and a member is always a person) · **breach** / manquement / violação · **conduct report** / signalement / relato de conduta, with the button "Report a problem" / « Signaler un problème » / "Relatar um problema" · **sanction** / sanction / sanção · **warning** / avertissement / advertência · **network hold** / restriction réseau / restrição de rede · **suspension** / suspension / suspensão · **termination** / exclusion / exclusão · **review** / révision / revisão · **hire report** / déclaration d’embauche / registro da contratação (from existing UI copy) · **attestation** / attestation / declaração.

## For the founder

1. **3.3 duration — decided 2026-11-15 (PD-054): through the guarantee and the final payout; rule text updated in all three files.** Original note: The text follows the strategist's draft: the rule lasts through the referral **and the resulting placement** (through the guarantee and the final payout, RD-039). If you decide it ends at hire, replace the last sentence with "This lasts until the referral is hired or closed." (fr: « Cette règle s’applique jusqu’à l’embauche ou à la fermeture de la recommandation. » pt: "Isso vale até a contratação ou o encerramento da indicação.") Then late payment needs its own sentence, because the strategist rejected an end-at-hire rule for exactly that reason.
2. **Reading time** (see above). Decide whether a short summary is worth adding.
3. **Promises that have to be true before publication.** These sentences describe the product, so the product has to do them:
   - 9.1 level 2: "Partners see only that you aren't taking new referrals" (network hold ships with P0-3).
   - 9.5: obligations continue during a suspension. Today a suspension blocks all member access, so a suspended organization can't record payouts or answer disputes on Workatent (the strategist's product gap for the PM).
   - 4.5: "Only platform admins see it" (the end client, RD-020).
   - 6.6: "Late payouts show in your record" (RD-007, "% paid on time").
   - 8.4: "We aim to respond within 2 business days." This is a staffing commitment.
   - 10.1 to 10.3: versioned acceptance and blocking new partner activity (P0-2).
4. **Placeholders to fill:** effective date, Workatent fee terms (6.8, RD-008/009/012), support address (8.1, PD-025), and every value in 7.5 and 10.6.

## For counsel (beyond the ⚖️ index in each file)

1. **4.4:** "Your ownership window can't be shorter than the one in your client terms." The source says "than your client terms". I read that as the candidate-introduction (protection) period in the client contract. The strategist and counsel should confirm what is being compared.
2. **4.8:** the source's "confirmations you control" (for example, a candidate confirmation sent to an email the recruiter controls) became "false candidate confirmations". Confirm it still covers that case.
3. **7.1:** "claim" became "objection". If the strategist meant the N3 sourcing-side claims, add "a claim" when N3 ships.
4. **7.5 terms of art:** "binding arbitration" became « arbitrage final et exécutoire » and "arbitragem vinculante". Counsel should set these with the clause, including any adhesion-contract formalities for arbitration in each jurisdiction (Québec; Brazil later).
5. **1.3 licences:** "recruiter licences where the law requires them" became « permis de recrutement » and "licenças de recrutamento". Counsel may want the exact names (Ontario, and the Québec CNESST licence).
6. **10.6 governing version:** `[TODO]` in all three files. Under Bill 96, the French version is offered first. Which version governs is for counsel.

## Language notes

- **fr-CA:** Québec vocabulary (*courriel, infolettre, entrevue, rétroaction, renseignements, en tout temps, se joindre à, site Web, lois sur les droits de la personne*), *vous*, glossary terms (*recommandation, recruteur d’origine, recruteur du poste, transmise, priorité, période de propriété, pièces justificatives, jour ouvrable*). I avoided *registre* (reserved for the ledger) and *transmettre* in the sense of "pass on" (reserved for **deliver**). **Typography:** the file uses regular spaces before « : » and inside « ». Convert them to non-breaking spaces (U+00A0) when publishing or in the renderer. My tools couldn't write that character reliably.
- **pt-BR:** *você*, "o Workatent" with the article, glossary terms (*indicação, recrutador de origem, recrutador da vaga, entregue, prioridade, período de titularidade, comprovantes, repasse, dia útil*). I avoided *repassar* for "pass on" (reserved for **payout**), *titularidade* for company ownership (reserved for the **ownership window**; 1.3 says *quadro societário*), and *indicações* for "leads" (reserved for **referral**; 3.2 keeps "leads", which recruiters use). "Quebec" is written without the accent, as is usual in Brazil.
- **Terms a recruiter should check:** "engagement fees" (6.5) became « frais d’ouverture de mandat » and "taxas de abertura do processo". "Clean resume" (3.2) became « CV épuré » and currículo “limpo”.
