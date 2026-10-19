import { describe, expect, test } from "vitest";
import { hashCredential, looksLikeCredential, makeCredential } from "./credential";

describe("makeCredential", () => {
  test("is 256 random bits, URL-safe, and never the same twice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const { token } = makeCredential();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      seen.add(token);
    }
    expect(seen.size).toBe(500);
  });

  test("gives a hash that matches the token and does not contain it", () => {
    const { token, hash } = makeCredential();
    expect(hash).toBe(hashCredential(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hash).not.toBe(token);
  });

  test("a different token has a different hash", () => {
    expect(makeCredential().hash).not.toBe(makeCredential().hash);
  });
});

test("hashCredential is a plain SHA-256 (known value)", () => {
  expect(hashCredential("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

describe("looksLikeCredential", () => {
  test("accepts what makeCredential produces", () => {
    expect(looksLikeCredential(makeCredential().token)).toBe(true);
  });
  test.each([undefined, null, 42, "", "short", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}!`, `${"a".repeat(42)} `])("rejects %j", (v) => {
    expect(looksLikeCredential(v)).toBe(false);
  });
});
