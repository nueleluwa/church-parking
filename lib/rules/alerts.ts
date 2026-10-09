const LABELS: Record<string, { title: string; hint: string }> = {
  plate_conflict: {
    title: "Second check-in for a car already checked in",
    hint: "Someone tried to check in this car again. Check who is with the car.",
  },
  member_plate_claim: {
    title: "A guest tried to check in a member's car",
    hint: "The plate belongs to a member. Check who is with the car.",
  },
  no_match: {
    title: "Attendant is holding a car: does not match",
    hint: "Go to the exit and check the driver and the car.",
  },
};

/** Plain-English wording for an alert on the coordinator's feed. */
export function describeAlert(kind: string): { title: string; hint: string } {
  return LABELS[kind] ?? { title: "Something needs a look", hint: "Ask the attendant what happened." };
}
