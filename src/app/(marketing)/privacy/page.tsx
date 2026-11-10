import { PrivacyPage } from "@/features/landing/components/privacy-page";
import { marketingMetadata } from "@/features/landing/metadata";

export const generateMetadata = () => marketingMetadata("privacy", "/privacy");

export default function Page() {
  return <PrivacyPage />;
}
