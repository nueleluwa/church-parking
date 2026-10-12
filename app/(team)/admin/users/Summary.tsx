import Link from "next/link";
import { IconChevronRight } from "@/components/icons";

/** One summary card. It is a link that applies the matching filter. */
export function Summary({ label, value, note, href, id, icon }: { label: string; value: number; note: string; href: string; id: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-edge/15 bg-card p-4 hover:bg-page">
      <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-page text-ink sm:flex">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-soft">{label}</span>
        <span data-testid={id} className="block text-3xl font-extrabold leading-tight">
          {value}
        </span>
        <span className="block text-xs text-ink-soft">{note}</span>
      </span>
      <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
    </Link>
  );
}
