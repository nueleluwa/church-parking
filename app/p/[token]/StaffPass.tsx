"use client";

import { useRouter } from "next/navigation";
import type { ScanCard } from "@/lib/rules/scan";
import { ResultCard } from "@/app/(team)/staff/ResultCard";
import type { CorrectionContext } from "@/lib/correction-context";

/** What a signed-in staff member sees when they open a pass link: the scanner result card. */
export function StaffPass({ card, corrections }: { card: ScanCard; corrections: CorrectionContext | null }) {
  const router = useRouter();
  return <ResultCard card={card} method="scan" onDone={() => router.push("/staff/scan")} doneLabel="Back to scanner" corrections={corrections} />;
}
