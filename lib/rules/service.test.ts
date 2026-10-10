import { describe, expect, test } from "vitest";
import { hasServiceToday, lagosDate, pickService, servicesForCheckIn, serviceProgress, serviceStandings, type ServiceWindow } from "./service";

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

describe("servicesForCheckIn", () => {
  const names = (time: string) => servicesForCheckIn(sunday(time), services).map((s) => s.name);

  test("offers every service that has not finished", () => {
    expect(names("06:00")).toEqual(["Service 1", "Service 2", "Service 3"]);
    expect(names("09:45")).toEqual(["Service 2", "Service 3"]);
    expect(names("11:29")).toEqual(["Service 2", "Service 3"]);
    expect(names("13:29")).toEqual(["Service 3"]);
  });

  test("offers nothing after the last service ends, and on a weekday", () => {
    expect(names("13:30")).toEqual([]);
    expect(names("13:45")).toEqual([]);
    expect(servicesForCheckIn(new Date("2026-10-12T08:45:00+01:00"), services)).toEqual([]);
  });

  test("tells a finished Sunday from a day with no service", () => {
    expect(hasServiceToday(sunday("13:45"), services)).toBe(true);
    expect(hasServiceToday(new Date("2026-10-12T08:45:00+01:00"), services)).toBe(false);
  });
});

describe("serviceStandings", () => {
  const standing = (time: string) =>
    serviceStandings(sunday(time), services).map((s) => `${s.service.name}:${s.standing}`);

  test("one service is active while it runs, the one after is next", () => {
    expect(standing("08:45")).toEqual(["Service 1:active", "Service 2:next", "Service 3:later"]);
  });
  test("before the first service the first is next", () => {
    expect(standing("06:00")).toEqual(["Service 1:next", "Service 2:later", "Service 3:later"]);
  });
  test("finished services are marked, and the last one running has nothing next", () => {
    expect(standing("12:00")).toEqual(["Service 1:finished", "Service 2:finished", "Service 3:active"]);
  });
  test("after the last service everything is finished", () => {
    expect(standing("13:45")).toEqual(["Service 1:finished", "Service 2:finished", "Service 3:finished"]);
  });
  test("a day with no service has nothing to show", () => {
    expect(serviceStandings(new Date("2026-10-12T08:45:00+01:00"), services)).toEqual([]);
  });
});

describe("serviceProgress", () => {
  // Sunday 11 Oct 2026, Lagos is UTC+1
  const sunday = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 11, h - 1, m));
  const s = { weekday: 0, starts_at: "09:30:00", ends_at: "11:30:00", active: true };

  test("upcoming before it starts, active while it runs, completed after", () => {
    expect(serviceProgress(sunday(8), s)).toBe("upcoming");
    expect(serviceProgress(sunday(9, 30), s)).toBe("active");
    expect(serviceProgress(sunday(11, 29), s)).toBe("active");
    expect(serviceProgress(sunday(11, 30), s)).toBe("completed");
  });
  test("another weekday, and a service that is switched off", () => {
    expect(serviceProgress(new Date(Date.UTC(2026, 9, 12, 9)), s)).toBe("other-day");
    expect(serviceProgress(sunday(10), { ...s, active: false })).toBe("off");
  });
});
