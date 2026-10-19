import { describe, expect, test } from "vitest";
import { parseSignScan } from "./sign-scan";

const HOST = "churchparking.online";
const TOKEN = "abcdefghijklmnopqrstuv"; // 22 characters

describe("parseSignScan", () => {
  test("a car park sign opens that car park", () => {
    expect(parseSignScan("https://churchparking.online/c/cp1", HOST)).toEqual({ kind: "sign", slug: "cp1" });
    expect(parseSignScan("  https://churchparking.online/c/road/ ", HOST)).toEqual({ kind: "sign", slug: "road" });
    expect(parseSignScan("https://www.churchparking.online/c/dominos", HOST)).toEqual({ kind: "sign", slug: "dominos" });
  });

  test("an exit sign opens check-out for that car park, and only on our own addresses", () => {
    expect(parseSignScan("https://churchparking.online/c/cp1/out", HOST)).toEqual({ kind: "exit", slug: "cp1" });
    expect(parseSignScan("https://churchparking.online/c/cp1/out/", HOST)).toEqual({ kind: "exit", slug: "cp1" });
    expect(parseSignScan("https://evil.example/c/cp1/out", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://churchparking.online/c/cp1/outside", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://churchparking.online/c/cp1/out/extra", HOST)).toEqual({ kind: "other" });
  });

  test("a parking pass is recognised as a pass, not a sign", () => {
    expect(parseSignScan(`https://churchparking.online/p/${TOKEN}`, HOST)).toEqual({ kind: "pass", token: TOKEN });
  });

  test("the address this page is on counts too, for testing", () => {
    expect(parseSignScan("http://localhost:3457/c/cp2", "localhost:3457")).toEqual({ kind: "sign", slug: "cp2" });
  });

  test("another website is never followed, even with a car park path", () => {
    expect(parseSignScan("https://evil.example/c/cp1", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://churchparking.online.evil.example/c/cp1", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://evil.example/?next=https://churchparking.online/c/cp1", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://user@evil.example/c/cp1", HOST)).toEqual({ kind: "other" });
  });

  test("things that are not web addresses, or not ours, are ignored", () => {
    expect(parseSignScan("javascript:alert(1)", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("data:text/html,hello", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("cp1", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan(`${TOKEN}`, HOST)).toEqual({ kind: "other" });
  });

  test("only well-formed car park names and tokens count", () => {
    expect(parseSignScan("https://churchparking.online/c/CP1", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://churchparking.online/c/../admin", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://churchparking.online/c/cp1/extra", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://churchparking.online/p/short", HOST)).toEqual({ kind: "other" });
    expect(parseSignScan("https://churchparking.online/staff/scan", HOST)).toEqual({ kind: "other" });
  });
});
