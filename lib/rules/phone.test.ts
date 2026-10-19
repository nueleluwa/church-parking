import { describe, expect, test } from "vitest";
import { formatLocalPhone, localPhone, maskPhone, normalisePhone, toLocalPhone } from "./phone";

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

describe("toLocalPhone", () => {
  test("turns a stored Nigerian number into the 11-digit local form", () => {
    expect(toLocalPhone("+2348031234567")).toBe("08031234567");
  });
  test.each(["+447700900123", "+23481234567", "+23480312345678", "08031234567", ""])("has no local form for %j", (input) => {
    expect(toLocalPhone(input)).toBeNull();
  });
});

describe("localPhone (what a member types at check-in)", () => {
  test.each([
    ["08031234567", "08031234567"],
    ["0803 123 4567", "08031234567"],
    ["0803-123-4567", "08031234567"],
    ["+234 803 123 4567", "08031234567"],
    ["2348031234567", "08031234567"],
    ["002348031234567", "08031234567"],
  ])("%j -> %j", (input, expected) => {
    expect(localPhone(input)).toBe(expected);
  });
  test.each(["", "12345", "abc", "0803123456", "+44 7700 900123", "08031234567x"])("rejects %j", (input) => {
    expect(localPhone(input)).toBeNull();
  });
  test("agrees with the stored form, so one number never has two spellings", () => {
    for (const typed of ["08031234567", "+2348031234567", "2348031234567"]) {
      expect(toLocalPhone(normalisePhone(typed)!)).toBe(localPhone(typed));
    }
  });
});

describe("formatLocalPhone", () => {
  test("groups 11 digits for reading", () => {
    expect(formatLocalPhone("08031234567")).toBe("0803 123 4567");
  });
});

test("maskPhone shows only the last 4 digits", () => {
  expect(maskPhone("+2348031234567")).toBe("•••• 4567");
  expect(maskPhone("+2348031234567")).not.toContain("803");
});
