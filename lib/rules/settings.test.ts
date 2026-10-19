import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, SETTING_KEYS, resolveSettings, validateChurch, validatePreferences } from "./settings";

describe("resolveSettings", () => {
  test("no stored settings means the defaults", () => {
    expect(resolveSettings([])).toEqual(DEFAULT_SETTINGS);
  });
  test("valid stored values are used", () => {
    const s = resolveSettings([
      { key: SETTING_KEYS.churchName, value: "Grace Chapel" },
      { key: SETTING_KEYS.campus, value: "Port Harcourt" },
      { key: SETTING_KEYS.systemName, value: "Grace Parking" },
      { key: SETTING_KEYS.defaultSearch, value: "phone" },
      { key: SETTING_KEYS.staffSessionHours, value: 4 },
    ]);
    expect(s).toEqual({ ...DEFAULT_SETTINGS, churchName: "Grace Chapel", campus: "Port Harcourt", systemName: "Grace Parking", defaultSearch: "phone", staffSessionHours: 4 });
  });
  test("the QR policy values start at the decided ones and can be changed within their ranges", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ credentialHours: 24, longSessionHours: 12, lookupIpPerMinute: 10 });
    const s = resolveSettings([
      { key: SETTING_KEYS.credentialHours, value: 6 },
      { key: SETTING_KEYS.reissueMax, value: 2 },
    ]);
    expect(s).toMatchObject({ credentialHours: 6, reissueMax: 2, longSessionHours: 12 });
  });
  test.each([0, -1, 49, 2.5, "24", null])("a credential lifetime of %j is ignored", (value) => {
    expect(resolveSettings([{ key: SETTING_KEYS.credentialHours, value }]).credentialHours).toBe(24);
  });
  test("an invalid or unknown stored value falls back to its default, and never lengthens a session", () => {
    const s = resolveSettings([
      { key: SETTING_KEYS.churchName, value: "x" },
      { key: SETTING_KEYS.systemName, value: 42 },
      { key: SETTING_KEYS.defaultSearch, value: "everything" },
      { key: SETTING_KEYS.staffSessionHours, value: 72 },
      { key: "something_else", value: "ignored" },
    ]);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings([{ key: SETTING_KEYS.staffSessionHours, value: 24 }]).staffSessionHours).toBe(12);
    expect(resolveSettings([{ key: SETTING_KEYS.staffSessionHours, value: "4" }]).staffSessionHours).toBe(12);
  });
});

describe("validateChurch", () => {
  test("accepts good values, tidies spaces, and allows an empty campus", () => {
    expect(validateChurch({ churchName: "  Grace   Chapel ", campus: "", systemName: "Grace Parking" })).toEqual({
      ok: true,
      values: { churchName: "Grace Chapel", campus: "", systemName: "Grace Parking" },
    });
  });
  test("refuses names that are too short, too long, or contain markup", () => {
    expect(validateChurch({ churchName: "G", campus: "", systemName: "Parking" })).toMatchObject({ ok: false });
    expect(validateChurch({ churchName: "Grace", campus: "", systemName: "P" })).toMatchObject({ ok: false });
    expect(validateChurch({ churchName: "x".repeat(81), campus: "", systemName: "Parking" })).toMatchObject({ ok: false });
    expect(validateChurch({ churchName: "Grace", campus: "y".repeat(81), systemName: "Parking" })).toMatchObject({ ok: false });
    expect(validateChurch({ churchName: "Grace", campus: "", systemName: "x".repeat(41) })).toMatchObject({ ok: false });
    expect(validateChurch({ churchName: "<b>Grace</b>", campus: "", systemName: "Parking" })).toMatchObject({ ok: false });
    expect(validateChurch({})).toMatchObject({ ok: false });
  });
});

describe("validatePreferences", () => {
  test("only the offered search methods and session lengths are accepted", () => {
    expect(validatePreferences({ defaultSearch: "reference", staffSessionHours: "8" })).toEqual({ ok: true, values: { defaultSearch: "reference", staffSessionHours: 8 } });
    expect(validatePreferences({ defaultSearch: "plate", staffSessionHours: "12" })).toMatchObject({ ok: true });
    expect(validatePreferences({ defaultSearch: "name", staffSessionHours: "8" })).toMatchObject({ ok: false });
    expect(validatePreferences({ defaultSearch: "plate", staffSessionHours: "24" })).toMatchObject({ ok: false });
    expect(validatePreferences({ defaultSearch: "plate", staffSessionHours: "0" })).toMatchObject({ ok: false });
    expect(validatePreferences({ defaultSearch: "plate", staffSessionHours: "abc" })).toMatchObject({ ok: false });
    expect(validatePreferences({})).toMatchObject({ ok: false });
  });
});
