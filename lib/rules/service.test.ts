import { describe, expect, test } from "vitest";
import { lagosDate, pickService, type ServiceWindow } from "./service";

const services: (ServiceWindow & { name: string })[] = [
  { id: 1, name: "Service 1", weekday: 0, starts_at: "07:30:00", ends_at: "09:30:00" },
  { id: 2, name: "Service 2", weekday: 0, starts_at: "09:30:00", ends_at: "11:30:00" },
  { id: 3, name: "Service 3", weekday: 0, starts_at: "11:30:00", ends_at: "13:30:00" },
];

// Africa/Lagos is UTC+1 all year, so 08:45 in Lagos is 07:45Z.
// 11 October 2026 is a Sunday.
const sunday = (lagos: string) => new Date(`2026-10-11T${lagos}:00+01:00`);

describe("pickService (R-1)", () => {
  test.each([
    ["07:00", "Service 1"], // starts in 30 minutes
    ["08:45", "Service 1"], // Service 2 is 45 minutes away, so Service 1 is in progress
    ["09:05", "Service 2"], // Service 2 starts in 25 minutes
    ["11:29", "Service 3"], // Service 3 starts in 1 minute
  ])("Sunday %s gives %s", (time, name) => {
    expect(pickService(sunday(time), services)?.name).toBe(name);
  });

  test("picks the next service that day when none is close or running", () => {
    expect(pickService(sunday("06:00"), services)?.name).toBe("Service 1");
  });

  test("Sunday 13:45 has no service left", () => {
    expect(pickService(sunday("13:45"), services)).toBeNull();
  });

  test("a weekday has no service", () => {
    expect(pickService(new Date("2026-10-12T08:45:00+01:00"), services)).toBeNull();
  });

  test("uses Lagos time, not UTC", () => {
    // 23:45Z on Saturday is 00:45 Sunday in Lagos: nothing is running yet,
    // so the first service of the day is chosen.
    expect(pickService(new Date("2026-10-10T23:45:00Z"), services)?.name).toBe("Service 1");
  });
});

describe("lagosDate", () => {
  test("rolls over at midnight Lagos time", () => {
    expect(lagosDate(new Date("2026-10-10T22:59:00Z"))).toBe("2026-10-10");
    expect(lagosDate(new Date("2026-10-10T23:00:00Z"))).toBe("2026-10-11");
  });
});
