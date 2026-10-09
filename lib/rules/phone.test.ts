import { describe, expect, test } from "vitest";
import { maskPhone, normalisePhone } from "./phone";

describe("normalisePhone", () => {
  test.each([
    ["08031234567", "+2348031234567"],
    ["0803 123 4567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    ["0803-123-4567", "+2348031234567"],
  ])("%j -> %j", (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  test.each(["", "12345", "abc", "0803123456", "+44 7700 900123"])("rejects %j", (input) => {
    expect(normalisePhone(input)).toBeNull();
  });
});

test("maskPhone shows only the last 4 digits", () => {
  expect(maskPhone("+2348031234567")).toBe("•••• 4567");
  expect(maskPhone("+2348031234567")).not.toContain("803");
});
