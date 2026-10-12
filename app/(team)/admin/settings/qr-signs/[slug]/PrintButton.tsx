"use client";

import { IconPrinter } from "@/components/icons";
import { primaryButton } from "@/components/ui";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className={primaryButton}>
      <IconPrinter className="h-5 w-5" />
      Print this sign
    </button>
  );
}
