"use client";

import { useState } from "react";
import { useToast } from "@/components/ds/Toast";
import { IconDownload } from "@/components/icons";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "done"; rows: number } | { kind: "error"; message: string };

/**
 * Makes one report and saves it. The file is asked for here (not by a plain link) so a problem, such as a bad date
 * range or a lost connection, is shown next to the button instead of leaving the screen. It never reloads the page.
 */
export function DownloadButton({
  href,
  report,
  disabled,
  label = "Download",
  outline = false,
}: {
  href: string;
  report: string;
  disabled?: boolean;
  label?: string;
  /** A white button with an outline, for a screen where Download is not the main action. */
  outline?: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function download() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const message = res.status === 401 ? "Please sign in again as an admin." : (body?.error ?? "The report could not be made. Please try again.");
        setState({ kind: "error", message });
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "report.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const rows = Number(res.headers.get("X-Report-Rows") ?? "0");
      setState({ kind: "done", rows });
      toast.success(rows === 0 ? "Report exported. There were no records for these dates." : "Report exported successfully.");
    } catch {
      const message = "No connection. Check your internet and try again.";
      setState({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 lg:items-end">
      <button
        type="button"
        onClick={() => void download()}
        disabled={disabled || state.kind === "loading"}
        aria-label={`Download ${report} as CSV`}
        className={`btn ${outline ? "btn-outline" : "btn-primary"}`}
      >
        <IconDownload className="h-5 w-5" />
        {state.kind === "loading" ? "Preparing…" : label}
      </button>
      <span role="status" aria-live="polite" className={`text-xs ${state.kind === "error" ? "font-semibold text-accent" : "text-ink-soft"}`}>
        {state.kind === "done" && (state.rows === 0 ? "Downloaded. No records for these dates." : `Downloaded · ${state.rows} ${state.rows === 1 ? "row" : "rows"}`)}
        {state.kind === "error" && state.message}
      </span>
    </div>
  );
}
