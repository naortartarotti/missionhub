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

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  APP_ENV: process.env.APP_ENV,
  AI_PROVIDER: process.env.AI_PROVIDER || undefined,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || undefined,
});

export const integrations = {
  ai: Boolean(env.AI_PROVIDER),
  email: Boolean(env.EMAIL_PROVIDER),
};
