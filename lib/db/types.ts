export type StaffRole = "attendant" | "coordinator" | "admin";
export type VisitStatus = "parked" | "released" | "missed";
export type ReleaseMethod = "scan" | "search" | "sweep" | "midnight";

export type Area = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  sort: number;
};

export type Service = {
  id: number;
  name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
};

export type Vehicle = {
  id: string;
  plate: string;
  colour: string | null;
  make: string | null;
};

export type Member = {
  id: string;
  full_name: string;
  phone: string;
  pin_hash: string;
  failed_pins: number;
  locked_until: string | null;
  created_at: string;
  last_seen_at: string | null;
  /** False: switched off by an admin. Cannot sign in or start a check-in; history stays. */
  active: boolean;
};

export type Guest = {
  id: string;
  full_name: string;
  phone: string;
  member_id: string | null;
  created_at: string;
};

export type Staff = {
  id: string;
  full_name: string;
  phone: string;
  password_hash: string;
  role: StaffRole;
  active: boolean;
  created_at: string;
};

export type Visit = {
  id: string;
  reference: string;
  pass_token: string;
  vehicle_id: string;
  member_id: string | null;
  guest_id: string | null;
  service_id: number;
  area_id: number;
  service_date: string;
  status: VisitStatus;
  checked_in_at: string;
  checked_in_by: string | null;
  released_at: string | null;
  released_by: string | null;
  release_method: ReleaseMethod | null;
};
