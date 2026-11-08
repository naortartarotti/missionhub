"use client";

import { createContext, useContext, useTransition, type ComponentProps, type FormEvent } from "react";

const PendingContext = createContext(false);
export const useActionFormPending = () => useContext(PendingContext);

/**
 * Submits a server action without React 19's automatic form reset, so users keep what they
 * typed when validation fails. Includes the submitter's name/value (e.g. "status=active").
 */
export function ActionForm({ action, children, ...props }: Omit<ComponentProps<"form">, "action" | "onSubmit"> & { action: (formData: FormData) => void | Promise<void> }) {
  const [pending, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    start(() => action(fd));
  };
  return (
    <PendingContext value={pending}>
      <form {...props} onSubmit={onSubmit} aria-busy={pending}>
        {children}
      </form>
    </PendingContext>
  );
}
