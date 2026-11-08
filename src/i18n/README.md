# i18n

Locales: `en` (source of truth), `fr`, `pt` (pt-BR). No locale in the URL: the language comes from the
`mh-locale` cookie (set by the language picker), then the browser's Accept-Language, then English.

## Files
- `config.ts` – locales, cookie name, Intl tags (`en-CA`, `fr-CA`, `pt-BR`).
- `messages/<locale>/<namespace>.json` – translations. One JSON per area. `messages/<locale>/index.ts` lists them.
  `fr`/`pt` are typed against `en`: a missing key is a **type error**.
- `server.ts` – `getT(ns)`, `getGlobalT()`, `getFormatter()`, `getLocale()` for Server Components, route
  metadata and server actions.
- `client.tsx` – `useT(ns)`, `useGlobalT()`, `useFormatter()`, `useLocale()` for Client Components.
- `translate.ts` – translator, `msg()` for server-side messages.
- `format.ts` – locale-aware date / relative time / number / money formatting.

## Usage
```tsx
// Server Component
const t = await getT("jobs");
<h1>{t("title")}</h1>
<p>{t("count", { count: n })}</p>            // plural: { "one": "{count} job", "other": "{count} jobs" }

// Enum labels (status, seniority…) live in the `labels` namespace
const tg = await getGlobalT();
tg(`labels.jobStatus.${job.status}`)

// Dates / money
const f = await getFormatter();
f.date(iso); f.relative(iso); f.money(minor, "CAD", { whole: true })

// Client Component
const t = useT("jobs"); const f = useFormatter();

// Page title
export async function generateMetadata() { return { title: (await getT("jobs"))("title") }; }

// Server action / zod messages: return a marker, guard() translates it for the user
return { ok: false, error: msg("errors.forbidden") };
z.string().min(1, msg("jobs.validation.titleRequired"))
```

## Rules
- Interpolate with `{name}`; never concatenate translated fragments into sentences.
- Put links inside sentences as separate keys (`before` / `link` / `after`).
- Stored data (candidate names, job titles, notification text written by the DB) is not translated.
