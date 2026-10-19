/**
 * A visit that has been open for a long time (SRS section 11: 12 hours by default, set in app_settings). It is only flagged in
 * the admin and staff views, so someone looks at it. Nothing is ever closed because of it.
 */
export function isLongSession(visit: { status: string; checkedInAt: string }, now: Date, hours: number): boolean {
  if (visit.status !== "parked") return false;
  const started = Date.parse(visit.checkedInAt);
  if (Number.isNaN(started)) return false;
  return now.getTime() - started >= hours * 3_600_000;
}

/** The words on the flag, for example "Open 12h+". */
export function longSessionLabel(hours: number): string {
  return `Open ${hours}h+`;
}

/** The moment before which a visit checked in counts as long: now minus the hours. */
export function longSessionCutoff(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}
