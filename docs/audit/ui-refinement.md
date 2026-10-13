# UI refinement and design-system pass (October 2026)

Scope: every team screen (admin, coordinator, attendant), checked at desktop, tablet and phone widths. The driver screens (check-in, pass, member account) keep their larger touch-first controls and were not restyled. This file records what was found, what was built, what was tested and what is still open. It does not claim a measured "percent complete": the baseline below is what the audit actually found.

## 1. Route inventory (what was inspected)

| Area | Routes |
|---|---|
| Dashboard | `/admin` |
| Live Parking | `/staff/dashboard` (+ `/staff/dashboard/data` poll) |
| Sweep | `/staff/sweep`, `/staff/sweep/history` |
| Analytics, Reports | `/admin/analytics`, `/admin/reports` (+ CSV export route) |
| Visits | `/admin/visits`, `/admin/visits/[id]` |
| Vehicles | `/admin/vehicles` (add/edit panel), `/admin/vehicles/[id]` |
| Users | `/admin/users` (Members, Staff accounts, add panels), `/admin/members/[id]` |
| Settings | `/admin/settings` and `/services`, `/parking-areas`, `/qr-signs` (+ printable signs), `/vehicle-rules`, `/users`, `/notifications`, `/system` |
| Attendant tools | `/staff`, `/staff/scan`, `/staff/search`, `/staff/register`, `/staff/history`, `/staff/service`, `/staff/more` |
| Authentication | `/staff/signin`, `/account/signin`, `/account/signup` |
| Driver / member | `/`, `/c`, `/c/[area]`, `/scan`, `/p/[token]`, `/account`, `/account/more` (inspected, not restyled) |
| Redirect-only | `/admin/services`, `/admin/areas`, `/admin/signs…`, `/admin/members`, `/admin/staff` |

## 2. Inconsistencies found

1. **Four different summary cards.** The Dashboard, Visits, Vehicles, Users, Sweep, Live Parking and Analytics each had their own card with different padding (16 px vs 20 px), heights and value sizes.
2. **Five status chip implementations** (visits, vehicles, users, staff, settings, sweep, dashboard) plus the green/amber `StatusBadge`.
3. **The vehicle picture was drawn by hand in nine places** with slightly different gaps and plate sizes; the visit page used a medium picture and the vehicle page a large one.
4. **Buttons**: at least eight inline recipes (heights 40, 44, 48 px; radius full and lg) for the same primary, outline and row-action buttons.
5. **Fields**: `!mt-1 !py-2.5 !text-base` overrides on top of a 56 px base field, repeated in every filter form.
6. **Tables**: header and cell padding differed per page (`px-2`, `px-2.5`, `px-4`); the system activity log was a separate style.
7. **Spacing**: 16 px gutters and 16 px section gaps on every width, so wide screens felt cramped; content was capped at a narrow width on tablets.
8. **Page titles**: 24 px on every page, no scale for section or card headings.
9. **Loading**: one generic three-block placeholder for every team page; no placeholder shaped like the page.
10. **Feedback**: success shown only as an inline line inside each form; no toast; a failed request (no signal) left a form silent.
11. **Panels** (add/edit): no focus management, no Escape, no Tab trap; Vehicles had its own copy of the panel.
12. **Nested cards** on Live Parking (a card holding cards).

## 3. Design system established

- **Tokens and component classes** in `app/globals.css` (`@layer components`): type scale (`t-page`, `t-section`, `t-card`, `t-metric`, `t-body`, `t-support`, `t-meta`), `surface`, `metric`, `btn` (+ `btn-primary`, `-dark`, `-outline`, `-danger`, `-sm`, `-quiet`), `label`/`input`/`help`/`field-error`, `dt` table classes (`dt-th`, `dt-td`), `row-card`, `chip` (+ `chip-on/off/alert`), `skeleton`; a `wide` breakpoint (1440 px) where a list switches from cards to a table. Colours are the existing brand tokens; no new accent was added.
- **Shared components** in `components/ds/`: `PageHeader`, `MetricCard`/`MetricRow`, `Chip`, `VehicleIdentity`, `EmptyState`/`LoadError`, `Skeleton*`, `Toast` (`ToastProvider`, `useToast`). Icons: `IconArrowUp/Down/X` added and an `ICON` size table.
- **Workspace**: gutters 16 / 24 / 32 px, section gap 20 / 24 px, content width follows the screen up to 1440 px and 1600 px on very wide monitors, tablet no longer capped at phone width (`components/StaffChrome.tsx`).
- **Shared panel** (`app/(team)/admin/Panel.tsx`): focus moves in, Tab stays inside, Escape closes, page behind does not scroll, focus returns. Vehicles now uses it.

## 4. Modules moved onto the shared pieces

Dashboard, Live Parking, Sweep (page, board, history), Visits, Vehicles, Users (members, staff), Analytics, Reports, Settings (all sections), Visit / Vehicle / Member detail pages, Recent scans. Metric cards: Dashboard, Live Parking, Sweep, Visits, Vehicles, Users. Chips: visits, vehicles, members, staff, settings, sweep, dashboard. Vehicle picture + plate: Dashboard activity, Visits, Vehicles, Sweep board and history, Recent scans (all through `VehicleIdentity`); the detail pages use the same large picture (`VehicleImage size="lg"`); the driver screens keep `VehicleRow`.

## 5. Loading states

Own, page-shaped skeletons: Dashboard (and any admin page without its own), Visits, Visit details, Vehicles, Vehicle details, Users, Member details, Analytics, Reports, Settings (under the tabs, which stay), Services, Parking areas, QR signs, Live Parking, Sweep, Sweep history. Other attendant pages keep the generic team placeholder (small, fast screens). Smaller inline spinners remain for saving. Justified exceptions: Recent scans, Service information, More (tiny lists, generic placeholder is enough); the attendant search shows its own in-box "Searching" state.

## 6. Feedback coverage

Toast on success and on failure (after the server answers): every `AdminForm` (service, parking area add, staff account add/edit/role/password/status, settings forms, PIN reset, member name/phone, save a car to a member), bulk Activate/Deactivate, single vehicle and member switch on/off (menu and detail), CSV exports (Reports, Visits, Analytics download button), sweep Still here / Gone / several, attendant release, hold, clear hold, move car park. A request that cannot reach the server now shows an inline error and an error toast and keeps what was typed. Redirect flows (add vehicle, add member) confirm with the banner on the list they return to, not a second toast. Inline field errors are unchanged.

## 7. Tests actually run

See the final report in the conversation and `tests/e2e/design-system.spec.ts` (new): same title size, card padding/radius/height, button height and radius, chip colours, field height, table padding across 11 screens; the vehicle picture's source, width, gap, aspect and row height in four modules and on a phone; no table scrolls sideways at 1440, 1600 and 1920 px; toast success/dismiss/error; panel focus, Tab trap and Escape; a visible skeleton during a slow navigation; every page folder has a loading screen. Existing lint, type, unit, build and the affected end-to-end specs were re-run.

## 8. Remaining issues and limits

- Member- and driver-facing screens were left on their own larger touch controls on purpose; they were inspected, not restyled.
- The attendant tools keep the green/amber `StatusBadge` for pass validity (valid, expired, held): that colour meaning is a safety signal at the exit and was kept.
- A manual keyboard and screen-reader pass was done on the panel and toasts only; automated axe checks cover the rest. Full WCAG 2.2 AA is not claimed.
- Real-phone and slow-network checks (`docs/field-test.md`) are still to do.
- Tables below 1440 px are shown as cards; a dense table on a 1280 px laptop is deliberately not offered.
