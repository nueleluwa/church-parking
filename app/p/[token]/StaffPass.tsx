"use client";

import { useRouter } from "next/navigation";
import type { ScanCard } from "@/lib/rules/scan";
import { ResultCard } from "@/app/staff/(app)/ResultCard";

/** What a signed-in staff member sees when they open a pass link: the scanner result card. */
export function StaffPass({ card }: { card: ScanCard }) {
  const router = useRouter();
  return <ResultCard card={card} method="scan" onDone={() => router.push("/staff/scan")} doneLabel="Back to scanner" />;
}
