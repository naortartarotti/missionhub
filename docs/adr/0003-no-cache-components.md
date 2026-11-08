# ADR 0003 — Cache Components disabled
**Decision:** `cacheComponents` off; all workspace pages render dynamically per request.
**Why:** Every page depends on the authenticated tenant; avoiding shared server caches removes a class of cross-tenant leaks. Revisit with `use cache: private` if performance requires.
