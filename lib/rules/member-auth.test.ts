import { beforeEach, describe, expect, test } from "vitest";
import { attemptMemberSignIn, LOCKED_FOREVER, PIN_PATTERN, type MemberAuthStore } from "./member-auth";

const MIN = 60_000;

class FakeStore implements MemberAuthStore {
  clock = new Date("2026-10-11T08:00:00Z").getTime();
  events: { key: string; t: number }[] = [];
  member = { id: "m1", pin_hash: "hash:1234" as string | null, locked_until: null as string | null };

  async getMemberByPhone(phone: string) {
    return phone === "+2348031234567" ? this.member : null;
  }
  async countFailures(key: string, windowMinutes: number) {
    return this.events.filter((e) => e.key === key && e.t > this.clock - windowMinutes * MIN).length;
  }
  async recordFailure(key: string) {
    this.events.push({ key, t: this.clock });
  }
  async clearFailures(key: string) {
    this.events = this.events.filter((e) => e.key !== key);
  }
  async lockMember() {
    this.member.locked_until = LOCKED_FOREVER;
  }
  async verifyPin(hash: string | null, pin: string) {
    return hash === `hash:${pin}`;
  }
  advance(minutes: number) {
    this.clock += minutes * MIN;
  }
}

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
});

const attempt = (pin: string, phone = "+2348031234567", ip = "ip:1") =>
  attemptMemberSignIn(store, {
    phone,
    pin,
    phoneKey: `phone:${phone}`,
    ipKey: ip,
    now: new Date(store.clock),
  });

describe("member PIN sign-in (T-4)", () => {
  test("the right PIN signs in", async () => {
    expect(await attempt("1234")).toEqual({ status: "ok", memberId: "m1" });
  });

  test("a wrong PIN is refused", async () => {
    expect(await attempt("0000")).toEqual({ status: "wrong" });
  });

  test("an unknown phone number looks the same as a wrong PIN", async () => {
    expect(await attempt("1234", "+2348030000000")).toEqual({ status: "wrong" });
  });

  test("a member with no PIN can never sign in, whatever is typed, including the PIN the unknown-phone check uses", async () => {
    store.member.pin_hash = null;
    // The real store compares an unknown phone against a dummy hash of "0000"; that must not let this member in
    store.verifyPin = async (hash, pin) => (hash ?? "hash:0000") === `hash:${pin}`;
    for (const pin of ["0000", "1234", "9999"]) expect((await attempt(pin)).status).not.toBe("ok");
  });

  test("5 failures pause sign-in, even for the correct PIN, for 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect((await attempt("0000")).status).toBe("wrong");
    expect((await attempt("1234")).status).toBe("paused");
    store.advance(14);
    expect((await attempt("1234")).status).toBe("paused");
    store.advance(2);
    expect(await attempt("1234")).toEqual({ status: "ok", memberId: "m1" });
  });

  test("15 failures in a day lock the account until an admin resets it", async () => {
    for (let i = 0; i < 14; i++) {
      expect((await attempt("0000")).status).toBe("wrong");
      store.advance(16); // let each pause end
    }
    expect((await attempt("0000")).status).toBe("locked");
    expect(store.member.locked_until).toBe(LOCKED_FOREVER);
    store.advance(16);
    expect((await attempt("1234")).status).toBe("locked");
    store.advance(60 * 24 * 7); // a week later it is still locked
    expect((await attempt("1234")).status).toBe("locked");
  });

  test("one IP address is paused after too many failures across accounts", async () => {
    for (let i = 0; i < 30; i++) await attempt("0000", `+23480300000${String(i).padStart(2, "0")}`);
    expect((await attempt("1234")).status).toBe("paused");
    expect((await attempt("1234", "+2348031234567", "ip:other")).status).toBe("ok");
  });

  test("a good sign-in clears earlier failures", async () => {
    for (let i = 0; i < 4; i++) await attempt("0000");
    await attempt("1234");
    for (let i = 0; i < 4; i++) expect((await attempt("0000")).status).toBe("wrong");
  });
});

test("PINs are exactly 4 digits", () => {
  expect(PIN_PATTERN.test("1234")).toBe(true);
  for (const bad of ["123", "12345", "12a4", "", " 123"]) expect(PIN_PATTERN.test(bad)).toBe(false);
});
