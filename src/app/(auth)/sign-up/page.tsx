import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("auth"))("signUp.metaTitle") };
}

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("signUp.title")}
      subtitle={t("signUp.subtitle")}
      footer={
        <>
          {t("signUp.haveAccount")}{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            {t("signUp.signIn")}
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  );
}
