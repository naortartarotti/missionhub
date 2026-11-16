---
name: feature-team
description: Build a MissionHub feature end to end with the team of agents — recruitment-strategist → product-manager (central hub) → product-designer → ux-writer-marketing → backend-engineer → frontend-engineer → qa-engineer → product-manager acceptance — with handoffs through docs/specs/<slug>/ and a fix loop until QA passes. Use when the user asks to create, build or implement a feature with the team, or asks for roadmap/prioritization with the team.
---

# Feature team

```
recruitment-strategist ──► product-manager ──► product-designer ─► ux-writer-marketing
                               ▲    │          ─► backend-engineer ─► frontend-engineer ─► qa-engineer
                               └────┴──────────────── acceptance ◄──────────────────────────┘
```

The **product-manager** is the central piece: it receives domain decisions from the **recruitment-strategist** and
writes the brief and team plan that direct everyone else. Agents can't call each other, so **you (the main session)
run the plan the PM writes**. They communicate through files:

| File | Written by | Read by |
|---|---|---|
| `docs/strategy/decisions.md` (RD-###), `docs/strategy/*.md` | recruitment-strategist | product-manager, everyone |
| `docs/product/roadmap.md`, `docs/product/decisions.md` (PD-###) | product-manager | everyone |
| `recruiting-input.md` | recruitment-strategist | product-manager, product-designer |
| `brief.md` (scope, BR-#, metrics, **team plan**) | product-manager | everyone |
| `spec.md` | product-designer (§5 Copy finalized by ux-writer-marketing) | everyone (ACs are the contract) |
| `docs/content/voice-and-tone.md` | ux-writer-marketing | everyone writing user-facing text |
| `backend.md` | backend-engineer | frontend-engineer, qa-engineer |
| `frontend.md` | frontend-engineer | qa-engineer, product-designer |
| `qa-report.md` | qa-engineer | product-manager, backend, frontend |
| `design-review.md`, `copy-review.md` | product-designer, ux-writer-marketing (review mode) | frontend-engineer, product-manager |
| `acceptance.md` | product-manager | you, the user |

All per-feature files live in `docs/specs/<feature-slug>/`.

## Steps
1. **Slug** — pick a short kebab-case slug from the request. Pass it to every agent.
2. **Strategy** — run `recruitment-strategist` with the user's request verbatim and the slug. It writes
   `recruiting-input.md` and records RD-### decisions. Skip only for purely technical work (refactor, bug with no
   domain question) — the PM can ask for it later.
3. **Brief** — run `product-manager` with the request and slug. It writes `brief.md` with the team plan.
   If the PM lists questions for the strategist, run the strategist on them, then the PM again (max 2 rounds).
4. **User checkpoint** — show the user the brief summary, the plan, and **everything marked `Needs user decision`**
   (from either agent). Don't continue past those without the user's answer; record answers in the decision logs.
5. **Execute the PM's team plan**, in its order. The default is:
   - `product-designer` → `spec.md` (show the user any new open questions)
   - `ux-writer-marketing` → finalizes spec §5 (skip if no user-facing text)
   - `backend-engineer` → code + `backend.md` (skip if no data/server change)
   - `frontend-engineer` → code + `frontend.md`, after backend
   - `qa-engineer` → `qa-report.md`
   Steps the PM marks parallel may run together only if they don't edit the same files.
6. **Fix loop** — if QA verdict is FAIL, send each blocker/major bug to its owner (continue that agent with
   SendMessage if still addressable, otherwise start it again with the slug and the bug list), then run QA again.
   Stop after 3 rounds and report what is still failing.
7. **Reviews** (UI features) — `product-designer` and `ux-writer-marketing` in review mode, in parallel; send blocking
   findings to frontend.
8. **Acceptance** — run `product-manager` to accept or reject against the brief (`acceptance.md`, roadmap updated).
   If changes are needed, loop back to the owners it names.
9. **Report** — tell the user what was built, AC and metric coverage, test commands and real results, and anything not
   verified. Do not commit, push, or run `supabase db push` unless the user asks.

## Other entry points
- **Strategy / market question** ("should we support retained search?", "how do we enter Brazil?") →
  `recruitment-strategist`, then `product-manager` to translate the decision into roadmap changes.
- **Roadmap / prioritization** → `product-manager` (it pulls in the strategist's decisions).
- **Marketing-only** (landing, SEO, launch email) → `ux-writer-marketing` (with positioning from
  `docs/strategy/`); `frontend-engineer` only for structural page changes, then `qa-engineer` for a quick regression.
- **Small bug** → straight to the owner agent, then `qa-engineer`; tell the PM only if it changes scope or roadmap.

## Rules for you as lead
- Give each agent the slug and the minimal context it needs; the files carry the rest.
- Never present an agent's claims to the user as verified — check qa-report and command output yourself.
- Agents never override a user decision; the PM and strategist escalate pricing, legal (⚖️) and irreversible choices.
- Agents run sequentially when they touch the same files; backend and frontend never edit the same file at once.
- Processes (PD-080): agents stop only the PIDs they started — never `pkill`/pattern kills — never use port 3000
  (the user's `npm run dev`), announce any `db:reset` on the shared local DB, and list started/stopped processes in their report.
