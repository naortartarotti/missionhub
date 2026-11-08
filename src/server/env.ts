import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "demo", "production", "test"]).default("development"),
  AI_PROVIDER: z.string().optional(),
  EMAIL_PROVIDER: z.string().optional(),
});

type Env = z.infer<typeof schema>;

// On Vercel, fall back to the deployment's own URL so links (invites, auth redirects)
// never point at localhost when NEXT_PUBLIC_APP_URL is not set.
function vercelUrl(): string | undefined {
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}

let cached: Env | undefined;

// Validated lazily on first access, not at module evaluation: `next build` loads route
// modules to collect page config, and must not crash because runtime secrets are absent
// from the build environment. A missing variable still fails loudly on first real use.
function load(): Env {
  cached ??= schema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || vercelUrl(),
    APP_ENV: process.env.APP_ENV || undefined,
    AI_PROVIDER: process.env.AI_PROVIDER || undefined,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || undefined,
  });
  return cached;
}

export const env: Readonly<Env> = new Proxy({} as Env, {
  get: (_, key) => load()[key as keyof Env],
  has: (_, key) => key in load(),
  ownKeys: () => Reflect.ownKeys(load()),
  getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(load(), key),
});

export const integrations = {
  get ai() {
    return Boolean(env.AI_PROVIDER);
  },
  get email() {
    return Boolean(env.EMAIL_PROVIDER);
  },
};
