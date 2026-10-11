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

test("a shorter session can be asked for, but never one longer than 12 hours", () => {
  const t0 = Date.now();
  const short = makeStaffToken("staff-1", secret, t0, 4 * 3600);
  expect(readStaffToken(short, secret, t0 + 4 * 3600 * 1000 - 1000)).toBe("staff-1");
  expect(readStaffToken(short, secret, t0 + 4 * 3600 * 1000)).toBeNull();
  const long = makeStaffToken("staff-1", secret, t0, 72 * 3600);
  expect(readStaffToken(long, secret, t0 + STAFF_SESSION_SECONDS * 1000)).toBeNull();
  expect(readStaffToken(long, secret, t0 + (STAFF_SESSION_SECONDS - 1) * 1000)).toBe("staff-1");
  expect(readStaffToken(makeStaffToken("staff-1", secret, t0, -5), secret, t0)).toBe("staff-1"); // a nonsense length still gives a short valid session
});
