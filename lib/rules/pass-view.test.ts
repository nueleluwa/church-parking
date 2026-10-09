import { describe, expect, test } from "vitest";
import { buildPassView, passState, type PassViewInput } from "./pass-view";

const base: PassViewInput = {
  plate: "PHC234AB",
  status: "parked",
  reference: "PK-7Q4M",
  areaName: "Car Park 1",
  serviceName: "Service 1",
  serviceDate: "2026-10-11",
  today: "2026-10-11",
  make: "Toyota Corolla",
  colour: "Silver",
  checkedInAt: "2026-10-11T08:12:00Z",
};

describe("buildPassView", () => {
  test("the public view shows only plate and state, with no name, phone or token", () => {
    const view = buildPassView(base, false);
    expect(view).toEqual({ kind: "public", plate: "PHC234AB", state: "valid" });
    expect(JSON.stringify(view)).not.toMatch(/name|phone|token|PK-|Toyota|Silver|2026-10-11T/i);
  });

  test("the holder also sees reference, area and service", () => {
    const view = buildPassView(base, true);
    expect(view).toMatchObject({
      kind: "owner",
      reference: "PK-7Q4M",
      areaName: "Car Park 1",
      make: "Toyota Corolla",
      colour: "Silver",
      checkedInAt: "2026-10-11T08:12:00Z",
    });
    expect(JSON.stringify(view)).not.toMatch(/phone|token/i);
  });
});

describe("passState (R-7)", () => {
  test("valid on the day it was issued", () => {
    expect(passState(base)).toBe("valid");
  });
  test("a pass from yesterday is expired", () => {
    expect(passState({ ...base, serviceDate: "2026-10-10" })).toBe("expired");
  });
  test("released and missed passes keep their state", () => {
    expect(passState({ ...base, status: "released" })).toBe("released");
    expect(passState({ ...base, status: "missed" })).toBe("missed");
  });
});
