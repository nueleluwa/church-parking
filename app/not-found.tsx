import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { card, pageMain, secondaryButton } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main className={pageMain}>
        <div className={`${card} text-center`}>
          <h1 className="text-2xl font-bold">We cannot find that page</h1>
          <p className="mt-2 text-ink-soft">
            If you were scanning a parking sign or a pass, please check it and try again, or see an attendant.
          </p>
          <Link href="/" className={`${secondaryButton} mt-5`}>
            Go to the home page
          </Link>
        </div>
      </main>
    </>
  );
}
