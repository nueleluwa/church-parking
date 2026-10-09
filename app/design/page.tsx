import { PMark } from "@/components/PMark";

const swatches = [
  { name: "page", cls: "bg-page" },
  { name: "sage", cls: "bg-sage" },
  { name: "sage-dark", cls: "bg-sage-dark" },
  { name: "slate-green", cls: "bg-slate-green" },
  { name: "brand", cls: "bg-brand" },
  { name: "select", cls: "bg-select" },
  { name: "ink", cls: "bg-ink" },
  { name: "danger", cls: "bg-danger" },
];

export default function DesignPage() {
  return (
    <>
      <header className="flex items-center gap-3 bg-slate-green px-4 py-3 text-white">
        <PMark className="bg-white !text-slate-green" />
        <span className="text-lg font-semibold">Design tokens</span>
      </header>
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <section className="rounded-card bg-sage p-4">
          <h2 className="mb-3 font-semibold">Colours</h2>
          <ul className="grid grid-cols-4 gap-3">
            {swatches.map((s) => (
              <li key={s.name} className="text-xs">
                <div className={`h-12 rounded-lg border border-edge/30 ${s.cls}`} />
                <span className="mt-1 block">{s.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-card bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Card</h2>
          <p className="mt-1 text-ink-soft">White, rounded, on a sage background.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Selected state</h2>
          <div className="flex gap-3">
            <button className="flex-1 rounded-xl border-2 border-transparent bg-card px-4 py-3 font-medium">
              Not selected
            </button>
            <button
              aria-pressed="true"
              className="flex-1 rounded-xl border-2 border-edge bg-select px-4 py-3 font-semibold text-ink"
            >
              Selected
            </button>
          </div>
        </section>

        <button className="w-full rounded-full bg-brand px-6 py-4 text-lg font-semibold text-white hover:bg-brand-dark">
          Get my pass
        </button>
      </main>
    </>
  );
}
