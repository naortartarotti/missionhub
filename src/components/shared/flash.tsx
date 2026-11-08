import { CircleCheck } from "lucide-react";

export function Flash({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
      <CircleCheck className="size-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}
