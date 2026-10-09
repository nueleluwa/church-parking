import { expect, test } from "vitest";
import { describeAlert } from "./alerts";

test("every alert kind the app raises has plain wording", () => {
  for (const kind of ["plate_conflict", "member_plate_claim", "no_match"]) {
    const a = describeAlert(kind);
    expect(a.title.length).toBeGreaterThan(10);
    expect(a.hint.length).toBeGreaterThan(10);
  }
});

test("an unknown kind still gets a safe message", () => {
  expect(describeAlert("something_new").title).toBe("Something needs a look");
});
