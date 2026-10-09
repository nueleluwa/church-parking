"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { renameArea } from "@/lib/db";
import { checkAreaName, hasRole, RENAME_MESSAGES } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export type RenameState = { ok?: boolean; error?: string; name?: string };

const schema = z.object({ areaId: z.coerce.number().int().positive(), name: z.string().max(200) });

/** Only an admin can rename a car park. This is checked here on the server, not just by hiding the button. */
export async function renameAreaAction(_prev: RenameState, formData: FormData): Promise<RenameState> {
  const staff = await currentStaff();
  if (!staff || !hasRole(staff.role, "admin")) {
    return { error: "Only an administrator can rename a car park." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the name and try again." };

  const checked = checkAreaName(parsed.data.name);
  if (!checked.ok) return { error: checked.message };

  const result = await renameArea(parsed.data.areaId, staff.id, checked.name);
  if (result !== "ok") return { error: RENAME_MESSAGES[result] };

  // Every page reads the name from the database, so they all show it straight away
  revalidatePath("/", "layout");
  return { ok: true, name: checked.name };
}
