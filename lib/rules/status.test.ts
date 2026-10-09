import { describe, expect, test } from "vitest";
import { passTone, progressTone, visitTone } from "./status";

describe("status colours", () => {
  test("a valid pass is green and an expired one is red", () => {
    expect(passTone("valid")).toBe("success");
    expect(passTone("expired")).toBe("danger");
  });

  test("a released or closed pass is finished, so neutral", () => {
    expect(passTone("released")).toBe("neutral");
    expect(passTone("missed")).toBe("neutral");
  });

  test("a car still parked is green in the history, a finished visit is neutral", () => {
    expect(visitTone("parked")).toBe("success");
    expect(visitTone("released")).toBe("neutral");
    expect(visitTone("missed")).toBe("neutral");
  });

  test("failed and error are red, pending and processing are amber, done is green", () => {
    expect(progressTone("failed")).toBe("danger");
    expect(progressTone("error")).toBe("danger");
    expect(progressTone("pending")).toBe("warning");
    expect(progressTone("processing")).toBe("warning");
    expect(progressTone("done")).toBe("success");
  });

  test("no state maps to a missing colour", () => {
    for (const s of ["valid", "released", "missed", "expired"] as const) {
      expect(["success", "danger", "warning", "neutral"]).toContain(passTone(s));
    }
  });
});
