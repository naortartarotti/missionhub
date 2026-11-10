# AI (OpenAI)

Everything works without AI. Set `OPENAI_API_KEY` (server-only) and these features switch on:

| Feature | Where | What goes to OpenAI |
|---|---|---|
| Job import (paste / link / file) | `features/jobs/import/ai.ts`, `importJobPosting` | Posting text, or the PDF itself when it has no text layer (scanned) |
| Requirement suggestions | `suggestFromDescription` | The job description |
| Resume → candidate form | `features/candidates/resume-ai.ts`, `importResume` | Resume text, or the PDF when scanned |
| Scanned resume transcription | `server/integrations/resume-parser.ts` (worker, `document.scan`) | Scanned PDF only — text-layer PDFs and DOCX are read locally |
| Semantic skill matching | `features/matching/infrastructure/skill-relations.ts` | **Skill names only** — never candidate, job or org data |

## Rules

- **Untrusted input.** Documents go fenced in the user message; the system prompt tells the model to treat them as data. Output is constrained by a strict JSON schema and re-validated with Zod.
- **Never invent.** Prompts ask only for what the document states; unknowns are `null`. The recruiter reviews every pre-filled form before saving — nothing is saved by AI.
- **Graceful fallback.** Any AI failure (timeout, HTTP error, refusal, bad output) silently falls back to the rule-based extractor / deterministic engine.
- **No retention, no payload logs.** Requests use `store: false`. Logs contain task id, outcome and duration only.
- **Matching stays deterministic and explainable.** AI only supplies a cached taxonomy (`skill_relations`): "react is implied by next.js". A requirement met through a related skill earns 75% credit and is shown as "Related experience: react ← next.js". Rows scored this way carry `model_version = deterministic-v2+ai-skills`. Each skill is expanded once (≤ 3 × 40 skills per worker run), so cost is bounded by vocabulary size.
- **Protected characteristics.** The resume prompt forbids age, gender, nationality, religion, marital status, health or photo in the summary; the match engine never sees identity fields regardless.

## Config

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini          # optional; any Chat Completions model with Structured Outputs + PDF input
OPENAI_REASONING_EFFORT=low      # optional; reasoning models only (minimal | low | medium | high)
```

On Vercel: `vercel env add OPENAI_API_KEY` (Production + Preview). The worker needs the same variables.

Resumes are personal data: sending them to OpenAI is a cross-border transfer (see the legal notes in `security-and-privacy.md`). Cover it in the privacy notice / DPA before launch.
