# How it works

Every flow, step by step. The product spec (`docs/spec.md` in the repository) has the requirements behind each one.

### 1. A driver arrives

Every car park has a QR sign. Scanning it opens that car park's check-in page. What the driver sees depends on whether the car park uses **phone-number check-in** (switched on car park by car park by the server's `QR_SESSION_FLOW` setting, see [docs/qr-rollout.md](https://github.com/nueleluwa/church-parking/blob/main/docs/qr-rollout.md)).

```mermaid
flowchart TD
  A["Driver parks and scans the car park sign"] --> B{"Does this car park use phone-number check-in?"}
  B -- "Yes" --> C["Types their phone number"]
  C --> D{"A registered member with a saved car?"}
  D -- "Yes" --> E["Confirms the car"]
  E --> F["The pass appears and the phone keeps a check-out code"]
  D -- "No" --> G["Told to see parking staff"]
  B -- "No" --> H{"Signed in as a member?"}
  H -- "Yes" --> I["Taps a car, then Check in"]
  I --> J["The pass appears"]
  H -- "No" --> K["Continue as guest: name, phone number, plate"]
  K --> J
```

**Original check-in (car parks not on phone check-in)**

- **Member (two taps):** sign in with phone number and PIN (once; the phone stays signed in for 180 days), scan the sign, tap a saved car, tap **Check in**. The pass appears. A member can save several cars and add the app to their home screen.
- **Guest (under a minute):** scan the sign, tap **Continue as guest**, enter name, phone number and plate, tap **Get my pass**. The pass appears, with an offer to turn the details into a member account by choosing a PIN.
- **The service is picked for them** (the next one starting within 30 minutes, otherwise the one in progress, otherwise the next that day), and the car park comes from the sign.
- **Safe repeats:** scanning again, or reloading, never makes a second visit. A phone that already has a live pass is offered it first.
- **Blocked check-ins:** a car already checked in, or a plate saved to a member's account, cannot be checked in as a guest. The driver is told to see an attendant, and the coordinator gets an alert (first claim on a plate each day wins).

**Phone-number check-in (car parks switched on)**

1. The member types their phone number (for example 0803 123 4567). Nothing is created yet.
2. The app shows the car (or cars) saved to that number. The member confirms the one they are parking.
3. The visit is made, the pass is shown, and the phone is given a **check-out code** that only that phone holds.
4. A number that is not an active member with an active car gets one answer, "please see parking staff". A member already checked in at another car park is told to check out there first. When no service is open, the page says so.
5. Numbers are rate limited per phone and per address, so nobody can guess their way through.

**The pass.** A QR code and a short reference such as `PK-7Q4M`. It reopens on the phone (or member account) that made it until the car is released, works only on the service date it was issued (Lagos time), and anyone else who opens the link sees only the plate and its status.

### 2. A driver leaves

```mermaid
flowchart TD
  A["Driver is leaving"] --> B{"Checked in by phone number?"}
  B -- "Yes" --> C["Scans the exit sign with their own phone"]
  C --> D{"Check-out accepted?"}
  D -- "Yes" --> E["You are checked out: the car, the plate, the time and a blessing"]
  D -- "No" --> F["The screen says why and nothing is lost"]
  B -- "No" --> G["Shows the pass to an attendant"]
  F --> H["Attendant scans the pass or looks the car up"]
  G --> H
  H --> I{"Do the plate and details match?"}
  I -- "Yes" --> J["Release car: recorded with the attendant's name and time"]
  I -- "No" --> K["Does not match: the car is held and the coordinator is alerted"]
```

- **Exit sign (phone check-in only):** scan the exit sign at the car park the member checked in at. The check-out is sent once, with no typing, and success is shown only after the server confirms it. If it cannot be done the screen says why: already checked out, no check-in found on this phone (scan the check-in sign again to bring it back), expired, a different car park, car on hold, no connection (try again, it is safe), or too many tries.
- **Attendant at the exit:** the original way, and always available, including for members who check in by phone. Whichever of the two ends the visit first wins; the other is told the car is already out.
- **At midnight (Lagos time)** every visit still open is closed as *missed* (a car that left without being scanned).

### 3. The attendant's job

Sign in at `/staff` with phone number and password (12-hour session), and choose the car park you are standing at. The app remembers it for your shift.

**Release a car**

1. Tap **Scan pass** and point the camera at the pass. The plate appears in large type with the car park, the service and the driver's first name.
2. Look at the car. Does the plate on the screen match the plate on the car?
3. A card marked **GUEST** or **NEW CAR**: ask the driver for their name and phone number (do not read them out first) and check the first name and the last four digits.
4. Everything matches: **Release car**. Anything does not match: **Does not match**, stay with the car, call the coordinator. Only a coordinator can clear the hold, and they must give a reason.

| The screen says | What to do |
|---|---|
| **ALREADY RELEASED** | Do not release. Tell the coordinator, as someone may be using an old pass. |
| **OLD PASS** | The pass is from another day. Do not release. Look the car up by plate. |
| **ON HOLD** | A coordinator must clear it. Stay with the car. |
| **Invalid pass** | Scan again. If it still fails, look the car up by plate. |
| **A different car park** | A yellow warning names both car parks. Check the car, and if it is the right car and still here, tap **Move to this car park**, then release it. |
| **The member checked out with the exit sign** | Do not release again. |

**When someone cannot check in or out**

```mermaid
flowchart TD
  A["Someone cannot check in or out"] --> B{"What is wrong?"}
  B -- "Not registered, or the number is not found" --> C["More, Add Member: Check first, then Add member"]
  B -- "No phone, flat battery or no data" --> D["Add car: plate, phone number, car park, then give the driver the reference"]
  B -- "The car belongs to a member" --> E["Register for the member"]
  B -- "Cannot check out" --> F["Scan the pass, or Manual lookup by plate, phone or reference, then Release car"]
  B -- "The car has gone and the visit is still open" --> G["Open the pass: Close their visit, and write why"]
  B -- "Lost their check-in on their phone" --> H["Scan the check-in sign again, or release the car"]
```

- **Manual lookup** finds a car by plate, phone number or reference. The screen shows the registered name and the last four digits; ask the driver for theirs without reading them out first. A release made this way is recorded as a lookup, not a scan.
- **Add car** registers a car by hand for a visit (plate and phone number, name optional, pick the car park) and gives the driver the reference.
- **Add Member** (under **More**) registers a member so they can check in by phone: type their number or plate and tap **Check** (so nobody is added twice), then enter name, Nigerian phone number and plate. A number or plate that already belongs to a member is refused, and your name is recorded.
- **Recent scans** lists today's entries and exits, newest first, and opens a car. **Service info** shows today's services (Active, Next or Finished) and the car parks, so you know which service is running.
- **Phone numbers** are shown as the last four digits. Tapping **Show number** is recorded.

### 4. The coordinator's job

Everything an attendant can do, plus:

- **Live Parking (`/staff/dashboard`)** shows, for the chosen service, the cars checked in, cars left and cars still parked in each car park, the cars parked right now (longest first, with an overstaying flag), and the alerts. It refreshes every few seconds without reloading.
- **Alerts** (a car held with **Does not match**, a blocked second check-in, a plate claimed under a member, a missed check-out) appear straight away. **Investigate** opens the visit; **Mark as dealt with** clears it.
- **Clearing a hold** needs a reason and is logged.
- **Corrections** (change a car's car park or service, undo a release, close a visit) each need a reason and are logged with who made them.
- **End-of-service sweep (`/staff/sweep`):** about 30 minutes after a service ends, list the cars still recorded as parked. Mark each **Still here** (the visit carries over to the next service) or **Gone** (one car at a time, with a confirmation; it becomes *missed*, never a release). A car recorded as parked 30 or more minutes after its service ended is flagged as overstaying. The sweep history lists what was recorded.
- **Visits** lists every visit by day, with filters, and a flag on any visit open 12 hours or more.

### 5. The admin's job

Everything a coordinator can do, plus the screens under `/admin`:

- **Dashboard, Analytics and Visits:** counts for the day or period, charts, and every visit with filters.
- **Users:** members and staff accounts together. Add, edit, switch off or on, set a member's PIN or a staff password, and delete one or many, always after a confirmation. A staff account with activity on record cannot be deleted (switch it off instead), and a deleted member's visits stay in the records as "Deleted member".
- **Vehicles:** every vehicle, who owns it, and its status.
- **Settings:** church details, **Services** (the schedule that decides which service a driver is put in), **Parking areas** (add, rename, switch off, delete when never used), **QR signs** (print the A4 check-in sign and the **exit sign** for each car park), vehicle rules, users and access, notifications, and system information.
- **Reports:** choose dates and a service, then download one report as a CSV, **everything in one Excel workbook**, or a **designed PDF report** with charts. Every download is logged, and none contains names or phone numbers.
- **Results appear as toasts** (saved, error, notice), and every change is written to the audit log.

### 6. A member's account

Sign up or sign in with phone number and PIN (a wrong PIN locks the account for a while; an administrator can unlock it). **My vehicles** adds, edits and removes cars. **Parking history** lists real visits, newest first, and a visit that is still open opens its pass. A member can change their PIN and delete their account at any time; their visits stay in the records as "Deleted member".

### 7. If the app stops working

Tell the coordinator at once. Use paper tallies for the rest of that service (plate and phone number, matched at the exit as before), and the coordinator writes down when the app stopped and when it came back. Cars checked in on the app before it stopped can still be released once it is back; paper-tally cars are not in the app.

### The rules behind the flows

- A car can have only one open visit at a time, and a member only one open visit.
- The first claim on a plate each day wins; a guest cannot use a plate saved to a member.
- Only staff can release a car, and release is atomic: if two attendants try at once, only the first works.
- Every action that changes a visit writes an audit row in the same database transaction.
- Staff see only the last four digits of a phone number unless they tap **Show number**; admins see full numbers in the Members list.
- Names, phone numbers and the check-out code are never put in addresses, QR codes or logs.
- Member visits and the audit log are kept forever; guest records are deleted after 24 months.

