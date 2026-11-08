import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page isn't available</h1>
        <p className="mt-2 text-muted-foreground">It doesn't exist, or you don't have access to it.</p>
        <Button className="mt-6" asChild><Link href="/">Go to my workspace</Link></Button>
      </div>
    </main>
  );
}
