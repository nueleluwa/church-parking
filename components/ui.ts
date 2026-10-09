/** Shared class names for forms and buttons, so every screen looks the same. */
export const field =
  "mt-2 w-full rounded-2xl border-2 border-edge/40 bg-white px-4 py-3.5 text-lg placeholder:text-ink-soft/60 focus:border-edge focus:outline-none focus:ring-4 focus:ring-blush";

const buttonBase =
  "inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-center text-lg font-semibold transition active:scale-[0.98] disabled:opacity-60 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-edge";

export const primaryButton = `${buttonBase} bg-action text-white shadow-sm hover:bg-action-dark`;

/** Main button on member-facing screens (check-in, pass, account): church red, like the member journey. Attendant screens keep black. */
export const redButton = `${buttonBase} bg-accent text-white shadow-sm hover:bg-accent-dark`;

/** The quieter partner of redButton: white with a dark outline. */
export const outlineButton = `${buttonBase} border-2 border-edge/70 bg-white text-ink hover:bg-page`;

/** A smaller button for a pair of side-by-side choices: the same height, text centred, and room to wrap on a narrow phone. */
export const quietButton =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full border-2 border-edge/70 bg-white px-3 py-2.5 text-center text-base font-semibold leading-tight text-ink transition hover:bg-page active:scale-[0.98] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-edge";

export const secondaryButton = `${buttonBase} border-2 border-edge bg-white text-ink hover:bg-page`;

export const dangerButton = `${buttonBase} border-2 border-danger bg-white text-danger hover:bg-page`;

export const errorBox = "rounded-2xl border-2 border-danger bg-white p-3 font-medium text-danger";

export const okBox = "rounded-2xl border-2 border-success bg-success-soft p-3 font-medium text-ink";

export const card = "rounded-card bg-card p-5 shadow-sm";

export const pageMain = "mx-auto max-w-md space-y-4 px-4 pb-8 pt-5";
