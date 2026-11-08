# ADR 0004 — Deterministic matching first
**Decision:** Rule-based two-stage engine (eligibility filters → weighted factors) with evidence strings, `deterministic-v1`. Inputs are a typed projection that cannot carry identity or protected attributes.
**Why:** Works without AI keys, explainable, testable, cheap. Embeddings (pgvector) can be added as an additional factor without changing the projection boundary.
