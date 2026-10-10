"use client";

import { IconPrinter } from "@/components/icons";
import { outlineButton } from "@/components/ui";

/** Prints the report as it is on screen (the menus and buttons are left out of the printed page). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={outlineButton}>
      <IconPrinter className="h-5 w-5" />
      Print
    </button>
  );
}
