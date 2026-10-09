import { listActiveAreas, listActiveServices } from "@/lib/db";
import { canCorrect, servicesToday } from "@/lib/rules";
import type { StaffSession } from "@/lib/staff-auth";

export type CorrectionContext = {
  areas: { id: number; name: string }[];
  services: { id: number; name: string }[];
};

/** The choices for the corrections panel, or null for attendants, who can't make corrections. */
export async function correctionContext(staff: StaffSession): Promise<CorrectionContext | null> {
  if (!canCorrect(staff.role)) return null;
  const [areas, services] = await Promise.all([listActiveAreas(), listActiveServices()]);
  const todays = servicesToday(new Date(), services);
  return {
    areas: areas.map((a) => ({ id: a.id, name: a.name })),
    services: (todays.length ? todays : services).map((s) => ({ id: s.id, name: s.name })),
  };
}
