"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="system"
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4 text-success" />,
      info: <InfoIcon className="size-4 text-info" />,
      warning: <TriangleAlertIcon className="size-4 text-warning" />,
      error: <OctagonXIcon className="size-4 text-danger" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    toastOptions={{ classNames: { toast: "rounded-2xl! border-border! bg-card! text-foreground! shadow-lg!" } }}
    {...props}
  />
);

export { Toaster };
