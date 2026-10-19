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

/**
 * Reads QR_SESSION_FLOW (off, pilot, on) and QR_SESSION_AREAS (car park addresses, comma separated). A missing, empty or
 * unrecognised mode means `off`, so a typo can never switch the new check-in on, or stop the app from starting.
 */
export function readQrFlow(env: Record<string, string | undefined>): QrFlowConfig {
  const mode = (env.QR_SESSION_FLOW ?? "").trim().toLowerCase();
  return {
    mode: mode === "pilot" || mode === "on" ? mode : "off",
    areas: parseQrAreas(env.QR_SESSION_AREAS ?? ""),
  };
}

/**
 * Whether anyone may still create a member account on their own (the PIN sign-up). Once phone check-in is on for every car park
 * there is no public self-registration: members are added by an administrator or by staff, and an unknown number is sent to staff.
 * While it is off or only piloting, sign-up stays open for the car parks that still use the original check-in.
 */
export function publicSignUpOpen(config: QrFlowConfig): boolean {
  return config.mode !== "on";
}

export function qrFlowEnabled(config: QrFlowConfig, areaSlug: string): boolean {
  if (config.mode === "on") return true;
  if (config.mode === "pilot") return config.areas.includes(areaSlug.toLowerCase());
  return false;
}
