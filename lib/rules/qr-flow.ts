/**
 * Which car parks use the QR check-in (phone number and plate confirmation, a checkout credential) instead of the original
 * check-in (guest form or member PIN). It is set by the server's settings, not by a screen, so changing it is a deliberate
 * step: `off` changes nothing for anyone, `pilot` turns it on for the listed car parks only, `on` for every car park.
 */
export type QrFlowMode = "off" | "pilot" | "on";

export type QrFlowConfig = { mode: QrFlowMode; areas: string[] };

/** "cp1, road" gives ["cp1", "road"]. Anything that is not a car park address is dropped. */
export function parseQrAreas(text: string): string[] {
  return [...new Set(text.split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{1,40}$/.test(s)))];
}

export function qrFlowEnabled(config: QrFlowConfig, areaSlug: string): boolean {
  if (config.mode === "on") return true;
  if (config.mode === "pilot") return config.areas.includes(areaSlug.toLowerCase());
  return false;
}
