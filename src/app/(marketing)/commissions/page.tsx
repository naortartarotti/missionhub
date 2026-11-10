import { CommissionsPage } from "@/features/landing/components/commissions-page";
import { marketingMetadata } from "@/features/landing/metadata";

export const generateMetadata = () => marketingMetadata("commissions", "/commissions");

export default function Page() {
  return <CommissionsPage />;
}
