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

/** Compact page numbers with Previous and Next, for a long list. The page builds the links, so the filters in the address are kept. */
export function PageNumbers({ page, pages, href, numbers }: { page: number; pages: number; href: (page: number) => string; numbers: (number | "gap")[] }) {
  if (pages <= 1) return null;
  const box = "flex h-10 min-w-10 items-center justify-center rounded-lg border border-edge/20 px-2 font-semibold";
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5">
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="Previous page" className={`${box} bg-white hover:bg-page`}>
          ‹
        </Link>
      ) : (
        <span aria-hidden="true" className={`${box} text-ink-soft/40`}>
          ‹
        </span>
      )}
      {numbers.map((n, i) =>
        n === "gap" ? (
          <span key={`gap${i}`} aria-hidden="true" className="px-1 text-ink-soft">
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" aria-label={`Page ${n}, current`} className={`${box} border-accent bg-accent text-white`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)} aria-label={`Page ${n}`} className={`${box} bg-white hover:bg-page`}>
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(page + 1)} aria-label="Next page" className={`${box} bg-white hover:bg-page`}>
          ›
        </Link>
      ) : (
        <span aria-hidden="true" className={`${box} text-ink-soft/40`}>
          ›
        </span>
      )}
    </nav>
  );
}
