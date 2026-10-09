import { describe, expect, test } from "vitest";
import { makeStaffToken, readStaffToken, STAFF_SESSION_SECONDS } from "./staff-token";

const secret = "s".repeat(40);

describe("staff session token", () => {
  test("a fresh token gives back the staff id", () => {
    expect(readStaffToken(makeStaffToken("staff-1", secret), secret)).toBe("staff-1");
  });

  test("it expires after 12 hours", () => {
    const t0 = 1_000_000;
    const token = makeStaffToken("staff-1", secret, t0);
    expect(readStaffToken(token, secret, t0 + (STAFF_SESSION_SECONDS - 1) * 1000)).toBe("staff-1");
    expect(readStaffToken(token, secret, t0 + STAFF_SESSION_SECONDS * 1000)).toBeNull();
  });

  test("a forged or tampered token is refused", () => {
    const token = makeStaffToken("staff-1", secret);
    expect(readStaffToken(token, "z".repeat(40))).toBeNull();
    expect(readStaffToken(token.slice(0, -2) + "xx", secret)).toBeNull();
    expect(readStaffToken("garbage", secret)).toBeNull();
  });
});
