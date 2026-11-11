"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { removeCandidatePhoto, uploadCandidatePhoto } from "../actions";

/**
 * The candidate's photo (or initials), with change / remove controls for people who can edit.
 * `src` is the app's own photo route with a version, so a new upload shows immediately.
 */
export function CandidatePhoto({ orgSlug, candidateId, name, src, canWrite, className }: { orgSlug: string; candidateId: string; name: string; src: string | null; canWrite: boolean; className?: string }) {
  const t = useT("candidates");
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) =>
    start(async () => {
      const fd = new FormData();
      fd.set("photo", file);
      const r = await uploadCandidatePhoto(orgSlug, candidateId, null, fd);
      if (r.ok) toast.success(r.message ?? t("photo.updated"));
      else toast.error(r.error);
      if (input.current) input.current.value = "";
    });
  const remove = () =>
    start(async () => {
      const r = await removeCandidatePhoto(orgSlug, candidateId);
      if (r.ok) toast.success(r.message ?? t("photo.removed"));
      else toast.error(r.error);
    });

  return (
    <div className={cn("group relative size-28 shrink-0", className)}>
      <div className="size-full overflow-hidden rounded-[1.75rem] bg-muted ring-4 ring-card shadow-[0_12px_30px_-12px_rgb(0_0_0/0.35)]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, same-origin route; no optimization wanted
          <img src={src} alt={t("photo.alt", { name })} className="size-full object-cover" />
        ) : (
          <InitialsAvatar name={name} className="size-full rounded-none text-3xl" />
        )}
      </div>
      {canWrite ? (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={pending}
            aria-label={src ? t("photo.change") : t("photo.add")}
            title={src ? t("photo.change") : t("photo.add")}
            className="absolute -right-1.5 -bottom-1.5 grid size-9 place-items-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-accent focus-visible:outline-2 disabled:opacity-70"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          </button>
          {src ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label={t("photo.remove")}
              title={t("photo.remove")}
              className="absolute -top-1.5 -right-1.5 grid size-7 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
