"use client";

import { useState, type ChangeEvent } from "react";

/**
 * Keeps what a person typed in React state. React clears every UNCONTROLLED
 * field of a form once its server action finishes, which wiped names, phone
 * numbers and plates after any error. Fields kept in state are left alone, and
 * the form still works as a normal form (and before the page has loaded).
 *
 * Use `bind("name")` on an input or select. Fields you want cleared after a
 * response (such as a PIN) can be left out and stay uncontrolled.
 */
export function useFields<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);

  function bind<K extends keyof T & string>(name: K) {
    return {
      name,
      value: values[name],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setValues((v) => ({ ...v, [name]: e.target.value })),
    };
  }

  return { values, bind, set: (name: keyof T & string, value: string) => setValues((v) => ({ ...v, [name]: value })) };
}
