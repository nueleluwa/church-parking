import { normalisePlate } from "@/lib/rules";
import { db } from "./client";
import type { Area, Service, Vehicle, Visit } from "./types";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T | null {
  if (result.error) throw new Error(`Database error: ${result.error.message}`);
  return result.data;
}

export async function listActiveAreas(): Promise<Area[]> {
  const res = await db().from("areas").select("*").eq("active", true).order("sort");
  return unwrap<Area[]>(res) ?? [];
}

export async function getAreaBySlug(slug: string): Promise<Area | null> {
  const res = await db().from("areas").select("*").eq("slug", slug).eq("active", true).maybeSingle();
  return unwrap<Area>(res);
}

export async function listActiveServices(): Promise<Service[]> {
  const res = await db().from("services").select("*").eq("active", true).order("starts_at");
  return unwrap<Service[]>(res) ?? [];
}

export async function findVehicleByPlate(plate: string): Promise<Vehicle | null> {
  const res = await db()
    .from("vehicles")
    .select("*")
    .eq("plate", normalisePlate(plate))
    .maybeSingle();
  return unwrap<Vehicle>(res);
}

export async function findOpenVisitByVehicle(vehicleId: string): Promise<Visit | null> {
  const res = await db()
    .from("visits")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .eq("status", "parked")
    .maybeSingle();
  return unwrap<Visit>(res);
}

export async function getVisitByToken(token: string): Promise<Visit | null> {
  const res = await db().from("visits").select("*").eq("pass_token", token).maybeSingle();
  return unwrap<Visit>(res);
}
