export { normalisePlate, formatPlate } from "./plates";
export { normalisePhone, maskPhone } from "./phone";
export { makeReference, makePassToken } from "./tokens";
export {
  pickService,
  servicesForCheckIn,
  servicesToday,
  serviceStandings,
  type ServiceStanding,
  defaultDashboardService,
  hasServiceToday,
  lagosDate,
  TIME_ZONE,
  type ServiceWindow,
} from "./service";
export { canAddVehicle, isNewCar, MAX_MEMBER_VEHICLES, NEW_CAR_DAYS } from "./limits";
export {
  claimGuestVisit,
  claimMemberVisit,
  claimVisitForMemberByStaff,
  RATE_LIMITS,
  type ClaimResult,
  type ClaimStore,
} from "./claim";
export { buildPassView, passState, type PassView, type PassState } from "./pass-view";
export { releaseVisit, type ReleaseResult, type ReleaseStore } from "./release";
export { buildScanCard, tokenFromScan, type ScanCard, type ScanDetail } from "./scan";
export { hasRole, type StaffContext, type StaffRole } from "./roles";
export {
  attemptMemberSignIn,
  LOCKED_FOREVER,
  PIN_LIMITS,
  PIN_PATTERN,
  type MemberAuthStore,
  type PinResult,
} from "./member-auth";
export { summariseVisits, type DashboardSummary, type AreaCounts, type VisitRow } from "./dashboard";
export {
  canCorrect,
  checkReason,
  CORRECTION_ACTIONS,
  CORRECTION_MESSAGES,
  type CorrectionAction,
  type CorrectionResult,
} from "./corrections";
export { describeAlert } from "./alerts";
export { passTone, visitTone, progressTone, type Tone } from "./status";
export { checkAreaName, AREA_NAME_MIN, AREA_NAME_MAX, RENAME_MESSAGES, type RenameResult } from "./area-name";
export { checkVehicleDetails, describeVehicle, MAKE_MAX, COLOUR_MAX, type VehicleDetails } from "./vehicle";
