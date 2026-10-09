export type PassState = "valid" | "released" | "missed" | "expired";

export type PassViewInput = {
  plate: string;
  status: "parked" | "released" | "missed";
  reference: string;
  areaName: string;
  serviceName: string;
  serviceDate: string;
  today: string; // Lagos date
};

export type PassView =
  | { kind: "public"; plate: string; state: PassState }
  | {
      kind: "owner";
      plate: string;
      state: PassState;
      reference: string;
      areaName: string;
      serviceName: string;
    };

/** R-7: a pass works only on the day it was issued. */
export function passState(i: Pick<PassViewInput, "status" | "serviceDate" | "today">): PassState {
  if (i.status === "released") return "released";
  if (i.status === "missed") return "missed";
  return i.serviceDate === i.today ? "valid" : "expired";
}

/**
 * Builds what the pass page may show. Anyone who isn't the holder gets the
 * plate and state only. No view ever carries a name, a phone number or the
 * pass token.
 */
export function buildPassView(i: PassViewInput, isOwner: boolean): PassView {
  const state = passState(i);
  if (!isOwner) return { kind: "public", plate: i.plate, state };
  return {
    kind: "owner",
    plate: i.plate,
    state,
    reference: i.reference,
    areaName: i.areaName,
    serviceName: i.serviceName,
  };
}
