import Link from "next/link";

/** Two or three tabs with a red line under the open one, like the member account in the journey. */
export function UnderlineTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { label: string; href: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex border-b-2 border-edge/15">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`-mb-0.5 flex-1 border-b-4 px-4 py-3 text-center font-semibold ${
            t.active ? "border-accent text-accent" : "border-transparent text-ink-soft"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
