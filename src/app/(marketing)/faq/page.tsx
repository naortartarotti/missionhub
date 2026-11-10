import { FaqPage } from "@/features/landing/components/faq-page";
import { marketingMetadata } from "@/features/landing/metadata";

export const generateMetadata = () => marketingMetadata("faq", "/faq");

export default function Page() {
  return <FaqPage />;
}
