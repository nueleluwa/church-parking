import { describe, expect, test } from "vitest";
import { AREA_NAME_MAX, checkAreaName, makeAreaSlug } from "./area-name";

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

describe("makeAreaSlug", () => {
  test("makes a short lowercase address from the name", () => {
    expect(makeAreaSlug("Church Gate", [])).toBe("church-gate");
    expect(makeAreaSlug("  Car Park 3!  ", [])).toBe("car-park-3");
  });
  test("adds a number when the address is taken", () => {
    expect(makeAreaSlug("Roadside", ["road", "roadside"])).toBe("roadside-2");
    expect(makeAreaSlug("Roadside", ["roadside", "roadside-2"])).toBe("roadside-3");
  });
  test("an address kept for the general sign is never given to a car park", () => {
    expect(makeAreaSlug("General", [])).toBe("general-2");
  });
  test("a name with no usable letters still gets an address", () => {
    expect(makeAreaSlug("!!!", [])).toBe("park");
  });
  test("long names are shortened without a trailing dash", () => {
    const slug = makeAreaSlug("The very long overflow car park behind the hall", []);
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug.endsWith("-")).toBe(false);
  });
});
