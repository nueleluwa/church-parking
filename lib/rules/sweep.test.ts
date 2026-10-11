import { describe, expect, test } from "vitest";
import {
  SWEEP_DELAY_MINUTES,
  describeBulk,
  elapsedMinutes,
  elapsedText,
  filterOnSite,
  isOverstaying,
  longerThanService,
  markedStillHere,
  serviceLength,
  serviceTimes,
  sortOnSite,
  sweepCandidates,
  sweepStatus,
  sweepSummary,
  type OnSiteVisit,
  type SweepFilter,
} from "./sweep";

// Lagos is UTC+1. Service 1 is 07:30–09:30 on 2026-10-11 (a Sunday).
const car = (over: Partial<OnSiteVisit> = {}): OnSiteVisit => ({
  id: "v1",
  plate: "AAA111AA",
  make: null,
  colour: null,
  member: false,
  serviceId: 1,
  serviceName: "Service 1",
  serviceStart: "07:30:00",
  serviceEnd: "09:30:00",
  serviceDate: "2026-10-11",
  areaId: 1,
  areaName: "Car Park 1",
  areaSlug: "cp1",
  checkedInAt: "2026-10-11T06:45:00Z", // 07:45 Lagos
  held: false,
  stillHereIn: [],
  ...over,
});
const at = (hhmmLagos: string, date = "2026-10-11") => Date.parse(`${date}T${hhmmLagos}:00+01:00`);
const none: SweepFilter = { areaSlug: "", serviceId: null, timing: "", status: "", plate: "" };

describe("overstaying: 30 minutes after the service ends", () => {
  test("the boundary", () => {
    expect(SWEEP_DELAY_MINUTES).toBe(30);
    expect(isOverstaying(car(), at("09:59"))).toBe(false);
    expect(isOverstaying(car(), at("10:00"))).toBe(true);
    expect(isOverstaying(car(), at("10:01"))).toBe(true);
    expect(isOverstaying(car(), at("07:46"))).toBe(false); // in the middle of the service
  });
  test("a car from an earlier day is overstaying", () => {
    expect(isOverstaying(car({ serviceDate: "2026-10-10" }), at("08:00"))).toBe(true);
  });
  test("a service that runs to the end of the day is not overdue until after midnight", () => {
    const allDay = car({ serviceStart: "00:00:00", serviceEnd: "23:59:00" });
    expect(isOverstaying(allDay, at("23:58"))).toBe(false);
    expect(isOverstaying(allDay, at("00:28", "2026-10-12"))).toBe(false);
    expect(isOverstaying(allDay, at("00:29", "2026-10-12"))).toBe(true);
  });
  test("the status word", () => {
    expect(sweepStatus(car(), at("09:00"))).toBe("on-site");
    expect(sweepStatus(car(), at("10:30"))).toBe("overstaying");
  });
});

describe("durations and the service schedule", () => {
  test("elapsed time is from the real check-in, never negative", () => {
    expect(elapsedMinutes(car(), at("09:03"))).toBe(78);
    expect(elapsedMinutes(car(), at("07:00"))).toBe(0);
    expect(elapsedText(78)).toBe("1h 18m");
    expect(elapsedText(10)).toBe("10m");
    expect(elapsedText(0)).toBe("Under 1m");
  });
  test("longer than its service is measured against that service's own length", () => {
    expect(serviceLength(car())).toBe(120);
    expect(serviceTimes(car())).toBe("07:30 – 09:30");
    expect(longerThanService(car(), at("09:45"))).toBe(false); // 2h exactly
    expect(longerThanService(car(), at("09:46"))).toBe(true);
    expect(longerThanService(car({ serviceStart: "07:30:00", serviceEnd: "08:30:00" }), at("08:46"))).toBe(true); // a 1-hour service
  });
});

describe("filtering", () => {
  const rows = [
    car({ id: "a", plate: "AAA111AA" }),
    car({ id: "b", plate: "BBB222BB", serviceId: 2, serviceName: "Service 2", serviceStart: "09:30:00", serviceEnd: "11:30:00", areaId: 2, areaName: "Roadside", areaSlug: "road", checkedInAt: "2026-10-11T08:40:00Z" }),
    car({ id: "c", plate: "CCC333CC", stillHereIn: [1] }),
  ];
  const now = at("10:15");
  test("by parking area, service and plate (look-alikes match)", () => {
    expect(filterOnSite(rows, { ...none, areaSlug: "road" }, now).map((r) => r.id)).toEqual(["b"]);
    expect(filterOnSite(rows, { ...none, serviceId: 1 }, now).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterOnSite(rows, { ...none, plate: "BBB222" }, now).map((r) => r.id)).toEqual(["b"]);
    expect(filterOnSite(rows, { ...none, plate: "CCC333CC".replace("3", "E") }, now)).toEqual([]);
    expect(filterOnSite([car({ plate: "AB0123" })], { ...none, plate: "ABO123" }, now)).toHaveLength(1);
  });
  test("by status: on site, overstaying, and marked still here", () => {
    expect(filterOnSite(rows, { ...none, status: "overstaying" }, now).map((r) => r.id)).toEqual(["a", "c"]); // Service 1 ended 09:30
    expect(filterOnSite(rows, { ...none, status: "onsite" }, now).map((r) => r.id)).toEqual(["b"]);
    expect(filterOnSite(rows, { ...none, status: "stillhere" }, now).map((r) => r.id)).toEqual(["c"]);
  });
  test("by timing: within its service or longer", () => {
    expect(filterOnSite(rows, { ...none, timing: "longer" }, now).map((r) => r.id)).toEqual(["a", "c"]); // 2h30 against a 2h service
    expect(filterOnSite(rows, { ...none, timing: "within" }, now).map((r) => r.id)).toEqual(["b"]);
  });
  test("a marked car is marked only for its own service unless another sweep is named", () => {
    expect(markedStillHere(rows[2])).toBe(true);
    expect(markedStillHere(rows[2], 2)).toBe(false);
    expect(markedStillHere(rows[0])).toBe(false);
  });
});

describe("sorting", () => {
  const rows = [
    car({ id: "late", plate: "LLL111LL", checkedInAt: "2026-10-11T08:00:00Z", areaName: "Roadside" }),
    car({ id: "early", plate: "EEE111EE", checkedInAt: "2026-10-11T06:30:00Z", areaName: "Car Park 2" }),
    car({ id: "mid", plate: "MMM111MM", checkedInAt: "2026-10-11T07:00:00Z", areaName: "Car Park 1" }),
  ];
  test("by the real check-in time, oldest or newest first, or by parking area", () => {
    expect(sortOnSite(rows, "oldest").map((r) => r.id)).toEqual(["early", "mid", "late"]);
    expect(sortOnSite(rows, "newest").map((r) => r.id)).toEqual(["late", "mid", "early"]);
    expect(sortOnSite(rows, "area").map((r) => r.id)).toEqual(["mid", "early", "late"]);
  });
  test("sorting does not change the list it is given", () => {
    const copy = [...rows];
    sortOnSite(rows, "newest");
    expect(rows).toEqual(copy);
  });
});

describe("the end-of-service sweep", () => {
  const rows = [
    car({ id: "s1", plate: "AAA111AA" }),
    car({ id: "s2", plate: "BBB222BB", serviceId: 2, serviceStart: "09:30:00", serviceEnd: "11:30:00" }),
    car({ id: "s1done", plate: "CCC333CC", stillHereIn: [1] }),
  ];
  test("looks at cars from that service or an earlier one, not yet marked in that sweep", () => {
    expect(sweepCandidates(rows, { id: 1, startsAt: "07:30:00" }).map((r) => r.id)).toEqual(["s1"]);
    expect(sweepCandidates(rows, { id: 2, startsAt: "09:30:00" }).map((r) => r.id)).toEqual(["s1", "s2", "s1done"]);
  });
});

describe("the summary", () => {
  test("cars are counted once each, by plate, and overstaying only after the delay", () => {
    const rows = [car({ id: "1" }), car({ id: "2" }), car({ id: "3", plate: "BBB222BB", serviceId: 2, serviceStart: "09:30:00", serviceEnd: "11:30:00" })];
    expect(sweepSummary(rows, at("10:15"))).toEqual({ onSite: 2, overstaying: 1 });
    expect(sweepSummary([], at("10:15"))).toEqual({ onSite: 0, overstaying: 0 });
  });
});

describe("bulk results", () => {
  test("say exactly what happened, including partial failures", () => {
    expect(describeBulk([])).toEqual({ ok: false, message: "No cars were selected." });
    expect(describeBulk([{ visitId: "a", ok: true }])).toEqual({ ok: true, message: "1 car marked Still here." });
    expect(describeBulk([{ visitId: "a", ok: true }, { visitId: "b", ok: true }]).message).toBe("2 cars marked Still here.");
    const partial = describeBulk([
      { visitId: "a", ok: true },
      { visitId: "b", ok: false, message: "already released or closed" },
      { visitId: "c", ok: false, message: "already released or closed" },
    ]);
    expect(partial.ok).toBe(false);
    expect(partial.message).toBe("1 of 3 cars marked Still here. 2 could not be marked (already released or closed).");
    expect(describeBulk([{ visitId: "a", ok: false, message: "not found" }]).message).toBe("No cars were marked. not found");
  });
});
