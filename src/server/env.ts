import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "demo", "production", "test"]).default("development"),
  // OpenAI powers job/resume extraction and semantic skill matching. Unset => rule-based only.
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_MODEL: z.string().min(2).optional(),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  // Until a domain is verified in Resend, onboarding@resend.dev can only deliver to the account owner.
  EMAIL_FROM: z.string().min(3).default("MissionHub <onboarding@resend.dev>"),
  // Stripe (wallet payments). Both must be set for payments to switch on.
  STRIPE_SECRET_KEY: z.string().min(10).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
    OPENAI_MODEL: process.env.OPENAI_MODEL || undefined,
    OPENAI_REASONING_EFFORT: process.env.OPENAI_REASONING_EFFORT || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
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
    return Boolean(env.OPENAI_API_KEY);
  },
  get email() {
    return Boolean(env.RESEND_API_KEY);
  },
  /** Wallet pay-ins and cash-outs. Off until both Stripe secrets are configured. */
  get payments() {
    return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
  },
};
