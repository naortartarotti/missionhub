import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { SignUpForm } from "@/features/auth/components/auth-forms";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthShell
      title="Create your account"
      subtitle="For recruiters, headhunters and agencies. Your candidates stay private to your organization."
      footer={
        <>
          Already have an account?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  );
}
