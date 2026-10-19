import { getAreaBySlug } from "@/lib/db";
import { ExitCheckOut } from "./ExitCheckOut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check out", robots: { index: false } };

/**
 * The page an exit sign opens. It only shows the screen: the check-out itself is sent from the screen as a POST. An unknown or
 * switched-off car park gets a plain message, not an error page, and nothing is sent.
 */
export default async function ExitPage({ params }: { params: Promise<{ area: string }> }) {
  const { area: slug } = await params;
  const area = await getAreaBySlug(slug);
  return <ExitCheckOut areaSlug={slug} areaName={area?.name ?? null} />;
}
