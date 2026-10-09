import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronRight } from "./icons";

/**
 * One row in a menu list, like the attendant home and More screens: a round icon, a title with
 * a line of help underneath, and a chevron (or something else on the right, such as a status).
 * Put several inside a card with `divide-y`.
 */
export function MenuRow({
  href,
  icon,
  title,
  subtitle,
  trailing,
}: {
  href?: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-page text-ink">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        {subtitle && <span className="block text-sm text-ink-soft">{subtitle}</span>}
      </span>
      {trailing ?? (href && <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />)}
    </>
  );
  const row = "flex items-center gap-3 px-4 py-3";
  return href ? (
    <Link href={href} className={`${row} hover:bg-page`}>
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}
