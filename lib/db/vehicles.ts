import { canAddVehicle } from "@/lib/rules/limits";
import { plateLikePattern } from "@/lib/rules/visit-list";
import type { Ownership, VehicleInput, VehicleStatus, VehicleType } from "@/lib/rules/vehicle-register";
import { db } from "./client";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

const UNIQUE_VIOLATION = "23505";

// ---------- The register (admin) ----------

export type VehicleFilter = { plate: string; type: VehicleType | null; owner: Ownership | null; status: VehicleStatus | null };

export type RegisterRow = {
  id: string;
  plate: string;
  make: string | null;
  colour: string | null;
  type: VehicleType | null;
  active: boolean;
  createdAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
};

type RawRow = {
  id: string;
  plate: string;
  make: string | null;
  colour: string | null;
  vehicle_type: VehicleType | null;
  active: boolean;
  created_at: string | null;
  member_vehicles: { member_id: string; members: { full_name: string } | null }[];
};

const COLUMNS = "id, plate, make, colour, vehicle_type, active, created_at";

/** A vehicle is a member vehicle when at least one member has saved it. The link is an embedded left join, filtered below. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function narrowed(query: any, f: VehicleFilter): any {
  let q = query;
  if (f.plate) q = q.like("plate", plateLikePattern(f.plate));
  if (f.type) q = q.eq("vehicle_type", f.type);
  if (f.status) q = q.eq("active", f.status === "active");
  if (f.owner === "guest") q = q.is("member_vehicles", null);
  return q;
}

/** One page of the register, newest registered first (records from before dates were kept come last), plus how many match in all. */
export async function searchRegister(f: VehicleFilter, page: number, size: number): Promise<{ rows: RegisterRow[]; total: number }> {
  const select = f.owner === "member" ? `${COLUMNS}, member_vehicles!inner(member_id, members(full_name))` : `${COLUMNS}, member_vehicles(member_id, members(full_name))`;
  const from = (page - 1) * size;
  const { data, error, count } = await narrowed(db().from("vehicles").select(select, { count: "exact" }), f)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("plate")
    .range(from, from + size - 1);
  if (error) fail(error.message);
  const rows = ((data ?? []) as unknown as RawRow[]).map((v) => ({
    id: v.id,
    plate: v.plate,
    make: v.make,
    colour: v.colour,
    type: v.vehicle_type,
    active: v.active,
    createdAt: v.created_at,
    ownerId: v.member_vehicles[0]?.member_id ?? null,
    ownerName: v.member_vehicles[0]?.members?.full_name ?? null,
  }));
  return { rows, total: count ?? 0 };
}

export type RegisterCounts = { total: number; activeMember: number; activeGuest: number; inactive: number };

/** Whole-register totals. They do not overlap: active member + active guest + inactive = total. */
export async function registerCounts(): Promise<RegisterCounts> {
  const all = { plate: "", type: null, owner: null, status: null } as VehicleFilter;
  const head = (f: VehicleFilter, owner: "member" | "any") =>
    narrowed(
      db()
        .from("vehicles")
        .select(owner === "member" ? "id, member_vehicles!inner(member_id)" : "id, member_vehicles(member_id)", { count: "exact", head: true }),
      f,
    ) as PromiseLike<{ count: number | null; error: { message: string } | null }>;
  const [total, member, guest, inactive] = await Promise.all([
    head(all, "any"),
    head({ ...all, status: "active" }, "member"),
    head({ ...all, status: "active", owner: "guest" }, "any"),
    head({ ...all, status: "inactive" }, "any"),
  ]);
  for (const r of [total, member, guest, inactive]) if (r.error) fail(r.error.message);
  return { total: total.count ?? 0, activeMember: member.count ?? 0, activeGuest: guest.count ?? 0, inactive: inactive.count ?? 0 };
}

// ---------- One vehicle in full ----------

export type VehicleVisit = {
  id: string;
  reference: string;
  serviceDate: string;
  checkedInAt: string;
  releasedAt: string | null;
  status: "parked" | "released" | "missed";
  areaName: string;
  serviceName: string;
  who: "Member" | "Guest";
};

export type VehicleHistoryEntry = { at: string; what: string; by: string | null; detail: string | null };

export type VehicleDetail = RegisterRow & {
  visitCount: number;
  openVisit: VehicleVisit | null;
  visits: VehicleVisit[];
  history: VehicleHistoryEntry[];
};

type VisitRaw = {
  id: string;
  reference: string;
  service_date: string;
  checked_in_at: string;
  released_at: string | null;
  status: "parked" | "released" | "missed";
  member_id: string | null;
  areas: { name: string } | null;
  services: { name: string } | null;
};

export async function getVehicleDetail(id: string): Promise<VehicleDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const found = await db().from("vehicles").select(`${COLUMNS}, member_vehicles(member_id, members(full_name))`).eq("id", id).maybeSingle();
  if (found.error) fail(found.error.message);
  if (!found.data) return null;
  const v = found.data as unknown as RawRow;

  const [visits, count, open, events] = await Promise.all([
    db()
      .from("visits")
      .select("id, reference, service_date, checked_in_at, released_at, status, member_id, areas(name), services(name)")
      .eq("vehicle_id", id)
      .order("checked_in_at", { ascending: false })
      .limit(10),
    db().from("visits").select("id", { count: "exact", head: true }).eq("vehicle_id", id),
    db()
      .from("visits")
      .select("id, reference, service_date, checked_in_at, released_at, status, member_id, areas(name), services(name)")
      .eq("vehicle_id", id)
      .eq("status", "parked")
      .maybeSingle(),
    db()
      .from("audit_events")
      .select("action, reason, created_at, after, staff:staff_id(full_name)")
      .like("action", "vehicle_%")
      .eq("after->>vehicle_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  for (const r of [visits, count, open, events]) if (r.error) fail(r.error.message);

  const visit = (r: VisitRaw): VehicleVisit => ({
    id: r.id,
    reference: r.reference,
    serviceDate: r.service_date,
    checkedInAt: r.checked_in_at,
    releasedAt: r.released_at,
    status: r.status,
    areaName: r.areas?.name ?? "",
    serviceName: r.services?.name ?? "",
    who: r.member_id ? "Member" : "Guest",
  });

  return {
    id: v.id,
    plate: v.plate,
    make: v.make,
    colour: v.colour,
    type: v.vehicle_type,
    active: v.active,
    createdAt: v.created_at,
    ownerId: v.member_vehicles[0]?.member_id ?? null,
    ownerName: v.member_vehicles[0]?.members?.full_name ?? null,
    visitCount: count.count ?? 0,
    openVisit: open.data ? visit(open.data as unknown as VisitRaw) : null,
    visits: ((visits.data ?? []) as unknown as VisitRaw[]).map(visit),
    history: ((events.data ?? []) as unknown as { action: string; reason: string | null; created_at: string; after: { summary?: string } | null; staff: { full_name: string } | null }[]).map(
      (e) => ({ at: e.created_at, what: e.action, by: e.staff?.full_name ?? null, detail: e.after?.summary ?? e.reason }),
    ),
  };
}

// ---------- Changing the register ----------

/** Members a vehicle can be linked to: by part of the name or the phone number. Admin screens only. */
export async function findMembersToLink(text: string): Promise<{ id: string; name: string; phoneEnd: string }[]> {
  const t = text.replace(/[%_,()]/g, " ").trim();
  if (t.length < 2) return [];
  const digits = t.replace(/\D/g, "");
  const query = db().from("members").select("id, full_name, phone").order("full_name").limit(8);
  const { data, error } = await (digits.length >= 4 && digits.length === t.replace(/[\s+]/g, "").length ? query.like("phone", `%${digits.slice(-9)}`) : query.ilike("full_name", `%${t}%`));
  if (error) fail(error.message);
  return ((data ?? []) as { id: string; full_name: string; phone: string }[]).map((m) => ({ id: m.id, name: m.full_name, phoneEnd: m.phone.slice(-4) }));
}

export type CreateVehicleResult =
  | { status: "ok"; id: string }
  | { status: "duplicate" }
  | { status: "no_member" }
  | { status: "too_many" };

async function memberExists(id: string): Promise<boolean> {
  const { data, error } = await db().from("members").select("id").eq("id", id).maybeSingle();
  if (error) fail(error.message);
  return Boolean(data);
}

async function savedCount(memberId: string): Promise<number> {
  const { count, error } = await db().from("member_vehicles").select("vehicle_id", { count: "exact", head: true }).eq("member_id", memberId);
  if (error) fail(error.message);
  return count ?? 0;
}

/** Register a vehicle. A plate that is already in the register (as anyone's vehicle) is refused: no duplicates. */
export async function createVehicle(v: VehicleInput): Promise<CreateVehicleResult> {
  if (v.ownership === "member") {
    if (!v.memberId || !(await memberExists(v.memberId))) return { status: "no_member" };
    if (!canAddVehicle(await savedCount(v.memberId))) return { status: "too_many" };
  }
  const made = await db()
    .from("vehicles")
    .insert({ plate: v.plate, make: v.make, colour: v.colour, vehicle_type: v.type, active: v.active })
    .select("id")
    .single();
  if (made.error?.code === UNIQUE_VIOLATION) return { status: "duplicate" };
  if (made.error || !made.data) fail(made.error?.message ?? "no vehicle");
  const id = made.data.id as string;
  if (v.ownership === "member" && v.memberId) {
    const link = await db().from("member_vehicles").insert({ member_id: v.memberId, vehicle_id: id });
    if (link.error) {
      await db().from("vehicles").delete().eq("id", id); // nothing was recorded against it yet
      fail(link.error.message);
    }
  }
  return { status: "ok", id };
}

export type StoredVehicle = { id: string; plate: string; type: VehicleType | null; make: string | null; colour: string | null; active: boolean; ownerId: string | null };

export async function getStoredVehicle(id: string): Promise<StoredVehicle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("vehicles").select(`${COLUMNS}, member_vehicles(member_id)`).eq("id", id).maybeSingle();
  if (error) fail(error.message);
  if (!data) return null;
  const v = data as unknown as RawRow;
  return { id: v.id, plate: v.plate, type: v.vehicle_type, make: v.make, colour: v.colour, active: v.active, ownerId: v.member_vehicles[0]?.member_id ?? null };
}

export type UpdateVehicleResult = { status: "ok" } | { status: "not_found" } | { status: "no_member" } | { status: "too_many" } | { status: "in_use" };

/**
 * Change a vehicle's details, status and owner. Visits are never rewritten: every visit keeps the member or guest it was
 * made for. Changing the owner while the car has an open visit is refused (it would move a live pass between people).
 */
export async function updateVehicle(id: string, v: Omit<VehicleInput, "plate">): Promise<UpdateVehicleResult> {
  const before = await getStoredVehicle(id);
  if (!before) return { status: "not_found" };

  const newOwner = v.ownership === "member" ? v.memberId : null;
  if (newOwner !== before.ownerId) {
    const open = await db().from("visits").select("id", { count: "exact", head: true }).eq("vehicle_id", id).eq("status", "parked");
    if (open.error) fail(open.error.message);
    if ((open.count ?? 0) > 0) return { status: "in_use" };
    if (newOwner) {
      if (!(await memberExists(newOwner))) return { status: "no_member" };
      if (!canAddVehicle(await savedCount(newOwner))) return { status: "too_many" };
    }
  }

  const upd = await db().from("vehicles").update({ make: v.make, colour: v.colour, vehicle_type: v.type, active: v.active }).eq("id", id);
  if (upd.error) fail(upd.error.message);

  if (newOwner !== before.ownerId) {
    const del = await db().from("member_vehicles").delete().eq("vehicle_id", id);
    if (del.error) fail(del.error.message);
    if (newOwner) {
      const link = await db().from("member_vehicles").insert({ member_id: newOwner, vehicle_id: id });
      if (link.error) fail(link.error.message);
    }
  }
  return { status: "ok" };
}

/** Activate or deactivate. An open visit is left exactly as it is. Returns false when the vehicle does not exist. */
export async function setVehicleActive(id: string, active: boolean): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const { data, error } = await db().from("vehicles").update({ active }).eq("id", id).select("id");
  if (error) fail(error.message);
  return (data ?? []).length > 0;
}
