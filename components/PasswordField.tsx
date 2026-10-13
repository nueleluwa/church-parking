"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { IconEye, IconEyeOff } from "./icons";
import { field } from "./ui";

/**
 * A PIN or password box with a Show / Hide button, so people can check what they typed.
 * It starts hidden. The button's name ("Show what I typed") deliberately does not contain the
 * word PIN or password, so screen readers and tests find the box itself by its label.
 */
export function PasswordField({
  label,
  compact = false,
  ...input
}: { label: string; /** The admin look: the same 44px field as every admin form. */ compact?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "id">) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={compact ? "label" : "block font-medium"}>
        {label}
      </label>
      <div className="relative">
        <input {...input} id={id} type={shown ? "text" : "password"} className={`${compact ? "input" : field} pr-14`} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? "Hide what I typed" : "Show what I typed"}
          className={`absolute bottom-0 right-1 flex w-12 items-center justify-center rounded-full text-ink-soft hover:text-ink focus-visible:outline-4 focus-visible:outline-edge ${compact ? "top-1.5" : "top-2"}`}
        >
          {shown ? <IconEyeOff className="h-6 w-6" /> : <IconEye className="h-6 w-6" />}
        </button>
      </div>
    </div>
  );
}
