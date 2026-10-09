/** The car park an attendant says they are standing at: the name of its cookie, and what a car park looks like to the screens. */
export const STATION_COOKIE = "cp_station";
export const STATION_MAX_AGE_SECONDS = 12 * 60 * 60; // one shift, the same as a staff sign-in

export type CarParkOption = { id: number; name: string; slug: string };
