# Product spec

Version 0.3. Last updated 9 October 2026.

## 1. Problem

At each of three Sunday services, attendants hand out paper tallies and write each driver's name and phone number by hand. The tallies run out before every car has one. At the exit, the driver hands back the tally and the attendant checks it against the car. That check is what stops car theft.

## 2. Goals

1. Remove the handwriting and stop running out of tallies.
2. Keep the exit check at least as strong as it is with paper tallies.
3. Show the parking lead live counts for each car park and service.
4. Don't slow down entry or exit.

## 3. Decisions already made

| Topic | Decision |
|---|---|
| Role of the tally | It records the driver and acts as a security check at the exit. The app must do both. |
| Who registers | The driver, by scanning an area QR code. Attendants can register cars manually. |
| Who checks out | An attendant scans the pass, matches the plate and releases the car. Drivers can't check themselves out. |
| Returning drivers | Member accounts with phone number and PIN. Guests can check in without an account. |
| Services | 07:30–09:30, 09:30–11:30, 11:30–13:30, back to back. |
| Areas | Car Park 1, Car Park 2, Roadside. Cars stay where they parked. |
| Capacity | No fixed space counts. The app shows car counts, not spaces left. |
| Connectivity | Reliable. No offline mode in v1. Paper tallies are the fallback. |
| Staffing | Two attendants per exit at the busiest service. |
| Admin | The parking lead. |
| Guest record retention | 24 months. |
| Branding | Church name and logo on check-in, passes and QR signs. |

## 4. Roles

| Role | Can do |
|---|---|
| Member | Save vehicles once, check in by scanning, view their current pass and history |
| Guest | Register a car for one visit, view that pass on the same phone |
| Attendant | Scan passes and release cars, search, register cars manually, flag problems |
| Coordinator | Everything an attendant can do, plus the dashboard, the sweep and corrections |
| Admin | Everything a coordinator can do, plus services, areas, QR signs, staff accounts, member PIN resets and exports |

## 5. Flows

### A. Member check-in (target: under 10 seconds)
1. The driver parks and scans the area's QR sign. It opens `/c/{area_slug}`.
2. The member is already signed in, so their vehicles are listed. The service is picked automatically (rule R-1) and the area comes from the QR sign.
3. The driver taps a vehicle, then **Check in**.
4. The pass appears.

### B. Guest check-in (target: under 45 seconds)
1. The driver scans the QR sign and taps **Continue as guest**.
2. The driver enters name, phone number and plate, then taps **Get my pass**.
3. The pass appears, with an offer to turn the details into a member account by choosing a PIN.

### C. Exit and release
1. The attendant scans the pass on the attendant scanner (`/staff/scan`).
2. The screen shows the plate in large type, the area, the service and the driver's first name. Guest passes are marked GUEST and also show the last 4 digits of the phone number.
3. For a guest pass, the attendant asks the driver for their name and phone number and checks them against the screen.
4. If everything matches, the attendant taps **Release car**. If anything doesn't match, they tap **Does not match**, hold the car and the coordinator is alerted.

### D. No pass at the exit
1. The attendant searches by plate.
2. The screen shows the registered name and the last 4 digits of the phone number.
3. The attendant asks the driver for their name and phone number without reading them out first.
4. If they match, the attendant releases the car with method `search`.

### E. Manual registration
For drivers with no smartphone, a dead battery or no data. The attendant enters plate and phone number (name is optional) and picks the area. The driver is given the reference to remember.

### F. End-of-service sweep
About 30 minutes after a service ends, the coordinator opens the list of cars still parked for that service, grouped by area. Attendants mark each car **Still here** or **Gone**. Cars marked Gone become `missed`. Cars still here carry over to the next service.

## 6. Requirements

Priority: **MVP** must ship for the pilot. **v1.1** comes soon after. **Later** only if needed.

### Check-in
| ID | Requirement | Priority |
|---|---|---|
| CI-1 | Each area has a fixed QR code that opens check-in with that area selected. | MVP |
| CI-2 | Pick the service automatically with rule R-1. The driver can change it. | MVP |
| CI-3 | Guest check-in requires name, phone and plate. Plates are normalised before saving. | MVP |
| CI-4 | Members check in with two taps: pick a vehicle, then Check in. | MVP |
| CI-5 | If the plate already has an open visit, block the check-in, tell the driver "This car is already checked in. Please see an attendant." and alert the coordinator. Never show the existing pass. | MVP |
| CI-5b | If the plate belongs to a member, block a guest check-in for it and alert the coordinator. | MVP |
| CI-6 | The pass reopens on the phone or member account that created it, until the car is released. | MVP |
| CI-7 | Turn a guest registration into a member account. | v1.1 (built early, see D-15) |

### Exit
| ID | Requirement | Priority |
|---|---|---|
| EX-1 | The attendant scanner uses the phone's camera. Only signed-in staff can release cars. | MVP |
| EX-2 | The scan result shows the plate in large type, the area, the service and the first name. Guest passes add the GUEST mark and the last 4 phone digits. | MVP |
| EX-3 | Two actions: **Release car** and **Does not match**. Log the staff member and time for each. | MVP |
| EX-4 | Search by plate, phone or reference. Releases found by search are logged with method `search`. | MVP |
| EX-5 | **Does not match** alerts the coordinator dashboard in real time. | MVP |
| EX-6 | Scanning a pass that's already released, or one from an earlier day, shows a warning, including who released it and when. | MVP |
| EX-7 | Two attendants can release at the same exit at once. Release is atomic, so only the first release of a visit succeeds. | MVP |

### Operations
| ID | Requirement | Priority |
|---|---|---|
| OP-1 | Live counts for the selected service: checked in, released and still parked, per area. | MVP |
| OP-2 | Sweep list with **Still here** and **Gone**. | MVP |
| OP-3 | Corrections: change area or service, undo a release, close a visit. Each needs a reason and is logged. | MVP |
| OP-4 | Attendants can register cars manually. | MVP |
| OP-5 | A coordinator can mark an area as full, which warns attendants. | v1.1 |

### Admin and reports
| ID | Requirement | Priority |
|---|---|---|
| AD-1 | Manage services and areas. Seeded with the values in section 3. | MVP |
| AD-2 | Printable A4 QR signs per area, with the church name and logo and the area name in large type. | MVP |
| AD-3 | Manage staff accounts and roles. Reset member PINs. | MVP |
| AD-4 | Reports per service, area and Sunday: missed check-outs and releases without a pass. CSV export. | MVP |
| AD-5 | Trends: peak arrival times and which area fills first. | v1.1 |
| AD-6 | Admin screens work on a phone, because the parking lead is the admin. | MVP |

## 7. Business rules

- **R-1 Choosing the service:** pick the next service that starts within 30 minutes. Otherwise pick the service in progress. Otherwise pick the next service that day. Examples: 08:45 gives Service 1, 09:05 gives Service 2, 07:00 gives Service 1.
- **R-2 One open visit per vehicle:** a vehicle can have only one visit with status `parked` at a time. The database enforces this.
- **R-3 Carry-over:** a visit belongs to the service it was checked in for. If the car stays, the visit stays open and shows as carried over in the next service. A car that leaves and comes back gets a new visit.
- **R-4 First claim wins:** the first claim on a plate each day wins. A second claim is blocked and logged as a `plate_conflict` alert.
- **R-5 Member plate lock:** a guest can't claim a plate that's saved to a member's account.
- **R-6 Release:** only staff can release. Released visits are final unless a coordinator reopens one with a reason.
- **R-7 Pass validity:** a pass works only on the service date it was issued (Africa/Lagos time).
- **R-8 Midnight close:** at 00:00 Africa/Lagos time, close every visit still `parked` as `missed`.
- **R-9 Phone masking:** staff see only the last 4 digits of a phone number unless they tap **Show number**, and each reveal is logged.
- **R-10 Fallback:** if the app is down, staff use paper tallies for the rest of that service.
- **R-11 Retention:** delete guest visits and guest records after 24 months. Members can delete their account.

## 8. Screens

| Route | Screen | Used by |
|---|---|---|
| `/c/[area]` | Check-in | Member, guest |
| `/p/[token]` | Pass. Staff see full details. Anyone else sees only plate and status. | Everyone |
| `/account`, `/account/signin`, `/account/signup` | Member account | Member |
| `/staff/signin` | Staff sign-in | Staff |
| `/staff/scan` | Scanner and release | Attendant and above |
| `/staff/search`, `/staff/register` | Search and manual registration | Attendant and above |
| `/staff/dashboard`, `/staff/sweep` | Dashboard and sweep | Coordinator and above |
| `/admin/*` | Services, areas, signs, staff, members, reports | Admin |

## 9. Non-functional requirements

- Check-in loads in under 2 seconds on 3G. First-load JavaScript is under 150 KB.
- Handles 300 check-ins in 20 minutes.
- Dashboard updates within 5 seconds of a check-in or release.
- High-contrast pass and scanner screens for use in sunlight.
- Complies with the Nigeria Data Protection Act 2023. Show a privacy notice on check-in, collect as little as possible, and follow the retention rule.

## 10. Not in v1

SMS or WhatsApp messages, capacity counts, number-plate recognition cameras, offline mode, payments, native apps.

## 11. Pilot

1. Staff run-through on a weekday with seed data, including the 09:30 changeover.
2. Run one service with paper tallies as a backup.
3. Run all three services. Announce member sign-up the week before.
4. Retire paper tallies after two clean Sundays.

Success: at least 70% of cars registered digitally, exit queues no longer than they are today, and missed check-outs under 5% after the sweep.
