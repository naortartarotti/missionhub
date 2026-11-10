import { HowItWorksPage } from "@/features/landing/components/how-it-works-page";
import { marketingMetadata } from "@/features/landing/metadata";

export const generateMetadata = () => marketingMetadata("how", "/how-it-works");

export default function Page() {
  return <HowItWorksPage />;
}
