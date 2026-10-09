"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { IconCheck } from "@/components/icons";
import { errorBox, field, outlineButton, redButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import { Plate } from "@/components/Plate";
import { registerCar, type RegisterState } from "../actions";

const LAST_AREA = "cp-last-area";

export function RegisterForm({ areas, initialPlate = "" }: { areas: { slug: string; name: string }[]; initialPlate?: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerCar, {});
  const formRef = useRef<HTMLFormElement>(null);
  const { bind, values, set } = useFields({ area: areas[0]?.slug ?? "", plate: initialPlate, phone: "", name: "" });

  // The car park used last time on this phone is chosen first: attendants usually stand in one place
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_AREA);
      if (last && areas.some((a) => a.slug === last)) set("area", last);
    } catch {
      /* storage can be blocked: the first car park stays chosen */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!state.reference) return;
    try {
      localStorage.setItem(LAST_AREA, values.area);
    } catch {
      /* ignore */
    }
  }, [state.reference, values.area]);
  const [forMember, setForMember] = useState(false);

  /** Submit again for the member: the flag is set first so it goes with this submit only. */
  function registerForMember() {
    flushSync(() => setForMember(true));
    formRef.current?.requestSubmit();
    setForMember(false);
  }

  if (state.reference) {
    return (
      <div className="space-y-4">
        <section role="status" className="rounded-card border-2 border-success bg-success-soft p-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
            <IconCheck className="h-8 w-8" />
          </span>
          <h2 className="mt-2 text-2xl font-extrabold">Car added</h2>
          <p className="mt-1 text-ink-soft">Tell the driver to remember this reference.</p>
          <Plate plate={state.plate ?? ""} size="lg" variant="plain" className="mt-3" />
          <p className="mt-2 text-4xl font-extrabold tracking-widest">{state.reference}</p>
        </section>
        <a href="/staff/register" className={redButton}>
          Add another car
        </a>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="forMember" value={forMember ? "yes" : ""} />
      <label className="block font-medium">
        Area
        <select {...bind("area")} className={field}>
          {areas.map((a) => (
            <option key={a.slug} value={a.slug}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="block font-medium">
        Plate number
        <input {...bind("plate")} required autoCapitalize="characters" autoComplete="off" className={`${field} uppercase`} />
      </label>
      <label className="block font-medium">
        Phone number
        <input {...bind("phone")} type="tel" inputMode="tel" placeholder="0803 123 4567" className={field} />
      </label>
      <label className="block font-medium">
        Name (if they want to give it)
        <input {...bind("name")} maxLength={80} className={field} />
      </label>
      {state.error && (
        <p role="alert" className={errorBox}>
          {state.error}
        </p>
      )}
      <button disabled={pending} className={redButton}>
        {pending ? "Please wait..." : "Add car"}
      </button>
      {state.memberPlate && (
        <button
          type="button"
          onClick={registerForMember}
          disabled={pending}
          className={outlineButton}
        >
          Register for the member
        </button>
      )}
    </form>
  );
}
