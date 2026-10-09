export type StaffRole = "attendant" | "coordinator" | "admin";

const RANK: Record<StaffRole, number> = { attendant: 1, coordinator: 2, admin: 3 };

/** A coordinator can do everything an attendant can, and an admin everything below. */
export function hasRole(role: StaffRole, minimum: StaffRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export type StaffContext = { id: string; role: StaffRole };
