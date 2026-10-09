/** A member can save at most this many cars. Stops one account collecting other people's plates. */
export const MAX_MEMBER_VEHICLES = 4;

/** A saved car counts as "new" for this many days, so attendants check the driver more carefully. */
export const NEW_CAR_DAYS = 7;

export function canAddVehicle(currentCount: number): boolean {
  return currentCount < MAX_MEMBER_VEHICLES;
}

export function isNewCar(addedAt: string | null, now: Date): boolean {
  if (!addedAt) return false;
  return now.getTime() - new Date(addedAt).getTime() < NEW_CAR_DAYS * 24 * 60 * 60 * 1000;
}
