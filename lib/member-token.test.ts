import { describe, expect, test } from "vitest";
import { makeMemberToken, MEMBER_SESSION_SECONDS, readMemberToken } from "./member-token";
import { makeStaffToken, readStaffToken } from "./staff-token";

const secret = "m".repeat(40);

describe("member session token", () => {
  test("round-trips and lasts 180 days", () => {
    const t0 = 5_000_000;
    const token = makeMemberToken("member-1", secret, t0);
    expect(readMemberToken(token, secret, t0 + (MEMBER_SESSION_SECONDS - 1) * 1000)).toBe("member-1");
    expect(readMemberToken(token, secret, t0 + MEMBER_SESSION_SECONDS * 1000)).toBeNull();
    expect(MEMBER_SESSION_SECONDS).toBe(180 * 24 * 3600);
  });

  test("a staff token is not a member token, and the other way round", () => {
    expect(readMemberToken(makeStaffToken("s1", secret), secret)).toBeNull();
    expect(readStaffToken(makeMemberToken("m1", secret), secret)).toBeNull();
  });

  test("a forged token is refused", () => {
    expect(readMemberToken(makeMemberToken("m1", secret), "x".repeat(40))).toBeNull();
  });
});
