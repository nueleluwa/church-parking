import type { PassState } from "./pass-view";

/**
 * One meaning for each status colour, used on every screen:
 *   success = valid / good        (green)
 *   danger  = invalid / error     (red)
 *   warning = pending / processing (amber)
 *   neutral = finished, nothing to do (grey)
 */
export type Tone = "success" | "danger" | "warning" | "neutral";

/** How a pass is shown: valid is green, expired is red, released or closed is finished (neutral). */
export function passTone(state: PassState): Tone {
  switch (state) {
    case "valid":
      return "success";
    case "expired":
      return "danger";
    case "released":
    case "missed":
      return "neutral";
  }
}

/** How a visit's stored status is shown in a member's history. */
export function visitTone(status: "parked" | "released" | "missed"): Tone {
  return status === "parked" ? "success" : "neutral";
}

/** Plain words for statuses that are not a pass (a request that is waiting, working or has failed). */
export function progressTone(status: "pending" | "processing" | "failed" | "error" | "done"): Tone {
  switch (status) {
    case "pending":
    case "processing":
      return "warning";
    case "failed":
    case "error":
      return "danger";
    case "done":
      return "success";
  }
}
