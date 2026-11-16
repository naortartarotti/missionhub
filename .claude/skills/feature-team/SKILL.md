---
name: feature-team
description: Build or adjust a MissionHub feature with the team of agents, fast-first. Default is BUILD mode — the smallest set of agents (often none) implements the change with only lint + typecheck, then hands it to the user to validate in the app. Tests, QA, security probing, copy review and PM acceptance run only in HARDEN mode, after the user says the feature is validated. Use when the user asks to create, build, implement or adjust a feature, or asks for roadmap/prioritization with the team.
---

# Feature team — fast first, harden after validation

Two phases. **Never run HARDEN work during BUILD.**

```
BUILD (default)                                        HARDEN (only after the user validates)
pick track ─► implement ─► lint + typecheck ─► user ──► qa-engineer (tests + security) ─► fix loop
                                               validates   ─► copy review fr/pt ─► PM acceptance
```

## BUILD — pick the lightest track that fits

| Track | When | Who |
|---|---|---|
| **A. Ajuste** | bug, visual tweak, copy change, small rule, adjustment to something just built | **You (main session) directly.** No agents, no spec files. |
| **B. Feature** | new screen/action/table with clear rules | Short brief (you write it, or `product-manager` if scope is unclear) → `backend-engineer` → `frontend-engineer`. Or one engineer if it's only server or only UI. |
| **C. Feature com decisão de domínio** | open recruiting question (fees, ownership, guarantees, workflow) or a large multi-screen flow | `recruitment-strategist` (only the open questions) → `product-manager` → `product-designer` only if there are several new screens/flows → B. |

Default to the lighter track when in doubt; escalate only if you actually hit an open question.

### Track B/C steps
1. **Slug** — short kebab-case, passed to every agent. Files go in `docs/specs/<slug>/`.
2. **Brief** — `brief.md`, one page max: goal, business rules (BR-#), numbered ACs (one line each), out of scope,
   and anything `Needs user decision`. No metrics section, no team-plan essay. The ACs replace a separate spec unless
   a designer was needed.
3. **User checkpoint — only if** something is marked `Needs user decision`. Otherwise go straight to code.
4. **Implement** — `backend-engineer` then `frontend-engineer`. They may run in parallel when backend's action/query
   signatures are already in the brief and they don't touch the same files. Copy: frontend writes en and draft fr/pt
   following `docs/content/voice-and-tone.md` — no `ux-writer-marketing` pass in BUILD.
5. **Checks** — `npm run lint && npm run typecheck` only (plus `npm run db:reset && npm run db:types` if there was a
   migration). Fix failures; no new tests, no `npm test` unless the change touched code that existing unit tests cover
   and it's quick.
6. **Hand to the user** — say what was built and give a **"Como validar"** checklist: route(s), role to log in as,
   steps to click, expected result per AC. Say plainly that tests/QA have not run yet. Then stop.

### Track A (ajuste)
Edit directly, run lint + typecheck on the result, tell the user what changed and where to look. If it touches
something already HARDENed, also run the existing tests for that area (`npx vitest run <path>`), since those tests exist.

## HARDEN — only when the user says it's validated ("validado", "aprovado", "pode testar", "harden")
1. `qa-engineer` → tests for every AC/BR (unit + integration; e2e only for the main journey), security checklist,
   `qa-report.md`.
2. **Fix loop** — blockers/majors to their owner, re-run QA. Max 2 rounds, then report what's still failing.
3. **Copy** — `ux-writer-marketing` finalizes fr/pt for the strings added (skip if none).
4. **Acceptance** — `product-manager` only for roadmap items; updates roadmap and `acceptance.md`.
5. Report test commands and real results. Do not commit, push, or run `supabase db push` unless the user asks.

## Never relaxed, even in BUILD
These are coding rules, not tests — skipping them causes rework:
- Server Actions inside `guard()` with Zod on every argument; tenant from `getRequestContext`, never from the client.
- New tables with RLS + explicit policies; user-scoped Supabase client; no IDOR. New RPCs added to the allow-list in
  `tests/integration/api-surface.test.ts` (one line).
- Every string through i18n (en/fr/pt keys exist, or typecheck fails).
- No `apply_migration` via MCP on the hosted project; remote only via `supabase db push` when the user asks.
- Processes (PD-080): stop only PIDs you started, never `pkill`/pattern kills, never port 3000, announce `db:reset`.

## Rules for you as lead
- Give each agent the slug, the track (BUILD) and the minimal context; tell it explicitly **"BUILD mode: no tests,
  no docs beyond what's listed"**. Agents read only the files they need, not the whole docs folder.
- Prefer doing Track A yourself over launching an agent — an agent launch costs more than most small edits.
- Never present an agent's claims as verified; check command output yourself.
- Agents never override a user decision; pricing, legal (⚖️) and irreversible choices go to the user.

## Other entry points
- **Strategy / market question** → `recruitment-strategist`, then `product-manager` if the roadmap changes.
- **Roadmap / prioritization** → `product-manager`.
- **Marketing-only** → `ux-writer-marketing`; `frontend-engineer` only for structural page changes.
