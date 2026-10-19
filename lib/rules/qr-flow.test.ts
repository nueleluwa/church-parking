import { describe, expect, test } from "vitest";
import { parseQrAreas, publicSignUpOpen, qrFlowEnabled, readQrFlow } from "./qr-flow";

describe("qrFlowEnabled", () => {
  test("off changes nothing for any car park", () => {
    expect(qrFlowEnabled({ mode: "off", areas: ["cp1"] }, "cp1")).toBe(false);
    expect(qrFlowEnabled({ mode: "off", areas: [] }, "road")).toBe(false);
  });
  test("pilot turns it on only for the listed car parks", () => {
    const cfg = { mode: "pilot" as const, areas: ["road"] };
    expect(qrFlowEnabled(cfg, "road")).toBe(true);
    expect(qrFlowEnabled(cfg, "ROAD")).toBe(true);
    expect(qrFlowEnabled(cfg, "cp1")).toBe(false);
    expect(qrFlowEnabled({ mode: "pilot", areas: [] }, "road")).toBe(false);
  });
  test("on turns it on for every car park", () => {
    expect(qrFlowEnabled({ mode: "on", areas: [] }, "cp2")).toBe(true);
  });
});

describe("publicSignUpOpen", () => {
  test("stays open while the original check-in is in use anywhere, closes when phone check-in is on everywhere", () => {
    expect(publicSignUpOpen({ mode: "off", areas: [] })).toBe(true);
    expect(publicSignUpOpen({ mode: "pilot", areas: ["road"] })).toBe(true);
    expect(publicSignUpOpen({ mode: "on", areas: [] })).toBe(false);
  });
});

describe("readQrFlow", () => {
  test("is off when nothing is set", () => {
    expect(readQrFlow({})).toEqual({ mode: "off", areas: [] });
  });
  test("reads the mode and the car parks", () => {
    expect(readQrFlow({ QR_SESSION_FLOW: "pilot", QR_SESSION_AREAS: "road, cp1" })).toEqual({ mode: "pilot", areas: ["road", "cp1"] });
    expect(readQrFlow({ QR_SESSION_FLOW: " ON " })).toEqual({ mode: "on", areas: [] });
  });
  test.each(["", "yes", "true", "1", "pilot,on", "enabled"])("an unrecognised mode %j means off", (v) => {
    expect(readQrFlow({ QR_SESSION_FLOW: v, QR_SESSION_AREAS: "cp1" }).mode).toBe("off");
  });
});

describe("parseQrAreas", () => {
  test("reads a comma list and drops anything that is not a car park address", () => {
    expect(parseQrAreas("cp1, Road ,,cp1,bad one,x/y")).toEqual(["cp1", "road"]);
    expect(parseQrAreas("")).toEqual([]);
  });
});
