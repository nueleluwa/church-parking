import { AppHeader } from "@/components/AppHeader";
import { card, pageMain } from "@/components/ui";

export const metadata = { title: "No connection" };
export const dynamic = "force-static";

/** What the installed app shows when the phone has no internet. Nothing is stored on the phone (D-06). */
export default function OfflinePage() {
  return (
    <>
      <AppHeader />
      <main className={pageMain}>
        <div className={`${card} text-center`}>
          <h1 className="text-2xl font-bold">No internet connection</h1>
          <p className="mt-2 text-ink-soft">
            Check your signal and try again. If you are parking, see an attendant. Parking team: use the paper tallies.
          </p>
        </div>
      </main>
    </>
  );
}
