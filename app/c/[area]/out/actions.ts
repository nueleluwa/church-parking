"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkoutWithCredential, claimStore, getAreaBySlug, getSettings } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { clearExitCredential, readExitCredential } from "@/lib/exit-cookie";
import { ipKey } from "@/lib/member-auth";
import { hashCredential, lagosDate } from "@/lib/rules";
import { isSameOrigin } from "@/lib/rules/origin";

/**
 * The exit sign. Opening the exit page sends this as a POST (a Server Action is always a POST, so a link preview or prefetch,
 * which only ever GET, cannot close anything). The browser attaches the credential cookie itself. It never takes a phone number.
 *
 * Nothing is closed unless the credential belongs to an open visit at THIS car park. The cookie is cleared only once the
 * visit is closed (by this request or already), never on a refusal, so a wrong sign does not cost the member their credential.
 */
export type ExitResult =
  | { status: "ok"; plate: string; releasedAt: string }
  | {
      status:
        | "already_closed"
        | "closed_missed"
        | "no_credential"
        | "expired"
        | "wrong_area"
        | "held"
        | "bad_sign"
        | "bad_origin"
        | "rate_limited"
        | "error";
    };

const slugSchema = z.string().min(1).max(40);

export async function checkOut(areaSlug: string): Promise<ExitResult> {
  const slug = slugSchema.safeParse(areaSlug);
  if (!slug.success) return { status: "bad_sign" };

  // This must come from our own page: the header has to be there and name this site
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"), h.get("x-forwarded-host"))) return { status: "bad_origin" };

  try {
    const area = await getAreaBySlug(slug.data);
    if (!area) return { status: "bad_sign" };

    const credential = await readExitCredential();
    if (!credential) return { status: "no_credential" };

    // Limit tries from one address. Generous (three times the lookup limit): a car park empties all at once, often through the
    // same mobile network, and the credential cannot be guessed anyway.
    const ip = await ipKey("exit-ip", serverEnv().SESSION_SECRET);
    if (ip) {
      const limit = (await getSettings()).lookupIpPerMinute * 3;
      const tries = await claimStore.countAttempts(ip, 1);
      await claimStore.recordAttempt(ip);
      if (tries >= limit) return { status: "rate_limited" };
    }

    const answer = await checkoutWithCredential(hashCredential(credential), area.id, lagosDate(new Date()));
    if (answer.status === "ok") {
      await clearExitCredential();
      return { status: "ok", plate: answer.plate, releasedAt: answer.released_at };
    }
    // The visit is over, whoever closed it: the credential has nothing left to do
    if (answer.status === "already_closed" || answer.status === "closed_missed") await clearExitCredential();
    return { status: answer.status };
  } catch {
    // Not a success: the screen says nothing was changed and offers to try again
    return { status: "error" };
  }
}
