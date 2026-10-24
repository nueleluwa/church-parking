import { GetForm } from "@/components/ds/GetForm";
import { IconSearch } from "@/components/icons";
import { formatLagosDate } from "@/lib/format";
import { lagosDate } from "@/lib/rules";

/**
 * The slim bar across the top of wide screens, in place of the phone-style title bar: a plate search that opens the visit list
 * (the last year, so an old car is found too) and today's date. The page's own heading is the only title.
 */
export function DesktopBar() {
  const today = lagosDate(new Date());
  const from = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  return (
    <div className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-6 bg-page px-8 lg:flex print:hidden">
      <GetForm action="/admin/visits" role="search" noValidate className="relative w-full max-w-md">
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={today} />
        <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
        <input
          name="q"
          aria-label="Find a car by vehicle number"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="Find a car by vehicle number"
          className="input !mt-0 !pl-11 uppercase placeholder:normal-case"
        />
      </GetForm>
      <p className="whitespace-nowrap text-sm font-medium text-ink-soft">{formatLagosDate(new Date().toISOString())}</p>
    </div>
  );
}
