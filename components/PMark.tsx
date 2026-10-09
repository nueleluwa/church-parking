export function PMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-green text-2xl font-bold text-white ${className}`}
    >
      P
    </span>
  );
}
