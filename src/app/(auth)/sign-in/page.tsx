import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { SignInForm } from "@/features/auth/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your recruiter workspace."
      footer={
        <>
          New to MissionHub?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            Create an account
          </Link>
        </>
      }
    >
      {sp.error === "link_invalid" ? (
        <p role="alert" className="mb-4 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger">That link is invalid or has expired.</p>
      ) : null}
      <SignInForm next={next} />
    </AuthShell>
  );
}
