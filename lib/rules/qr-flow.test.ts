import { describe, expect, test } from "vitest";
import { parseQrAreas, qrFlowEnabled } from "./qr-flow";

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

describe("parseQrAreas", () => {
  test("reads a comma list and drops anything that is not a car park address", () => {
    expect(parseQrAreas("cp1, Road ,,cp1,bad one,x/y")).toEqual(["cp1", "road"]);
    expect(parseQrAreas("")).toEqual([]);
  });
});
