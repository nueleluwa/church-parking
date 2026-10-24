# Admin guide

What each admin screen is for. Admins see every screen below. Coordinators (team leads) see the live board, the sweep and **Visits**. Attendants see only the attendant tools. On a wide screen the menu is down the left; on a phone it is the tab bar and the **Admin** tab.

## Dashboard
Administrators only. An overview of parking activity, with two filters at the top: the **period** (Today, Yesterday, Last 7 days, Last 30 days, or a chosen date) and the **service** (All services, or one). The choice is kept in the address, and each filter keeps the other. Dates are Lagos dates.

- **Four cards.** *Cars checked in* (visits made in the period), *Cars left* (visits released at the exit in the period; a visit closed as missed is not a release), *Currently parked* and *Active alerts*. Each opens the screen that lists what it counts, so the numbers agree: the first two open Visits for the same dates and service, the last two open Live Parking.
- **Live figures.** *Currently parked* and *Active alerts* describe right now. When another period is chosen they say so ("Live now, not for yesterday") and do not change with the date. *Currently parked* follows the service filter; *Active alerts* counts only unresolved alerts (for the chosen service, if one is chosen).
- **Parking areas.** One card per car park that is switched on: *Currently parked* (live), *Checked in* and *Released* (for the period and service). Text only: there are no spaces-left or percentage figures, because capacity is not set. A card opens Visits for that car park, and **View all areas** opens Parking areas in Settings.
- **Recent activity.** The latest entries (a check-in, at the time it happened) and exits (a recorded release, at the time it happened), newest first, with the car illustration, the type, the car park, the time (Lagos) and the status. The plate opens the visit, **View all** opens Visits, and a line says how many events there are in all. A car is never shown as leaving because it dropped off a list.

## Live Parking and Sweep
The live board updates every few seconds without reloading, and shows when it last did (**Live · Updated 10:42:08**). Choose the service from the list (the real services and their times) or press **Refresh** to ask straight away.

- **Four numbers:** cars checked in, cars left, still parked (every car on site now, including any left from an earlier service) and active alerts. The still-parked number always equals the sum of the car park cards.
- **Parking Areas:** one text-only card for each car park with its checked in, left and still parked counts. There is no capacity or "percent full" because the church has not set capacities. Tap a card to see the cars parked there, or **View all vehicles** for every parked car.
- **Alerts:** each one shows what happened, the time, the car park and service, the number plate and the car's make and colour when known. **Investigate** opens that visit (or, for a second check-in that has no visit of its own, today's visits for that plate). **Mark as dealt with** removes it from the list; the record stays.

Attendants cannot open the live board.

## Sweep
Coordinators and admins. Sweep shows every car still recorded as parked and lets you record what you find. **It reconciles; it never releases a car.** A real release happens at the exit, against the pass, by an attendant.

- **Four numbers.** *Vehicles on site* (each car counted once, by plate), *Overstaying* (still recorded as parked 30 or more minutes after the end of the service it checked in for), *No check-in record* (**Not tracked**: the system cannot tell that a car is present without a visit, so there is no count; such a car is registered at the exit with Add car) and *Released today* (cars released at the exit since midnight; cars closed as missed are not counted).
- **Filters.** Parking area, service, duration (within its service time, or longer than its service lasts), status (on site, overstaying, marked still here) and plate search. **Reset** clears them; changing a filter starts a new selection and page 1. Sort by entry time (oldest or newest first) or parking area.
- **The table.** Each car with its picture, service and times, parking area, entry time, a duration that counts up by itself, and a status (On site or Overstaying; Marked still here and On hold are shown too). The plate opens the visit.
- **Still here.** Keeps the visit open; the car is carried forward and checked again after the next service. **Gone** asks first, then closes the visit as a **missed check-out** (not a release). Both are recorded with who and when. A car already released or closed by someone else is refused with a clear message.
- **Mark selected as still here.** Tick cars (the count shows, across pages), then confirm the list. Each car is its own recorded decision. If some cannot be marked the message says how many worked and why the rest did not. **Gone is only ever done one car at a time**, so no car is closed by mistake.
- **End-of-service sweep.** Choose a service and **Review cars from this service** to see the cars still parked from that service or an earlier one that you have not yet marked in its sweep. Nothing is marked for you.
- **Notes.** Cannot find a car? Go to Live Parking, or look it up by plate, phone or reference.
- **View sweep history.** Every Still here and Gone recorded, newest first, by date and outcome: the car, service, parking area, who recorded it and what it means. To correct a mistake, open the visit: corrections there need a reason and never overwrite the original entry. At midnight (Lagos) any visit still open is closed as missed.

## Visits
Every visit, by dates, service, parking area, status and number plate, twenty to a page. A row is one visit (a car's stay), not an entry or an exit. The four numbers: **Total visits**, **Checked in** (open visits) and **Released** count visits in the dates you chose; **Currently parked** is live (every car on site now, whatever the date) and is limited only by the service and parking area. Tap a number to see those visits.

Choose **From** and **To** (or Today, Yesterday, Last 7 days), a service, a parking area and a status (Checked in, Released or Missed), type part of a plate (case and spaces do not matter, and 0 and O, 1 and I match), then **Apply filters**. **Reset** clears them. The table shows the vehicle with its picture, type (guest or member), service, parking area, entry time, exit time, duration and status. An open visit has no exit time or duration yet. **View** (or the plate) opens the visit.

A visit has three tabs: **Details**, **Timeline** (everything that happened, in order) and **Member / guest** (first name, last four digits; **Show number** reveals the full number and is logged). For a parked car, **Release car** and **Mark as mismatch** are on the Details tab; each asks once and is recorded with who did it. There is no Add visit button on purpose: a visit is only made by the normal check-in, so the one-open-visit and plate rules cannot be bypassed.

**Export** (admins only) downloads every visit matching the filters, not just the page on screen: the same status, entry, exit and duration as the table, no names or phone numbers, and the download is logged. Coordinators can see Visits but not export.

## Vehicles
Administrators only. The register of every vehicle the church knows. A row is a vehicle record, not a visit.

- **Four numbers**, which do not overlap: *Total vehicles*, *Member vehicles* (active, saved by a member), *Guest vehicles* (active, not linked to a member; this includes cars first seen at a guest check-in) and *Inactive vehicles*.
- **Filters.** Vehicle type, ownership, status and plate search (look-alike letters 0/O and 1/I match). **Reset** clears them. The choice stays in the address.
- **The table.** Picture, plate, type, make and colour, ownership, the linked member's name (never a phone number), status, date registered ("Not recorded" for vehicles from before dates were kept) and View / Edit. The range, total, page numbers and rows per page (10, 20, 50) are shown below.
- **Add vehicle** opens a panel on the right (full screen on a phone). The plate is required and is stored in capitals without spaces or dashes; a plate already registered is refused. Ownership is *Member* (choose the member by searching their name or phone number) or *Guest*.
- **Edit.** Type, make and model, colour, ownership and status. **The plate is never changed**, because every visit is filed under it. Changing the owner never rewrites history (old visits keep the member or guest they were made for) and is refused while the car is checked in.
- **Inactive.** A deactivated vehicle cannot start a new check-in (guest, member or attendant). Its history stays, and a visit that is open at the time is **not** closed or released: the car is released at the exit as usual.
- **Select several.** Tick vehicles (this page only) and choose *Deactivate selected* or *Activate selected*. You are asked first; each vehicle is its own recorded change; if some cannot be changed the message says how many. There is no bulk delete, and vehicles are never deleted.
- **A vehicle's page** shows its details, the visit open now, its latest visits and the changes made to it, with who made each.

## Users
Administrators only. **Users** replaces the separate Members and Staff Accounts screens, with two tabs. They are different records and stay different: a member signs in with a PIN and saves cars; a staff account signs in with a password and has a role. Each tab has its own filters, so a member filter is never carried into the staff list. The old addresses (`/admin/members`, `/admin/staff`) still work and open the right tab.

**Members tab**
- **Four numbers:** *Total members*, *Registered vehicles* (cars saved by members; a car saved by one member counts once), *New this month* (joined since the first of the month, Lagos time) and *Inactive members*.
- **Search** by name, phone number or car plate (look-alike letters match). Filter by status and by whether the member has saved cars. **Reset** clears them. The range, total, page numbers and rows per page are shown below.
- **The table:** name, phone number, number of vehicles, status (Active, Inactive or Locked), date joined, **View** and a "..." menu (View details, Set a new PIN, Switch account off/on).
- **Add member** opens a panel on the right (full screen on a phone): full name, phone number, at least one vehicle (up to four; a car that already belongs to another member, is parked right now or is deactivated is refused and nothing is saved), an optional 4-number PIN, and status. A member with no PIN checks in with their phone number only and cannot sign in to an account; if you do set a PIN, tell it to the member in person. There is no department or email, because the system does not keep them.
- **A member's page** (View): correct the name or phone number, set a new PIN (also unlocks the account), save another car, switch the account off or on, and see their cars and latest visits.
- **Inactive** means switched off by an admin: the member cannot sign in and cannot be checked in (not by themselves, and not when an attendant registers their car). Their cars, visits and history are kept. **Locked** is different: too many wrong PINs, cleared by setting a new PIN.

**Staff accounts tab**
- **Four numbers:** active Admins, Coordinators and Attendants, and Switched off accounts.
- **Search** by name or phone number; filter by role and status. Staff sign in with their phone number, so there is no separate username or email.
- **Add staff account** and **Manage** open a panel: change name and phone, change role, set a new password, switch the account off or on, and see recent activity. The protections are unchanged: you cannot switch off or demote yourself, there must always be one active admin, and only an admin can do any of it. Switching an account off signs that person out at once and keeps their records.

## Reports
Choose a date range and a service (or all services), pick one of six categories, then **Download** the report you want. Each report is a CSV file, worked out from the visit and alert records when you press the button, for the dates and service you chose. The file name says which report, which dates and which service. A message beside the button says it is preparing, then how many rows it holds (or that there were no records), or why it failed. Reports contain plates but never drivers' names or phone numbers. Only admins can open or download them, and every download is logged.

**All reports in one file.** The card above the six categories, **Download everything (Excel)**, gives one Excel workbook for the dates and service you chose: a **Contents** sheet (the dates, the service, when it was made, and each report with its row count), then a sheet for every report, in the same order as the list below. The figures come from the same tables as the single CSV downloads, so they always agree. The headings are bold and frozen, and the columns are sized to fit. It is logged like any other download. Use a single CSV when you only need one report or want to open it in another program.

**The PDF report.** **Download PDF report** (on Reports, and on Analytics when no single parking area is chosen) makes a designed, branded PDF for the dates and service you chose, usually two pages: the key figures (cars checked in, left, not checked out, different vehicles, average stay, parked right now), a chart of check-ins and check-outs by day (by week for a long period), a chart of busy times of the day, check-ins by service and by parking area with their comparison tables, a count of every alert and exception, and a short note on how the figures are counted. It is drawn from the same numbers as the CSV and Excel files, covers every parking area, and contains no names or phone numbers. It is logged like any other download.

| Category | Reports |
|---|---|
| Parking activity | Parking summary; Vehicle activity by day; Hourly activity; Parking area activity; Service activity |
| Vehicle details | Vehicle visit history; Check-in and check-out records; Vehicle activity |
| Members | Member vehicle activity; Member vehicle visits; Member car claims by guests |
| Services | Service activity by day; Service comparison; Service activity by hour |
| Parking areas | Parking area activity by day; Parking area comparison; Cars parked now, by area |
| Alerts and exceptions | Missed check-outs; Vehicle and member conflicts; Releases without a scanned pass; Cars held: does not match |

**How the records are treated.** A visit belongs to the service date it was checked in on, and to the service it was checked in for. *Cars checked in* counts visits (a car that came twice counts twice). *Cars left* counts visits released at the exit. *Not checked out* counts visits with no recorded check-out (closed as missed, or still parked). Average stay uses only completed visits. *Right now* and *live* figures, including **Cars parked now, by area**, are taken when the file is made and are never limited to the dates, so they are not the number parked across a past week. Every alert raised in the period is listed, resolved or not, and repeats are never merged. Times are Lagos time. A range can be up to 366 days; a reversed or longer range switches the buttons off and explains why.

**Not offered.** No PDF (none is generated), no scheduled or emailed reports, and nothing about capacity or free spaces, because capacities are not set. A report of staff corrections from the audit log is not built yet.

## Analytics
Choose a date range (From and To, or Today, Yesterday, Last 7 days, Last 28 days, This month), a service and a parking area, then **Show analytics**. **Reset filters** clears them. **Export CSV** downloads the visits behind the page, with the same dates, service and area. Everything is in Lagos time, and a range is capped at 366 days.

The page shows four numbers, then Vehicle activity (check-ins and check-outs over time) beside Vehicles by parking area, the top car parks and top services by check-ins, the average parking duration by weekday, and the peak hours. What each one means:

| Number | Meaning |
|---|---|
| Cars checked in | Visits in the period. A car that came twice counts twice. |
| Cars left | Visits released at the exit (a recorded check-out). A car that left without being scanned is not counted, because the system never saw it go. |
| Average parking duration | Check-in to release, over released visits only. A release time that is missing, before the check-in or more than a day after it is left out. Visits with no check-out are not averaged. |
| Unique vehicles | Different number plates in the period. |
| Vehicle activity | By the hour for one day, by day for up to 45 days, then by week. The line is cars with no recorded check-out: within one day it is the cars checked in and not yet checked out at the end of each hour; for longer ranges it is each day's or week's cars that were never checked out. |
| Vehicles by parking area | **Live**: cars parked right now. The date range does not change it; the area and service filters do. Bars are sized against the largest car park shown, not a capacity. |
| Top parking areas / services | Check-ins in the period, most first. A service filter shows only that service. |
| Peak hours | The three hours with the most **check-ins**. This is arrivals, not cars on site. |

**Comparison with the period before.** An arrow and percentage appear only for a finished period (one that ends before today) and only when the earlier period has a figure to compare with. A part-finished day is never compared with a whole one, and a zero baseline shows no percentage.

**What is not shown, and why.** There is no occupancy, capacity or "spaces left" figure, because capacities are not set. Cars on site at the same time is not reported as a peak, because a car that leaves without being scanned has no recorded departure time, so the count would overstate how many were there. Historical on-site counts are not reconstructed from today's live numbers.

## Settings
Settings is the one place for configuration. Its heading and the eight tabs stay in place while the section underneath changes, and each section has its own address you can bookmark or refresh: `/admin/settings` (General), `/admin/settings/services`, `/admin/settings/parking-areas`, `/admin/settings/qr-signs`, `/admin/settings/vehicle-rules`, `/admin/settings/users`, `/admin/settings/notifications` and `/admin/settings/system`. There are no separate Services, Car Parks or QR Signs screens or menu entries; the old addresses (`/admin/services`, `/admin/areas`, `/admin/signs`, and `?tab=` on Settings) open the matching section.

- **General.** *Church details*: church name and campus (both printed on the QR signs) and the system name (shown in the side menu and the home page welcome). The time zone is shown but fixed at Africa/Lagos, because it decides when each service day starts and ends. *System preferences*: the tab attendants see first in Manual Lookup (vehicle number, phone number or pass reference), and how long a new staff sign-in lasts (2, 4, 8 or 12 hours; 12 is the longest, so it can only be shortened; it applies to people who sign in after you save). Each form has its own **Save changes**; a saved message appears only after the server confirms, and every change is written to the activity log with what it was before.
- **Services.** The services drivers are put into, as a table (service, day, start, end, status) that can be searched and filtered by day and by in use or switched off. **Add service** and **Edit** open a panel on the right. A service's status is Active now, Upcoming, Completed today, Not today, or Off. A service must end after it starts. Switch a service off instead of deleting it: visits already made keep the service they were made for, whatever its name or times become. The selection rules (next service starting within 30 minutes, else the one in progress, else the next that day) are shown. Overlapping services are allowed, because the rules above decide between them.
- **Parking areas.** Each car park with its status, its QR address and how many cars are parked in it now, with **Rename**, **QR sign** and **Switch off / on**. **Add car park** opens a panel. A car park cannot be switched off while a car is parked in it. Renaming never changes its QR address, so printed signs keep working, and past visits keep their car park. No capacity, occupancy or price is kept.
- **QR signs.** One sign for each car park that is switched on (the code opens check-in for that car park), and a general sign that opens the list of car parks. A sign is made by its car park, so a new sign comes from adding a car park. Open a sign to print it on A4 or A5 (choose "Save as PDF" as the printer for a PDF), or download the QR code on its own. Check printed signs scan from about 1.5 m in daylight. For a car park that uses **phone check-in**, each sign page also has an **Exit sign** tab: a second QR code (it opens `/c/<car park>/out`) that members scan when they leave to check themselves out. Print it and put it where drivers leave. Phone check-in is switched on per car park by the server setting `QR_SESSION_FLOW` (`off`, `pilot` or `on`) and `QR_SESSION_AREAS`; ask the developer, and do it outside a service (see D-43).
- **Vehicle rules.** The rules built into the system, to read: how plates are stored and searched, one open visit for each car, first claim on a plate wins, member plates are locked, passes work only on the day issued, only staff release a car, the service selection rules and the security limits. They protect the exit check, so none can be switched off here.
- **Users & access.** What each role (Admin, Coordinator, Attendant) can open, with the number of active accounts for each. The accounts themselves are managed in **Users**, which keeps its own menu entry.
- **Notifications.** The system sends no emails, texts or push messages, so there is nothing to set. Alerts show on Live Parking and are kept in the reports.
- **System.** Version, address, time zone, retention and midnight rules, a note that backups, restores and resets are done on the server by the developer (there are no buttons for them here), and the activity log, which is never cleared from the app.

**Not offered, on purpose:** a logo upload, a change of time zone, date or time formats, a QR-required switch, member-plate checking on or off, two-factor sign-in and password expiry, backup and reset buttons, and clearing logs. Each either has nothing in the app behind it or would weaken the exit check.

## Good habits
- Give each person their own account; never share one.
- Switch an account off the day someone leaves.
- Check the Exceptions view after each service.
- Names and phone numbers are never in lists. Showing a number is a recorded action: do it only when you need to.
