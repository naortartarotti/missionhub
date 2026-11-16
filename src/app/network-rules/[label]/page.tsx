import { NetworkRulesVersionsPage } from "@/features/network-rules/components/versions-page";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/network-rules/[label]">) {
  const { label } = await params;
  return { title: `${(await getT("network"))("versions.metaTitle")} ${label}` };
}

/** S4: one published version (upcoming or past). Unknown label or a draft → not found. */
export default async function NetworkRulesVersionPage({ params, searchParams }: PageProps<"/network-rules/[label]">) {
  const { label } = await params;
  return <NetworkRulesVersionsPage searchParams={await searchParams} label={decodeURIComponent(label)} />;
}
