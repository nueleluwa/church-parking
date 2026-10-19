import { describe, expect, test } from "vitest";
import { memberMatchCard, parseMemberSearch } from "./staff-member";

describe("parseMemberSearch", () => {
  test.each([
    ["0803 123 4567", { kind: "phone", local: "08031234567" }],
    ["+234 803 123 4567", { kind: "phone", local: "08031234567" }],
    ["2348031234567", { kind: "phone", local: "08031234567" }],
    ["phc-234 ab", { kind: "plate", plate: "PHC234AB" }],
    ["  ABC123DE ", { kind: "plate", plate: "ABC123DE" }],
  ])("%j", (input, expected) => {
    expect(parseMemberSearch(input)).toEqual(expected);
  });

  test.each(["", "   ", "ab", "+44 7700 900123", "a".repeat(30), "!!"])("is not a search: %j", (input) => {
    expect(parseMemberSearch(input)).toBeNull();
  });
});

describe("memberMatchCard", () => {
  const m = { full_name: "John Okafor", phone: "+2348031234567", active: true, plates: ["PHC234AB"] };

  test("shows a first name, the last four digits and the plates", () => {
    expect(memberMatchCard(m)).toEqual({ firstName: "John", phoneEnding: "•••• 4567", plates: ["PHC 234 AB"], active: true });
  });

  test("never carries the full name or the full number", () => {
    const text = JSON.stringify(memberMatchCard(m));
    expect(text).not.toContain("Okafor");
    expect(text).not.toContain("803");
    expect(text).not.toContain("2348031234567");
  });

  test("keeps an inactive member visible as inactive", () => {
    expect(memberMatchCard({ ...m, active: false }).active).toBe(false);
  });
});
