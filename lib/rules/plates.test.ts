import { describe, expect, test } from "vitest";
import { formatPlate, normalisePlate } from "./plates";

describe("normalisePlate", () => {
  test.each([
    ["PHC234AB", "PHC234AB"],
    ["phc 234 ab", "PHC234AB"],
    ["PHC-234-AB", "PHC234AB"],
    ["  abc123  ", "ABC123"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalisePlate(input)).toBe(expected);
  });
});

describe("formatPlate", () => {
  test("spaces a Nigerian plate", () => {
    expect(formatPlate("PHC234AB")).toBe("PHC 234 AB");
    expect(formatPlate("phc-234-ab")).toBe("PHC 234 AB");
  });

  test("shows other plates as stored", () => {
    expect(formatPlate("LAGOS1")).toBe("LAGOS1");
  });
});
