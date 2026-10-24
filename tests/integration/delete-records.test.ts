import { afterEach, describe, expect, test } from "vitest";
import { createArea, createService, deleteArea, deleteService, deleteStaffAccount } from "@/lib/db/admin";
import { devDb, legacyMemberClaim, makeFixture, randomHash, removeFixture, type Fixture } from "./db";

const db = devDb();
const live = db !== null;
const suffix = () => randomHash().slice(5, 13);

describe.skipIf(!live)("deleting services, car parks and staff (development database)", () => {
  const made: Fixture[] = [];
  const services: number[] = [];
  const areas: number[] = [];
  const staff: string[] = [];

  afterEach(async () => {
    for (const f of made.splice(0)) await removeFixture(db!, f);
    for (const id of staff.splice(0)) {
      await db!.from("audit_events").delete().eq("staff_id", id);
      await db!.from("staff").delete().eq("id", id);
    }
    for (const id of services.splice(0)) await db!.from("services").delete().eq("id", id);
    for (const id of areas.splice(0)) await db!.from("areas").delete().eq("id", id);
  });

  const newService = async () => {
    const id = await createService({ name: `Zit ${suffix()}`, weekday: 3, starts_at: "03:00", ends_at: "04:00", active: false });
    services.push(id);
    return id;
  };
  const newArea = async () => {
    const s = suffix();
    const id = await createArea(`Zit ${s}`, `zit-${s}`);
    if (id === "duplicate") throw new Error("duplicate area");
    areas.push(id);
    return id;
  };
  const newStaff = async () => {
    const r = await db!
      .from("staff")
      .insert({ full_name: "Zit Staff", phone: `+2348${Math.floor(100000000 + Math.random() * 899999999)}`, password_hash: "x", role: "attendant" })
      .select("id")
      .single();
    staff.push(r.data!.id as string);
    return r.data!.id as string;
  };
  async function claimIn(serviceId: number, areaId: number) {
    const f = await makeFixture(db!);
    made.push(f);
    const r = await legacyMemberClaim(db!, { memberId: f.memberId, vehicleId: f.vehicleId, plate: f.plate, serviceId, areaId });
    expect(r.status).toBe("ok");
  }

  test("a service nobody has used is deleted, and deleting it again says it is gone", async () => {
    const id = await newService();
    expect(await deleteService(id)).toBe("ok");
    expect(await deleteService(id)).toBe("not_found");
  });

  test("a service with a visit is refused and left exactly as it was", async () => {
    const serviceId = await newService();
    const areaId = await newArea();
    await claimIn(serviceId, areaId);
    expect(await deleteService(serviceId)).toBe("in_use");
    expect((await db!.from("services").select("id").eq("id", serviceId)).data).toHaveLength(1);
  });

  test("a car park nobody has used is deleted; one with a visit is refused", async () => {
    const empty = await newArea();
    expect(await deleteArea(empty)).toBe("ok");

    const serviceId = await newService();
    const used = await newArea();
    await claimIn(serviceId, used);
    expect(await deleteArea(used)).toBe("in_use");
    expect((await db!.from("areas").select("id").eq("id", used)).data).toHaveLength(1);
  });

  test("a staff account with no activity is deleted; one the audit log names is refused", async () => {
    const fresh = await newStaff();
    expect(await deleteStaffAccount(fresh)).toBe("ok");

    const active = await newStaff();
    const logged = await db!.from("audit_events").insert({ staff_id: active, action: "zit_test" });
    expect(logged.error).toBeNull();
    expect(await deleteStaffAccount(active)).toBe("in_use");
    expect((await db!.from("staff").select("id").eq("id", active)).data).toHaveLength(1);
  });
});
