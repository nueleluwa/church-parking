import { describe, expect, test } from "vitest";
import { hashKey, signValue, verifyValue } from "./session";

const secret = "x".repeat(40);

describe("signed values", () => {
  test("a signed value verifies", () => {
    expect(verifyValue(signValue("abc_DEF-123", secret), secret)).toBe("abc_DEF-123");
  });
  test("a tampered value or the wrong secret fails", () => {
    const signed = signValue("abc", secret);
    expect(verifyValue(signed.replace("abc", "abd"), secret)).toBeNull();
    expect(verifyValue(signed, "y".repeat(40))).toBeNull();
    expect(verifyValue("nodot", secret)).toBeNull();
  });
});

test("hashKey hides the input and is stable", () => {
  const k = hashKey("phone", "+2348031234567", secret);
  expect(k).toBe(hashKey("phone", "+2348031234567", secret));
  expect(k).not.toContain("803");
  expect(k.startsWith("phone:")).toBe(true);
});
