"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toast design (adapted from lensdrop): a labelled type chip above the
 * message, the card subtly tinted toward the type's accent. Each variant sets
 * `--toast-accent` on the container; chip and tint derive from it.
 */
function ToastChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-(--toast-accent)/10 px-2 py-0.5 font-semibold text-[10px]/4 text-(--toast-accent) uppercase tracking-[0.08em]">
      {icon}
      {label}
    </span>
  );
}

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      closeButton
      icons={{
        success: (
          <ToastChip
            icon={<CircleCheckIcon className="size-3" />}
            label="Success"
          />
        ),
        info: <ToastChip icon={<InfoIcon className="size-3" />} label="Info" />,
        warning: (
          <ToastChip
            icon={<TriangleAlertIcon className="size-3" />}
            label="Warning"
          />
        ),
        error: (
          <ToastChip icon={<OctagonXIcon className="size-3" />} label="Error" />
        ),
        loading: (
          <ToastChip
            icon={<Loader2Icon className="size-3 animate-spin" />}
            label="Working"
          />
        ),
        close: <XIcon className="size-3.5" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group/toast relative flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-border bg-[color-mix(in_oklab,var(--popover),var(--toast-accent,var(--popover))_5%)] p-3 pr-8 font-sans text-popover-foreground shadow-lg [&[data-expanded=false][data-front=false]>*]:opacity-0",
          content: "flex w-full flex-col gap-0.5",
          title: "font-semibold text-sm/snug",
          description: "text-muted-foreground! text-sm/snug",
          icon: "flex w-full",
          loader: "relative! top-auto! left-auto! w-full transform-none!",
          actionButton:
            "mt-0.5 inline-flex h-7 shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm bg-foreground px-2.5 font-semibold text-background text-xs outline-none transition-all hover:bg-[color-mix(in_oklab,var(--foreground)_88%,var(--background))] focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px",
          cancelButton:
            "mt-0.5 inline-flex h-7 shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm border border-border bg-background px-2.5 font-semibold text-xs outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px",
          closeButton:
            "absolute top-2 right-2 rounded-sm border-0! bg-transparent! p-1 text-muted-foreground! outline-none transition-opacity hover:text-foreground! focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/40 pointer-fine:opacity-0 pointer-fine:group-hover/toast:opacity-100",
          success: "[--toast-accent:var(--success)]",
          error: "[--toast-accent:var(--destructive)]",
          warning: "[--toast-accent:var(--warning)]",
          info: "[--toast-accent:var(--info)]",
          loading: "[--toast-accent:var(--muted-foreground)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
