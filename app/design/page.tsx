import { AppHeader } from "@/components/AppHeader";
import { IconCheck } from "@/components/icons";
import { dangerButton, primaryButton, secondaryButton } from "@/components/ui";

const swatches = [
  { name: "page", cls: "bg-page" },
  { name: "panel", cls: "bg-panel" },
  { name: "night", cls: "bg-night" },
  { name: "action", cls: "bg-action" },
  { name: "accent", cls: "bg-accent" },
  { name: "blush", cls: "bg-blush" },
  { name: "ink-soft", cls: "bg-ink-soft" },
  { name: "card", cls: "bg-card" },
];

export default function DesignPage() {
  return (
    <>
      <AppHeader title="Design tokens" />
      <main className="mx-auto max-w-md space-y-6 px-4 pb-8 pt-5">
        <section className="rounded-card bg-panel p-4">
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
          <p className="mt-1 text-ink-soft">White, rounded, on a warm off-white page.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Selected state</h2>
          <div className="flex gap-3">
            <button className="flex-1 rounded-2xl border-2 border-transparent bg-card px-4 py-3 font-medium">
              Not selected
            </button>
            <button
              aria-pressed="true"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-edge bg-blush px-4 py-3 font-semibold text-ink"
            >
              <IconCheck className="h-5 w-5" />
              Selected
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Buttons</h2>
          <button className={primaryButton}>Get my pass</button>
          <button className={secondaryButton}>Create account</button>
          <button className={dangerButton}>Does not match</button>
        </section>
      </main>
    </>
  );
}
