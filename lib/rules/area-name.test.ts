import { describe, expect, test } from "vitest";
import { AREA_NAME_MAX, checkAreaName } from "./area-name";

describe("checkAreaName", () => {
  test("accepts a normal name and tidies the spaces", () => {
    expect(checkAreaName("  Main   Car Park  ")).toEqual({ ok: true, name: "Main Car Park" });
    expect(checkAreaName("Roadside")).toEqual({ ok: true, name: "Roadside" });
  });

  test("rejects an empty name, or only spaces", () => {
    for (const bad of ["", "   ", "\n\t"]) {
      const r = checkAreaName(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/type a name/i);
    }
  });

  test("rejects a name that is too short or too long", () => {
    expect(checkAreaName("A").ok).toBe(false);
    expect(checkAreaName("x".repeat(AREA_NAME_MAX)).ok).toBe(true);
    expect(checkAreaName("x".repeat(AREA_NAME_MAX + 1)).ok).toBe(false);
  });

  test("strips control characters", () => {
    expect(checkAreaName("Car\u0000 Park\u0007 3")).toEqual({ ok: true, name: "Car Park 3" });
  });

  test("keeps letters from other languages and punctuation", () => {
    expect(checkAreaName("Ẹ̀bùn Park (East)")).toEqual({ ok: true, name: "Ẹ̀bùn Park (East)" });
  });
});
