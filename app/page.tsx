import { PMark } from "@/components/PMark";

export default function Home() {
  return (
    <>
      <header className="flex items-center gap-3 bg-slate-green px-4 py-3 text-white">
        <PMark className="bg-white !text-slate-green" />
        <span className="text-lg font-semibold">CCI Parking</span>
      </header>
      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-card bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Welcome to CCI Parking</h1>
          <p className="mt-2 text-ink-soft">
            To get your parking pass, scan the sign in your car park.
          </p>
        </div>
      </main>
    </>
  );
}
