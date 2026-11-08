import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { SignInForm } from "@/features/auth/components/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("auth"))("signIn.metaTitle") };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("signIn.title")}
      subtitle={t("signIn.subtitle")}
      footer={
        <>
          {t("signIn.newHere")}{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            {t("signIn.createAccount")}
          </Link>
        </>
      }
    >
      {sp.error === "link_invalid" ? (
        <p role="alert" className="mb-4 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger">{t("signIn.linkInvalid")}</p>
      ) : null}
      <SignInForm next={next} />
    </AuthShell>
  );
}
