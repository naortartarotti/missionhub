import { NetworkRulesVersionsPage } from "@/features/network-rules/components/versions-page";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("network"))("versions.metaTitle") };
}

/** S4: Network Rules versions page (BR-4). Signed-in users only; no membership or acceptance needed. */
export default async function NetworkRulesPage({ searchParams }: PageProps<"/network-rules">) {
  return <NetworkRulesVersionsPage searchParams={await searchParams} />;
}
