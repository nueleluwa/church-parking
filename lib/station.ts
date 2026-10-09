import { cookies } from "next/headers";
import { listActiveAreas } from "@/lib/db";

import { STATION_COOKIE, type CarParkOption } from "@/lib/rules/station";

export type StationContext = { areas: CarParkOption[]; station: string | null };

/**
 * Each car park has its own exit, so an attendant says once which car park they are standing at, and the app
 * remembers it on that phone. It is only a preference that makes the scan screen helpful (it warns about a car
 * that checked in elsewhere), so the browser saves it itself, instantly, and it is not signed: it is checked
 * against the open car parks every time it is read.
 */
export async function stationContext(): Promise<StationContext> {
  const [areas, store] = await Promise.all([listActiveAreas(), cookies()]);
  const value = store.get(STATION_COOKIE)?.value;
  return {
    areas: areas.map(({ id, name, slug }) => ({ id, name, slug })),
    station: areas.some((a) => a.slug === value) ? (value as string) : null,
  };
}

