"use client";

import { usePathname, useRouter } from "next/navigation";
import type { FormHTMLAttributes } from "react";

/**
 * A filter or search form that changes the address without reloading the page. A plain `<form>` with no `method` loads a whole
 * new page (the side menu, the top bar and the scroll position are thrown away and drawn again, which looks like a refresh);
 * this one keeps everything in place and swaps only the page's content, as a link does. Filters still live in the address (D-29),
 * so the result can be bookmarked or shared, and without script the form falls back to the ordinary page load.
 */
export function GetForm({ action, children, ...rest }: Omit<FormHTMLAttributes<HTMLFormElement>, "method" | "onSubmit"> & { action?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const target = action ?? pathname;
  return (
    <form
      {...rest}
      action={target}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        for (const [name, value] of new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)) {
          if (typeof value === "string") params.append(name, value);
        }
        router.push(`${target}?${params}`);
      }}
    >
      {children}
    </form>
  );
}
