import { describe, expect, test } from "vitest";
import { makePassToken, makeReference } from "./tokens";

describe("makeReference", () => {
  test("looks like PK-XXXX and avoids look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      expect(makeReference()).toMatch(/^PK-[2-9A-HJ-NP-Z]{4}$/);
    }
  });
});

describe("makePassToken", () => {
  test("is 128 bits in base64url (22 characters)", () => {
    expect(makePassToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  test("is different every time", () => {
    const tokens = new Set(Array.from({ length: 1000 }, makePassToken));
    expect(tokens.size).toBe(1000);
  });
});
