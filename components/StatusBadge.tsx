import type { ReactNode } from "react";
import type { Tone } from "@/lib/rules/status";
import { IconAlert, IconCheck, IconClock } from "./icons";

/**
 * The one way to show a status. Green means valid, red means invalid or error,
 * amber means pending or processing, grey means finished. Every status always
 * has an icon and words as well as a colour, so it does not rely on colour alone.
 */
const STYLES: Record<Tone, string> = {
  success: "border-success bg-success text-white",
  danger: "border-danger bg-danger text-white",
  warning: "border-warning-edge bg-warning-soft text-warning-ink",
  neutral: "border-edge bg-panel text-ink",
};

const SOFT: Record<Tone, string> = {
  success: "border-success bg-success-soft text-ink",
  danger: "border-danger bg-white text-danger",
  warning: "border-warning-edge bg-warning-soft text-warning-ink",
  neutral: "border-edge/40 bg-panel text-ink",
};

function ToneIcon({ tone, className }: { tone: Tone; className: string }) {
  if (tone === "success") return <IconCheck className={className} />;
  if (tone === "danger") return <IconAlert className={className} />;
  if (tone === "warning") return <IconClock className={className} />;
  return null;
}

type Props = {
  tone: Tone;
  children: ReactNode;
  /** banner: a big solid status (pass). bar: a full-width strip across the top of a card. pill: a small label. soft: a light panel. */
  variant?: "banner" | "bar" | "pill" | "soft";
  className?: string;
};

export function StatusBadge({ tone, children, variant = "pill", className = "" }: Props) {
  if (variant === "banner") {
    return (
      <div
        role="status"
        className={`flex items-center justify-center gap-3 rounded-card border-4 px-4 py-4 ${STYLES[tone]} ${className}`}
      >
        <ToneIcon tone={tone} className="h-8 w-8 shrink-0" />
        <p className="whitespace-nowrap text-3xl font-extrabold">{children}</p>
      </div>
    );
  }
  if (variant === "bar") {
    return (
      <div
        role="status"
        className={`flex items-center justify-center gap-2 border-0 px-4 py-2.5 text-lg font-extrabold ${STYLES[tone]} ${className}`}
      >
        <ToneIcon tone={tone} className="h-6 w-6 shrink-0" />
        <span>{children}</span>
      </div>
    );
  }
  if (variant === "soft") {
    return (
      <div role="status" className={`flex items-center gap-2 rounded-2xl border-2 p-3 font-semibold ${SOFT[tone]} ${className}`}>
        <ToneIcon tone={tone} className="h-5 w-5 shrink-0" />
        <span>{children}</span>
      </div>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 px-2.5 py-0.5 text-sm font-bold ${SOFT[tone]} ${className}`}
    >
      <ToneIcon tone={tone} className="h-4 w-4 shrink-0" />
      {children}
    </span>
  );
}
