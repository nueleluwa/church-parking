import { describe, expect, test } from "vitest";
import { addRemembered, MAX_REMEMBERED_PASSES, ownsPass, parseRemembered, serialiseRemembered } from "./pass-tokens";

const t = (n: number) => `${String(n).padStart(2, "0")}AAAAAAAAAAAAAAAAAAAA`; // 22 characters

describe("the passes a phone remembers", () => {
  test("reads a list, and the single token older versions stored", () => {
    expect(parseRemembered(serialiseRemembered([t(1), t(2)]))).toEqual([t(1), t(2)]);
    expect(parseRemembered(t(7))).toEqual([t(7)]);
  });

  test("ignores empty, broken and unsafe values", () => {
    expect(parseRemembered(null)).toEqual([]);
    expect(parseRemembered("")).toEqual([]);
    expect(parseRemembered("[not json")).toEqual([]);
    expect(parseRemembered('{"a":1}')).toEqual([]);
    expect(parseRemembered(JSON.stringify([t(1), "short", 5, "../../etc/passwd", t(1)]))).toEqual([t(1)]);
  });

  test("a second car goes first and the first car is kept", () => {
    expect(addRemembered([t(1)], t(2))).toEqual([t(2), t(1)]);
  });

  test("the same pass is never listed twice, and only the newest few are kept", () => {
    expect(addRemembered([t(1), t(2)], t(1))).toEqual([t(1), t(2)]);
    let list: string[] = [];
    for (let i = 0; i < MAX_REMEMBERED_PASSES + 3; i++) list = addRemembered(list, t(i));
    expect(list).toHaveLength(MAX_REMEMBERED_PASSES);
    expect(list[0]).toBe(t(MAX_REMEMBERED_PASSES + 2));
  });

  test("something that is not a pass token is not added", () => {
    expect(addRemembered([t(1)], "nope")).toEqual([t(1)]);
  });
});

describe("who may see the full pass", () => {
  const base = { token: t(1), remembered: [] as string[], passMemberId: null as string | null, signedInMemberId: null as string | null };

  test("the phone that made it", () => {
    expect(ownsPass({ ...base, remembered: [t(3), t(1)] })).toBe(true);
  });
  test("a member signed in on another phone, for their own visit", () => {
    expect(ownsPass({ ...base, passMemberId: "m1", signedInMemberId: "m1" })).toBe(true);
  });
  test("not another member, not a guest pass, not someone who is signed out", () => {
    expect(ownsPass({ ...base, passMemberId: "m1", signedInMemberId: "m2" })).toBe(false);
    expect(ownsPass({ ...base, passMemberId: null, signedInMemberId: "m1" })).toBe(false);
    expect(ownsPass({ ...base, passMemberId: "m1", signedInMemberId: null })).toBe(false);
    expect(ownsPass({ ...base, remembered: [t(2)] })).toBe(false);
  });
});
