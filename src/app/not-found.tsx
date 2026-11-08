import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT("errors");
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">{t("notFound.code")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("notFound.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("notFound.body")}</p>
        <Button className="mt-6" asChild><Link href="/">{t("notFound.home")}</Link></Button>
      </div>
    </main>
  );
}
