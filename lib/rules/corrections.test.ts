import { describe, expect, test } from "vitest";
import { canCorrect, checkReason, CORRECTION_MESSAGES } from "./corrections";

describe("checkReason (OP-3)", () => {
  test("a short written reason is accepted and trimmed", () => {
    expect(checkReason("  Parked in the wrong car park  ")).toEqual({
      ok: true,
      reason: "Parked in the wrong car park",
    });
  });
  test("an empty or very short reason is refused", () => {
    for (const bad of ["", "   ", "oops", "ab"]) expect(checkReason(bad).ok).toBe(false);
  });
  test("a very long reason is refused", () => {
    expect(checkReason("x".repeat(201)).ok).toBe(false);
  });
});

describe("canCorrect", () => {
  test("coordinators and admins can, attendants cannot", () => {
    expect(canCorrect("attendant")).toBe(false);
    expect(canCorrect("coordinator")).toBe(true);
    expect(canCorrect("admin")).toBe(true);
  });
});

test("every result has plain wording", () => {
  for (const message of Object.values(CORRECTION_MESSAGES)) expect(message.length).toBeGreaterThan(3);
});
