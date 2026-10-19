import { describe, expect, test } from "vitest";
import { isLongSession, longSessionCutoff, longSessionLabel } from "./long-session";

const now = new Date("2026-10-18T20:00:00Z");

describe("isLongSession", () => {
  test("an open visit is long from exactly the set number of hours", () => {
    expect(isLongSession({ status: "parked", checkedInAt: "2026-10-18T08:00:00Z" }, now, 12)).toBe(true);
    expect(isLongSession({ status: "parked", checkedInAt: "2026-10-18T07:59:00Z" }, now, 12)).toBe(true);
    expect(isLongSession({ status: "parked", checkedInAt: "2026-10-18T08:01:00Z" }, now, 12)).toBe(false);
  });
  test("follows the hours that are set", () => {
    expect(isLongSession({ status: "parked", checkedInAt: "2026-10-18T14:00:00Z" }, now, 6)).toBe(true);
    expect(isLongSession({ status: "parked", checkedInAt: "2026-10-18T14:00:00Z" }, now, 12)).toBe(false);
  });
  test("a visit that is not open is never flagged, however old", () => {
    for (const status of ["released", "missed"]) expect(isLongSession({ status, checkedInAt: "2020-01-01T00:00:00Z" }, now, 12)).toBe(false);
  });
  test("an unreadable time is not flagged", () => {
    expect(isLongSession({ status: "parked", checkedInAt: "not a time" }, now, 12)).toBe(false);
  });
});

test("the label and the cutoff follow the hours", () => {
  expect(longSessionLabel(12)).toBe("Open 12h+");
  expect(longSessionCutoff(now, 12)).toBe("2026-10-18T08:00:00.000Z");
});
