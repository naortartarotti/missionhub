# Network Rules: N3 changes to rules 6.3, 6.4 and 7.2 (draft)

- **Owner:** UX Writer & Marketing · **Date:** 2026-11-16 · **Status:** draft for founder and counsel review (P0-1). Nothing here is public.
- **Feature:** N3 `referral-claims-two-sided-hire`. Brief rev. 1 approved 2026-11-16 (PD-071). Sources: [`brief.md`](../specs/referral-claims-two-sided-hire/brief.md) §5 and §9 step 3c, [`recruiting-input.md`](../specs/referral-claims-two-sided-hire/recruiting-input.md) §3 and §4, RD-050 to RD-056 (`docs/strategy/decisions.md`).
- **Where the rules live:** `docs/content/network-rules/{en,fr-CA,pt-BR}.md` (Markdown, not i18n JSON). These drafts are **not merged** into those files yet. Merge them after the founder reviews (see "How to merge" at the end).
- **Markers:** same as the rules files. `<!-- ⚖️ counsel: … -->` = needs counsel. `<!-- ships with N7 -->…<!-- /ships with N7 -->` = text for a mechanism that doesn't exist yet (deemed confirmation needs N7 email delivery and bounce records, PD-066). Comments are in English in all three languages, so counsel can grep one set of markers.
- **Platform share:** unchanged. These rules say nothing about MissionHub's share. It stays the normal rate on the fee collected (PD-071, RD-056), so there's no surcharge wording anywhere.

## What changes, in one line each

| Rule | Today | N3 draft |
|---|---|---|
| 6.3 | "any role within the ownership window"; exits: release, objection upheld or not contested | Coverage test (in progress at the offer · offer accepted inside the window · selection process started inside the window and offer accepted within 3 months after it), what counts as a hire (RD-055), a hire through a related organization of the hiring recruiter counts as its hire (PD-076), the defences that don't work, the four exits (adds Already presented and an invalid confirmation), and the filing limit (window + 6 months, + 9 with the tail) as a MissionHub-only limit |
| 6.4 | Record every hire, invoices and payments; no deadline | Record on the referral with first position within 5 business days of learning of the offer acceptance, never later than 5 business days after the start date; client invoice within 10 business days after the start date; not invoicing or waiving without prior written agreement = invoicing less (6.5); the sourcing recruiter reports with dated evidence |
| 7.2 | Objection 5 days; contest or answer 10 days; "we decide on the record" | Same, as a list, plus: confirm or contest a hire report; one rebuttal in 5 business days; admin target 10 business days; fee details within 10 business days; right-to-represent evidence in 5 business days; deemed confirmation **ships with N7** |

Placement of the fee-details deadline: the brief (§9, 3c) lists it under 6.4. It's in **7.2** here, as the request asked, because it runs from a 7.2 outcome (confirmed, upheld or deemed). 6.4 still gives the hiring recruiter's duties. PD-076 confirmed this placement.

---

## en (en-CA)

**Current 6.3:** The first referral delivered has first position. If the client hires a referred candidate in any role within the ownership window, the split is owed, even if the referral was declined, withdrawn, cancelled or left unanswered. It isn’t owed if the sourcing recruiter released the candidate, or if a prior-presentation objection was upheld or not contested.

**Draft 6.3:**

```md
**6.3** The first referral delivered has first position. If the client hires a referred candidate, in any role, the split is owed when any of these is true:

- the referral was still in progress when the offer was made;
- the candidate accepted the offer within the ownership window (if the acceptance date isn’t known, the start date counts);
- the client’s selection process that led to the hire (a first interview or assessment, for any role) started within the window, and the candidate accepted the offer within 3 months after the window ended. <!-- ⚖️ counsel: coverage test and 3-month re-engagement tail (RD-052) -->

This applies even if the referral was declined, not selected, withdrawn, cancelled or left unanswered. <!-- ⚖️ counsel: Q-1, split owed when the hiring recruiter never accepted the referral; see the alternative below --> A hire includes employment or a contract for services, by the client, its affiliates, or an employer of record (EOR), payroll provider or agency acting for it. <!-- ⚖️ counsel: Q-3, what counts as a hire (RD-055) --> If an organization related to the hiring recruiter’s (one that shares a member with it) places the candidate with the client, it counts as the hiring recruiter’s hire. <!-- ⚖️ counsel: related-organization hire (BR-12, RD-021, PD-076) --> “We found them ourselves”, “they applied directly”, “they came through another agency” and “it was a different role” don’t change this. The only exceptions: the sourcing recruiter released the candidate; a prior-presentation objection was upheld or not contested; the referral was closed as Already presented; or a platform admin found the candidate’s authorization or confirmation invalid. <!-- ⚖️ counsel: voiding after an authorization check (RD-029) -->

The sourcing recruiter can report a hire on MissionHub until 6 months after the window ends, or 9 months if the selection process started within the window. This is a MissionHub filing limit only. It doesn’t limit anyone’s legal rights. <!-- ⚖️ counsel: Q-2, filing limit next to provincial limitation periods (ON 2 years, QC 3 years) -->
```

**Current 6.4:** As the hiring recruiter, record on MissionHub every hire of a referred candidate by the client within the window, and the invoices and payments. As the sourcing recruiter, if you learn your candidate was hired within the window, report it on MissionHub.

**Draft 6.4:**

```md
**6.4** As the hiring recruiter, record on MissionHub every hire covered by rule 6.3, on the referral that has first position. Do it within 5 business days of learning that the candidate accepted an offer, and never later than 5 business days after the start date. Record the client invoice within 10 business days after the start date, then the payments. Not invoicing the client, or waiving the fee, without the sourcing recruiter’s written agreement first counts as invoicing less (rule 6.5). As the sourcing recruiter, if you learn your candidate was hired, report it on MissionHub with at least one dated piece of evidence. <!-- ⚖️ counsel: record duty and deadlines, waiver treated as invoicing less (RD-051, RD-025) -->
```

**Current 7.2:** Deadlines matter. File a prior-presentation objection within 5 business days of delivery, with dated evidence. You have 10 business days to contest an objection or to answer a hire report. If you don’t respond in time, we decide on the record. You may involve a lawyer, but that doesn’t stop the clock.

**Draft 7.2:**

```md
**7.2** Deadlines matter:

- **Prior-presentation objection:** file it within 5 business days of delivery, with dated evidence. The sourcing recruiter has 10 business days to contest it.
- **Hire report:** the hiring recruiter has 10 business days to confirm the hire, or to contest it with a reason and evidence. After a contest, the sourcing recruiter may add one rebuttal within 5 business days. We aim to decide within 10 business days after that.
- **Fee details:** when a hire report is confirmed or upheld<!-- ships with N7 -->, or the hire is deemed confirmed<!-- /ships with N7 -->, the hiring recruiter enters the fee details within 10 business days.
- **Right to represent:** if a platform admin questions a candidate’s authorization or confirmation, the sourcing recruiter has 5 business days to give independent evidence that it represents the candidate. Without it, the referral is void and stops counting.

If you don’t respond in time, we decide on the record.<!-- ships with N7 --> One exception: if the hiring recruiter doesn’t answer a hire report in time, and our email notice reached two people in its organization without bouncing (the member responsible for the job and an organization admin or recruiter manager), the hire is deemed confirmed. We reopen it only if our own records show the notice didn’t reach them.<!-- /ships with N7 --> You may involve a lawyer, but that doesn’t stop the clock. <!-- ⚖️ counsel: 7.2 deadlines, deemed confirmation on silence, voiding wording (RD-053, RD-029) -->
```

---

## fr-CA (offered first in Québec)

**Actuelle 6.3 :** La première recommandation transmise a la priorité. Si le client embauche un candidat recommandé, à n’importe quel poste, pendant la période de propriété, le partage est dû, même si la recommandation a été refusée, retirée, annulée ou laissée sans réponse. Il n’est pas dû si le recruteur d’origine a libéré le candidat, ou si une objection pour présentation antérieure a été retenue ou n’a pas été contestée.

**Ébauche 6.3 :**

```md
**6.3** La première recommandation transmise a la priorité. Si le client embauche un candidat recommandé, à n’importe quel poste, le partage est dû dans l’un ou l’autre de ces cas :

- la recommandation était encore en cours au moment de l’offre;
- le candidat a accepté l’offre pendant la période de propriété (si la date d’acceptation n’est pas connue, la date d’entrée en fonction compte);
- le processus de sélection du client qui a mené à l’embauche (une première entrevue ou une évaluation, pour n’importe quel poste) a commencé pendant la période de propriété, et le candidat a accepté l’offre dans les 3 mois suivant la fin de cette période. <!-- ⚖️ counsel: coverage test and 3-month re-engagement tail (RD-052) -->

C’est le cas même si la recommandation a été refusée, non retenue, retirée, annulée ou laissée sans réponse. <!-- ⚖️ counsel: Q-1, split owed when the hiring recruiter never accepted the referral; see the alternative below --> Une embauche comprend un emploi ou un contrat de services, par le client, ses sociétés affiliées, ou un employeur officiel (EOR), un fournisseur de services de paie ou une agence qui agit pour lui. <!-- ⚖️ counsel: Q-3, what counts as a hire (RD-055) --> Si une organisation liée à celle du recruteur du poste (qui a un membre en commun avec elle) place le candidat chez le client, cela compte comme une embauche du recruteur du poste. <!-- ⚖️ counsel: related-organization hire (BR-12, RD-021, PD-076) --> « Nous l’avons trouvé nous-mêmes », « il a postulé directement », « il est passé par une autre agence » et « c’était un autre poste » n’y changent rien. Seules exceptions : le recruteur d’origine a libéré le candidat; une objection pour présentation antérieure a été retenue ou n’a pas été contestée; la recommandation a été fermée avec le statut Déjà présenté; ou un administrateur de la plateforme a jugé invalide l’autorisation ou la confirmation du candidat. <!-- ⚖️ counsel: voiding after an authorization check (RD-029) -->

Le recruteur d’origine peut déclarer une embauche sur MissionHub jusqu’à 6 mois après la fin de la période de propriété, ou 9 mois si le processus de sélection a commencé pendant cette période. Ce délai est une limite propre à MissionHub. Il ne restreint aucun des droits que la loi reconnaît à quiconque. <!-- ⚖️ counsel: Q-2, filing limit next to provincial limitation periods (ON 2 years, QC 3 years) -->
```

**Actuelle 6.4 :** Comme recruteur du poste, enregistrez sur MissionHub chaque embauche, par le client, d’un candidat recommandé pendant la période, ainsi que les factures et les paiements. Comme recruteur d’origine, si vous apprenez que votre candidat a été embauché pendant la période, déclarez-le sur MissionHub.

**Ébauche 6.4 :**

```md
**6.4** Comme recruteur du poste, enregistrez sur MissionHub chaque embauche visée par la règle 6.3, sur la recommandation qui a la priorité. Faites-le dans les 5 jours ouvrables suivant le moment où vous apprenez que le candidat a accepté une offre, et au plus tard 5 jours ouvrables après sa date d’entrée en fonction. Enregistrez la facture au client dans les 10 jours ouvrables suivant la date d’entrée en fonction, puis les paiements. Ne pas facturer le client, ou renoncer aux honoraires, sans l’accord écrit préalable du recruteur d’origine équivaut à facturer moins (règle 6.5). Comme recruteur d’origine, si vous apprenez que votre candidat a été embauché, déclarez l’embauche sur MissionHub avec au moins une pièce justificative datée. <!-- ⚖️ counsel: record duty and deadlines, waiver treated as invoicing less (RD-051, RD-025) -->
```

**Actuelle 7.2 :** Les délais comptent. Déposez une objection pour présentation antérieure dans les 5 jours ouvrables suivant la transmission, avec des pièces justificatives datées. Vous avez 10 jours ouvrables pour contester une objection ou pour répondre à une déclaration d’embauche. Si vous ne répondez pas à temps, nous décidons selon le dossier. Vous pouvez faire appel à un avocat, mais cela n’arrête pas les délais.

**Ébauche 7.2 :**

```md
**7.2** Les délais comptent :

- **Objection pour présentation antérieure :** déposez-la dans les 5 jours ouvrables suivant la transmission, avec des pièces justificatives datées. Le recruteur d’origine a 10 jours ouvrables pour la contester.
- **Déclaration d’embauche :** le recruteur du poste a 10 jours ouvrables pour confirmer l’embauche, ou pour la contester avec un motif et des pièces justificatives. Après une contestation, le recruteur d’origine peut ajouter une seule réplique dans les 5 jours ouvrables. Nous visons à rendre une décision dans les 10 jours ouvrables qui suivent.
- **Détails des honoraires :** quand une déclaration d’embauche est confirmée ou retenue<!-- ships with N7 -->, ou que l’embauche est réputée confirmée<!-- /ships with N7 -->, le recruteur du poste entre les détails des honoraires dans les 10 jours ouvrables.
- **Droit de représenter :** si un administrateur de la plateforme met en doute l’autorisation ou la confirmation d’un candidat, le recruteur d’origine a 5 jours ouvrables pour fournir une pièce justificative indépendante montrant qu’il représente ce candidat. Sans elle, la recommandation est invalidée et ne compte plus.

Si vous ne répondez pas à temps, nous décidons selon le dossier.<!-- ships with N7 --> Une exception : si le recruteur du poste ne répond pas à temps à une déclaration d’embauche, et que notre avis par courriel est parvenu sans retour à deux personnes de son organisation (le membre responsable de ce poste et un administrateur de l’organisation ou un gestionnaire de recrutement), l’embauche est réputée confirmée. Nous ne la rouvrons que si nos propres données montrent que l’avis ne leur est pas parvenu.<!-- /ships with N7 --> Vous pouvez faire appel à un avocat, mais cela n’arrête pas les délais. <!-- ⚖️ counsel: 7.2 deadlines, deemed confirmation on silence, voiding wording (RD-053, RD-029) -->
```

---

## pt-BR

**Atual 6.3:** A primeira indicação entregue tem a prioridade. Se o cliente contratar um candidato indicado, para qualquer vaga, dentro do período de titularidade, a divisão é devida, mesmo que a indicação tenha sido recusada, retirada, cancelada ou ficado sem resposta. Ela não é devida se o recrutador de origem liberou o candidato, ou se uma objeção por apresentação anterior foi mantida ou não foi contestada.

**Rascunho 6.3:**

```md
**6.3** A primeira indicação entregue tem a prioridade. Se o cliente contratar um candidato indicado, para qualquer vaga, a divisão é devida em qualquer um destes casos:

- a indicação ainda estava em andamento quando a oferta foi feita;
- o candidato aceitou a oferta dentro do período de titularidade (se a data do aceite não for conhecida, vale a data de início);
- o processo seletivo do cliente que levou à contratação (uma primeira entrevista ou avaliação, para qualquer vaga) começou dentro do período de titularidade, e o candidato aceitou a oferta em até 3 meses depois do fim desse período. <!-- ⚖️ counsel: coverage test and 3-month re-engagement tail (RD-052) -->

Isso vale mesmo que a indicação tenha sido recusada, não selecionada, retirada, cancelada ou ficado sem resposta. <!-- ⚖️ counsel: Q-1, split owed when the hiring recruiter never accepted the referral; see the alternative below --> Contratação inclui emprego ou contrato de prestação de serviços (inclusive como PJ), pelo cliente, por empresas do mesmo grupo, ou por um empregador de registro (EOR), uma empresa de folha de pagamento ou uma agência que atue em nome dele. <!-- ⚖️ counsel: Q-3, what counts as a hire (RD-055); "PJ" added for Brazil --> Se uma organização relacionada à do recrutador da vaga (que tenha um membro em comum com ela) colocar o candidato no cliente, isso conta como contratação do recrutador da vaga. <!-- ⚖️ counsel: related-organization hire (BR-12, RD-021, PD-076) --> “Nós o encontramos por conta própria”, “ele se candidatou diretamente”, “ele veio por outra agência” e “era outra vaga” não mudam isso. As únicas exceções: o recrutador de origem liberou o candidato; uma objeção por apresentação anterior foi mantida ou não foi contestada; a indicação foi encerrada com o status Já apresentada; ou um admin da plataforma considerou inválida a autorização ou a confirmação do candidato. <!-- ⚖️ counsel: voiding after an authorization check (RD-029) -->

O recrutador de origem pode relatar uma contratação no MissionHub até 6 meses depois do fim do período de titularidade, ou 9 meses se o processo seletivo começou dentro dele. Esse é um prazo apenas do MissionHub. Ele não limita nenhum direito previsto em lei. <!-- ⚖️ counsel: Q-2, filing limit next to provincial limitation periods (ON 2 years, QC 3 years) -->
```

**Atual 6.4:** Como recrutador da vaga, registre no MissionHub toda contratação de um candidato indicado feita pelo cliente dentro do período, além das faturas e dos pagamentos. Como recrutador de origem, se souber que seu candidato foi contratado dentro do período, informe no MissionHub.

**Rascunho 6.4:**

```md
**6.4** Como recrutador da vaga, registre no MissionHub toda contratação coberta pela regra 6.3, na indicação que tem a prioridade. Faça isso em até 5 dias úteis depois de saber que o candidato aceitou uma oferta, e nunca depois de 5 dias úteis após a data de início. Registre a fatura ao cliente em até 10 dias úteis após a data de início e, depois, os pagamentos. Não faturar o cliente, ou abrir mão da taxa, sem a concordância prévia por escrito do recrutador de origem equivale a faturar menos (regra 6.5). Como recrutador de origem, se souber que seu candidato foi contratado, relate a contratação no MissionHub com pelo menos um comprovante datado. <!-- ⚖️ counsel: record duty and deadlines, waiver treated as invoicing less (RD-051, RD-025) -->
```

**Atual 7.2:** Prazos importam. Registre uma objeção por apresentação anterior em até 5 dias úteis após a entrega, com comprovantes datados. Você tem 10 dias úteis para contestar uma objeção ou responder a um registro da contratação. Se não responder no prazo, decidimos com base no histórico. Você pode envolver um advogado, mas isso não suspende os prazos.

**Rascunho 7.2:**

```md
**7.2** Prazos importam:

- **Objeção por apresentação anterior:** registre em até 5 dias úteis após a entrega, com comprovantes datados. O recrutador de origem tem 10 dias úteis para contestá-la.
- **Relato de contratação:** o recrutador da vaga tem 10 dias úteis para confirmar a contratação, ou para contestá-la com um motivo e comprovantes. Depois de uma contestação, o recrutador de origem pode apresentar uma única réplica em até 5 dias úteis. Nosso objetivo é decidir em até 10 dias úteis depois disso.
- **Detalhes da taxa:** quando um relato de contratação é confirmado ou mantido<!-- ships with N7 -->, ou a contratação é considerada confirmada<!-- /ships with N7 -->, o recrutador da vaga informa os detalhes da taxa em até 10 dias úteis.
- **Direito de representar:** se um admin da plataforma questionar a autorização ou a confirmação de um candidato, o recrutador de origem tem 5 dias úteis para apresentar um comprovante independente de que representa o candidato. Sem ele, a indicação é invalidada e deixa de contar.

Se você não responder no prazo, decidimos com base no histórico.<!-- ships with N7 --> Uma exceção: se o recrutador da vaga não responder a um relato de contratação no prazo, e nosso aviso por e-mail tiver chegado, sem devolução, a duas pessoas da organização dele (o membro responsável pela vaga e um administrador da organização ou gerente de recrutamento), a contratação é considerada confirmada. Só reabrimos esse caso se nossos próprios dados mostrarem que o aviso não chegou.<!-- /ships with N7 --> Você pode envolver um advogado, mas isso não suspende os prazos. <!-- ⚖️ counsel: 7.2 deadlines, deemed confirmation on silence, voiding wording (RD-053, RD-029) -->
```

---

## Alternative 6.3 sentence if counsel answers Q-1 "no"

Use this instead of the "This applies even if…" sentence. The deemed-agreement flag then stays off, and a hire on a referral that was never accepted is recorded without a split (brief BR-9, R-5).

- **en:** This applies even if the referral was declined, not selected, withdrawn or cancelled after the hiring recruiter accepted it. If the hiring recruiter never accepted the referral, MissionHub records the hire but doesn’t create a split; the two organizations settle it under rule 7.5.
- **fr-CA :** C’est le cas même si la recommandation a été refusée, non retenue, retirée ou annulée après son acceptation par le recruteur du poste. Si le recruteur du poste n’a jamais accepté la recommandation, MissionHub enregistre l’embauche, mais ne crée pas de partage; les deux organisations règlent la question selon la règle 7.5.
- **pt-BR:** Isso vale mesmo que a indicação tenha sido recusada, não selecionada, retirada ou cancelada depois de aceita pelo recrutador da vaga. Se o recrutador da vaga nunca aceitou a indicação, o MissionHub registra a contratação, mas não cria a divisão; as duas organizações resolvem a questão pela regra 7.5.

Until counsel answers, the main draft stays: it states the rule, and no sentence says MissionHub creates the placement, so it's still true while the flag is off.

---

## Linked term changes in other rules (merge with the above)

The glossary now separates the hiring recruiter's **record a hire** from the sourcing recruiter's **hire report** (see `voice-and-tone.md` §5.8). In pt-BR, "registro da contratação" read as the hiring side's record, so the hire report becomes **relato de contratação**. Wording only, same meaning:

| Rule | Locale | Current | Proposed |
|---|---|---|---|
| 4.8 | pt-BR | … objeções, comprovantes, registros de contratação, declarações … | … objeções, comprovantes, contratações registradas, relatos de contratação, contestações, declarações … |
| 4.8 | en | … objections, evidence, hire reports, attestations … | … objections, evidence, recorded hires, hire reports, contests, attestations … |
| 4.8 | fr-CA | … objections, pièces justificatives, déclarations d’embauche, attestations … | … objections, pièces justificatives, embauches enregistrées, déclarations d’embauche, contestations, attestations … |
| 7.1 | pt-BR | … uma objeção, um registro da contratação, uma disputa … | … uma objeção, um relato de contratação, uma disputa … |

The 4.8 additions in all three languages make false hire records and false contests explicit breaches (HA-5). ⚖️ Counsel should confirm with 4.8.

---

## Reading the drafts against the product

| Sentence | True when | Note |
|---|---|---|
| 6.3 filing limit, 6.4 reporting with evidence, 7.2 hire-report contest, rebuttal and fee details | N3 drop 2 ships | If the rules are published before N3 ships, wrap these in `ships with N3` markers. |
| 7.2 "We aim to decide within 10 business days after that" | Dispute owners are staffed (brief R-4) | A staffing commitment, like 8.4. |
| 7.2 deemed confirmation | N7 records email delivery and bounces for each recipient (PD-066, PD-070) | Wrapped `ships with N7`. Before N7, every unanswered report goes to the admin queue, and "we decide on the record" is true. |
| 7.2 "Without it, the referral is void" | BR-37 ships | Pre-N10, the breach review is manual. |
| 6.3 "in any role" | always, for jobs with a client name (BR-1 gate) | No "at that client" sentence (PD-076). Launch check instead: delivered external referrals on jobs without a client key must be 0 or test data on the hosted DB. |
| 6.3 related-organization hire | always (BR-12) | Recorded today as an admin note on the hire record (PD-069 cut 4, PD-074 Q-PM-8). The rule doesn't say how MissionHub records it, so it stays true. |
| 6.4 "never later than 5 business days after the start date" | always | The server doesn't block a late record. It marks it for admins (BR-13). The rule states the duty; it doesn't say MissionHub refuses. |

Decided in PD-076: the related-organization sentence is in 6.3, and there's no "at that client" sentence. The fee-details deadline stays in 7.2.

---

## How to merge (after the founder's review)

1. Replace 6.3, 6.4 and 7.2 in `docs/content/network-rules/en.md`, `fr-CA.md` and `pt-BR.md` with the drafts, plus the linked 4.8 and 7.1 edits.
2. In each file's header comment: add **6.3, 6.4, 7.2** to the `LEGAL.` list, and add a line under `SHIPS LATER`: "7.2 deemed confirmation: ships with N7 (one sentence in the fee-details bullet, one in the closing paragraph)."
3. In `PUBLISHING.md` §2 item 6, add a row: `N7` | deemed confirmation on silence (7.2) | yes / no.
4. In `README.md`, add the changes to the trims table and update the word counts: 6.3 and 7.2 roughly double. Estimate: en +190 words, so about 9.5 minutes of reading in total.
5. fr-CA typography: the drafts use regular spaces before « : » and inside « ». The publish script converts them (PUBLISHING §3 step 6).
