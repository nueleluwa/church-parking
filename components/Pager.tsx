import Link from "next/link";

/** Previous and Next for a long admin list. The page builds the links, so the filters in the address are kept. */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  const link = "rounded-full border-2 border-edge/30 bg-white px-4 py-2 font-semibold hover:bg-page";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-soft">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={link}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
