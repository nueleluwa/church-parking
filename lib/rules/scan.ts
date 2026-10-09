export type ScanDetail = {
  visitId: string;
  status: "parked" | "released" | "missed";
  reference: string;
  serviceDate: string;
  plate: string;
  areaName: string;
  serviceName: string;
  isGuest: boolean;
  /** A member's car saved within the last week: the attendant checks the driver as they would a guest. */
  isNewCar: boolean;
  fullName: string;
  phone: string; // full number: stays on the server
  releasedAt: string | null;
  releasedByName: string | null;
};

export type ScanState = "ready" | "already_released" | "expired" | "closed";

export type ScanCard = {
  visitId: string;
  state: ScanState;
  plate: string;
  areaName: string;
  serviceName: string;
  reference: string;
  isGuest: boolean;
  isNewCar: boolean;
  /** True for guests and new cars: the attendant asks for name and phone number and checks them. */
  askForDetails: boolean;
  firstName: string;
  phoneLast4: string;
  releasedAt: string | null;
  releasedByName: string | null;
};

/**
 * What the scanner shows an attendant (EX-2, EX-6). Only the first name and
 * the last 4 phone digits ever leave the server (R-9).
 */
export function buildScanCard(d: ScanDetail, today: string): ScanCard {
  let state: ScanState = "ready";
  if (d.status === "released") state = "already_released";
  else if (d.status === "missed") state = "closed";
  else if (d.serviceDate !== today) state = "expired";

  return {
    visitId: d.visitId,
    state,
    plate: d.plate,
    areaName: d.areaName,
    serviceName: d.serviceName,
    reference: d.reference,
    isGuest: d.isGuest,
    isNewCar: d.isNewCar,
    askForDetails: d.isGuest || d.isNewCar,
    firstName: d.fullName.trim().split(/\s+/)[0] ?? "",
    phoneLast4: d.phone.slice(-4),
    releasedAt: d.releasedAt,
    releasedByName: d.releasedByName,
  };
}

/** Reads a pass token out of a scanned QR code, which holds /p/{token} or the bare token. */
export function tokenFromScan(text: string): string | null {
  const m = /(?:\/p\/)?([A-Za-z0-9_-]{22})\s*$/.exec(text.trim());
  return m ? m[1] : null;
}
