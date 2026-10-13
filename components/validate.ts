/**
 * Our own check of a form's fields, so a missing or wrong value is explained in the page's own words and style, not in the speech bubble
 * the browser draws (which looks different on every phone). It reads the browser's rules from the fields (required, pattern, length,
 * type), so the rules stay written once, on the field. `onlyMissing` checks only empty required fields and leaves every other rule to the
 * server, whose messages are more exact.
 */
export type FieldProblem = { el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; message: string };

/** The label's own words, without the help text or hints written inside it. */
const labelOf = (el: FieldProblem["el"]) => {
  const label = el.labels?.[0];
  const own = label ? [...label.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join(" ") : "";
  return (own || el.getAttribute("aria-label") || el.name || "").split("*").join("").replace(/\s+/g, " ").trim();
};

export function firstProblem(form: HTMLFormElement, onlyMissing = false): FieldProblem | null {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.willValidate || el.checkValidity()) continue;
    if (onlyMissing && !el.validity.valueMissing) continue;
    const label = labelOf(el);
    const what = label ? `“${label}”` : "this field";
    return { el, message: el.validity.valueMissing ? `Please fill in ${what}.` : `Please check ${what}.` };
  }
  return null;
}
