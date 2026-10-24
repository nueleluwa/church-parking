"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/ds/Toast";
import { Spinner } from "@/components/Spinner";

/**
 * Choosing records and deleting them, one or many, with a question first. The checkboxes are plain inputs marked with a group
 * name, so any list (a table, cards, a page of rows) can join in without sharing state: `BulkCheck` on each row, `BulkSelectAll`
 * in the header, one `BulkBar` above the list. The server decides what can go; whatever it keeps is listed with the reason.
 */
export type BulkResult = { ok: boolean; error?: string; deleted: string[]; kept: { id: string; reason: string }[] };
export type BulkAction = (ids: string[]) => Promise<BulkResult>;
type Item = { id: string; label: string };

/** Only the boxes you can see: a list drawn as cards on a phone and a table on a desktop has both in the page, one hidden. */
const boxes = (group: string, checkedOnly = false) =>
  Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-bulk="${group}"]${checkedOnly ? ":checked" : ""}`)).filter(
    (b) => b.offsetParent !== null,
  );

/** The tick on one row. `label` is what a screen reader and the confirmation call it. */
export function BulkCheck({ group, id, label }: { group: string; id: string; label: string }) {
  return (
    <input
      type="checkbox"
      data-bulk={group}
      data-label={label}
      value={id}
      aria-label={`Select ${label}`}
      className="h-5 w-5 shrink-0 accent-accent"
    />
  );
}

/** The tick in the header that selects every row in the list. */
export function BulkSelectAll({ group, noun }: { group: string; noun: string }) {
  return (
    <input
      type="checkbox"
      data-bulk-all={group}
      aria-label={`Select all ${noun}`}
      onChange={(e) => {
        for (const box of boxes(group)) box.checked = e.currentTarget.checked;
        e.currentTarget.dispatchEvent(new Event("bulk-change", { bubbles: true }));
      }}
      className="h-5 w-5 shrink-0 accent-accent"
    />
  );
}

/** The confirmation. It lists what will go, says what happens to history, and after the answer lists anything that was kept. */
function ConfirmDelete({
  items,
  noun,
  nounPlural,
  consequence,
  action,
  onClose,
  onDone,
}: {
  items: Item[];
  noun: string;
  nounPlural: string;
  consequence: string;
  action: BulkAction;
  onClose: () => void;
  onDone: (deleted: string[]) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [kept, setKept] = useState<{ label: string; reason: string }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const many = items.length > 1;
  const name = many ? `${items.length} ${nounPlural}` : `this ${noun}`;

  function confirm() {
    setError("");
    start(async () => {
      let result: BulkResult;
      try {
        result = await action(items.map((i) => i.id));
      } catch {
        setError("We could not reach the server. Nothing was deleted. Check your connection and try again.");
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      const label = (id: string) => items.find((i) => i.id === id)?.label ?? id;
      if (result.deleted.length > 0) {
        toast.success(result.deleted.length === 1 ? `Deleted ${label(result.deleted[0]!)}.` : `Deleted ${result.deleted.length} ${nounPlural}.`);
        onDone(result.deleted);
        router.refresh();
      }
      if (result.kept.length > 0) setKept(result.kept.map((k) => ({ label: label(k.id), reason: k.reason })));
      else onClose();
    });
  }

  const shown = items.slice(0, 8);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="bulk-title"
      className="m-auto w-[min(92vw,28rem)] rounded-2xl bg-white p-6 text-ink shadow-xl backdrop:bg-black/50"
    >
      {kept.length === 0 ? (
        <>
          <h2 id="bulk-title" className="t-section">
            Delete {name}?
          </h2>
          <ul className="mt-3 space-y-1 text-[0.9375rem] font-semibold">
            {shown.map((i) => (
              <li key={i.id} className="truncate">
                {i.label}
              </li>
            ))}
            {items.length > shown.length && <li className="text-ink-soft">and {items.length - shown.length} more</li>}
          </ul>
          <p className="mt-3 text-sm leading-snug text-ink-soft">{consequence}</p>
          <p className="mt-2 text-sm font-semibold">This cannot be undone.</p>
          {error && (
            <p role="alert" className="mt-3 rounded-xl border-2 border-accent bg-white p-3 text-sm font-medium text-accent">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => ref.current?.close()} disabled={pending} className="btn btn-outline">
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={pending} className="btn btn-primary">
              {pending && <Spinner />}
              {pending ? "Deleting..." : many ? `Delete ${items.length} ${nounPlural}` : `Delete ${noun}`}
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="bulk-title" className="t-section">
            {kept.length === 1 ? "One was kept" : `${kept.length} were kept`}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {kept.map((k) => (
              <li key={k.label}>
                <span className="font-semibold">{k.label}</span>
                <span className="block text-ink-soft">{k.reason}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => ref.current?.close()} className="btn btn-primary">
              Done
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

/** "3 selected" with Clear and Delete selected. It appears only while something is ticked. */
export function BulkBar({
  group,
  noun,
  nounPlural,
  consequence,
  action,
}: {
  group: string;
  noun: string;
  nounPlural: string;
  consequence: string;
  action: BulkAction;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [asking, setAsking] = useState<Item[] | null>(null);

  useEffect(() => {
    const read = () => {
      const picked = boxes(group, true).map((b) => ({ id: b.value, label: b.dataset.label ?? b.value }));
      setItems(picked);
      const all = document.querySelector<HTMLInputElement>(`input[data-bulk-all="${group}"]`);
      const total = boxes(group).length;
      if (all) {
        all.checked = total > 0 && picked.length === total;
        all.indeterminate = picked.length > 0 && picked.length < total;
      }
    };
    const onChange = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && (t.dataset.bulk === group || t.dataset.bulkAll === group)) read();
    };
    document.addEventListener("change", onChange);
    document.addEventListener("bulk-change", read);
    return () => {
      document.removeEventListener("change", onChange);
      document.removeEventListener("bulk-change", read);
    };
  }, [group]);

  const clear = () => {
    for (const b of boxes(group)) b.checked = false;
    const all = document.querySelector<HTMLInputElement>(`input[data-bulk-all="${group}"]`);
    if (all) {
      all.checked = false;
      all.indeterminate = false;
    }
    setItems([]);
  };

  return (
    <>
      {items.length > 0 && (
        <div role="region" aria-label="Selected" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blush px-4 py-3">
          <p aria-live="polite" className="font-semibold">
            {items.length} selected
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={clear} className="btn btn-quiet">
              Clear
            </button>
            <button type="button" onClick={() => setAsking(items)} className="btn btn-sm btn-danger">
              Delete selected
            </button>
          </div>
        </div>
      )}
      {asking && (
        <ConfirmDelete
          items={asking}
          noun={noun}
          nounPlural={nounPlural}
          consequence={consequence}
          action={action}
          onClose={() => setAsking(null)}
          onDone={() => clear()}
        />
      )}
    </>
  );
}

/** Delete on one row. It asks the same question as the bulk bar. */
export function DeleteButton({
  id,
  label,
  noun,
  consequence,
  action,
  className = "btn btn-quiet text-accent",
  text = "Delete",
}: {
  id: string;
  label: string;
  noun: string;
  consequence: string;
  action: BulkAction;
  className?: string;
  text?: string;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} aria-label={`Delete ${label}`} className={className}>
        {text}
      </button>
      {asking && (
        <ConfirmDelete
          items={[{ id, label }]}
          noun={noun}
          nounPlural={`${noun}s`}
          consequence={consequence}
          action={action}
          onClose={() => setAsking(false)}
          onDone={() => {}}
        />
      )}
    </>
  );
}
