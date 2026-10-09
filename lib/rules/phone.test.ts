import { describe, expect, test } from "vitest";
import { maskPhone, normalisePhone } from "./phone";

describe("normalisePhone", () => {
  test.each([
    ["08031234567", "+2348031234567"],
    ["0803 123 4567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    ["0803-123-4567", "+2348031234567"],
  ])("Nigerian %j -> %j", (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  test.each([
    ["+44 7700 900123", "+447700900123"],
    ["0044 7700 900123", "+447700900123"],
    ["+1 (415) 555-2671", "+14155552671"],
    ["+233 24 123 4567", "+233241234567"],
  ])("international %j -> %j", (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  test.each(["", "12345", "abc", "0803123456", "+0123456789", "+12345", "+1234567890123456", "08031234567x"])(
    "rejects %j",
    (input) => {
      expect(normalisePhone(input)).toBeNull();
    },
  );
});

test("maskPhone shows only the last 4 digits", () => {
  expect(maskPhone("+2348031234567")).toBe("•••• 4567");
  expect(maskPhone("+2348031234567")).not.toContain("803");
});
