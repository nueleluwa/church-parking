"use client";

import { useState } from "react";
import { IconDownload } from "@/components/icons";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "done"; rows: number } | { kind: "error"; message: string };

/**
 * Makes one report and saves it. The file is asked for here (not by a plain link) so a problem, such as a bad date
 * range or a lost connection, is shown next to the button instead of leaving the screen. It never reloads the page.
 */
export function DownloadButton({ href, report, disabled }: { href: string; report: string; disabled?: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function download() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setState({
          kind: "error",
          message: res.status === 401 ? "Please sign in again as an admin." : (body?.error ?? "The report could not be made. Please try again."),
        });
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
      setState({ kind: "done", rows: Number(res.headers.get("X-Report-Rows") ?? "0") });
    } catch {
      setState({ kind: "error", message: "No connection. Check your internet and try again." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 lg:items-end">
      <button
        type="button"
        onClick={() => void download()}
        disabled={disabled || state.kind === "loading"}
        aria-label={`Download ${report} as CSV`}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        <IconDownload className="h-5 w-5" />
        {state.kind === "loading" ? "Preparing…" : "Download"}
      </button>
      <span role="status" aria-live="polite" className={`text-xs ${state.kind === "error" ? "font-semibold text-accent" : "text-ink-soft"}`}>
        {state.kind === "done" && (state.rows === 0 ? "Downloaded. No records for these dates." : `Downloaded · ${state.rows} ${state.rows === 1 ? "row" : "rows"}`)}
        {state.kind === "error" && state.message}
      </span>
    </div>
  );
}
