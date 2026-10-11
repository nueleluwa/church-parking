# Admin guide

What each admin screen is for. Admins see every screen below. Coordinators (team leads) see the live board, the sweep and **Visits**. Attendants see only the attendant tools. On a wide screen the menu is down the left; on a phone it is the tab bar and the **Admin** tab.

## Dashboard
Today's numbers for the chosen service: checked in, released, still parked, and exceptions. Checked in and Released show an arrow for up or down against the same service last time. Tap a number, or a car park card, to see those visits. Recent activity lists the latest entries and exits.

## Live Parking and Sweep
The live board updates every few seconds without reloading, and shows when it last did (**Live · Updated 10:42:08**). Choose the service from the list (the real services and their times) or press **Refresh** to ask straight away.

- **Four numbers:** cars checked in, cars left, still parked (every car on site now, including any left from an earlier service) and active alerts. The still-parked number always equals the sum of the car park cards.
- **Parking Areas:** one text-only card for each car park with its checked in, left and still parked counts. There is no capacity or "percent full" because the church has not set capacities. Tap a card to see the cars parked there, or **View all vehicles** for every parked car.
- **Alerts:** each one shows what happened, the time, the car park and service, the number plate and the car's make and colour when known. **Investigate** opens that visit (or, for a second check-in that has no visit of its own, today's visits for that plate). **Mark as dealt with** removes it from the list; the record stays.

Attendants cannot open the live board. The sweep, after each service, lists the cars still here so the team can mark each as still here or gone.

## Visits
Every visit, by dates, service, parking area, status and number plate, twenty to a page. A row is one visit (a car's stay), not an entry or an exit. The four numbers: **Total visits**, **Checked in** (open visits) and **Released** count visits in the dates you chose; **Currently parked** is live (every car on site now, whatever the date) and is limited only by the service and parking area. Tap a number to see those visits.

Choose **From** and **To** (or Today, Yesterday, Last 7 days), a service, a parking area and a status (Checked in, Released or Missed), type part of a plate (case and spaces do not matter, and 0 and O, 1 and I match), then **Apply filters**. **Reset** clears them. The table shows the vehicle with its picture, type (guest or member), service, parking area, entry time, exit time, duration and status. An open visit has no exit time or duration yet. **View** (or the plate) opens the visit.

A visit has three tabs: **Details**, **Timeline** (everything that happened, in order) and **Member / guest** (first name, last four digits; **Show number** reveals the full number and is logged). For a parked car, **Release car** and **Mark as mismatch** are on the Details tab; each asks once and is recorded with who did it. There is no Add visit button on purpose: a visit is only made by the normal check-in, so the one-open-visit and plate rules cannot be bypassed.

**Export** (admins only) downloads every visit matching the filters, not just the page on screen: the same status, entry, exit and duration as the table, no names or phone numbers, and the download is logged. Coordinators can see Visits but not export.

## Vehicles
Every car the church has seen. Search by plate, filter by member or guest, last car park and last visit, sort by last seen, most visits or plate. Open a car to see its latest visit.

## Members
The members seen most recently, or search by name, phone or the plate of a saved car. Each card shows saved cars and visits. **View cars and visits** opens the member's page. **Set a new PIN** also unlocks a locked account; tell the member the new PIN in person, after checking who they are.

## Staff Accounts
Everyone on the team has their own account. Search by name or phone, filter by role, and open **Manage** to change a name or phone number, change a role, set a new password or switch the account off (they are signed out at once). Each person's recent activity is shown. You cannot switch off your own account, remove your own admin access, or leave the church with no active admin.

## Services
The services drivers are put into, with a status: Active now, Upcoming, Completed today, or Not today. Switch a service off instead of deleting it, so old records keep it. The selection rules (next service starting within 30 minutes, else the one in progress, else the next that day) are shown.

## Car Parks and QR Signs
Add, rename or switch off a car park. A car park cannot be switched off while a car is parked in it. Renaming never changes its QR address, so printed signs keep working. **QR Signs** has one sign for each car park and a general sign that opens the list. Open a sign to print it on A4 or A5 (choose "Save as PDF" as the printer for a PDF) or download the QR code on its own. Check printed signs scan from about 1.5 m in daylight.

## Reports
Choose a date range and a service (or all services), pick one of six categories, then **Download** the report you want. Each report is a CSV file, worked out from the visit and alert records when you press the button, for the dates and service you chose. The file name says which report, which dates and which service. A message beside the button says it is preparing, then how many rows it holds (or that there were no records), or why it failed. Reports contain plates but never drivers' names or phone numbers. Only admins can open or download them, and every download is logged.

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
Eight sections run along the top. **Services**, **Parking areas**, **QR signs** and **Users & access** open the screens that already manage them (Services, Car Parks, QR Signs, Staff Accounts), so nothing is set up in two places. The other four are on this screen:

- **General.** *Church details*: church name and campus (both printed on the QR signs) and the system name (shown in the side menu and the home page welcome). The time zone is shown but fixed at Africa/Lagos, because it decides when each service day starts and ends. *System preferences*: the tab attendants see first in Manual Lookup (vehicle number, phone number or pass reference), and how long a new staff sign-in lasts (2, 4, 8 or 12 hours; 12 is the longest, so it can only be shortened; it applies to people who sign in after you save). Each form has its own **Save changes**; a saved message appears only after the server confirms, and every change is written to the activity log with what it was before.
- **Vehicle rules.** The rules built into the system, to read: how plates are stored and searched, one open visit for each car, first claim on a plate wins, member plates are locked, passes work only on the day issued, only staff release a car, the service selection rules and the security limits. They protect the exit check, so none can be switched off here.
- **Notifications.** The system sends no emails, texts or push messages, so there is nothing to set. Alerts show on Live Parking and are kept in the reports.
- **System.** Version, address, time zone, retention and midnight rules, a note that backups, restores and resets are done on the server by the developer (there are no buttons for them here), and the activity log, which is never cleared from the app.

**Not offered, on purpose:** a logo upload, a change of time zone, date or time formats, a QR-required switch, member-plate checking on or off, two-factor sign-in and password expiry, backup and reset buttons, and clearing logs. Each either has nothing in the app behind it or would weaken the exit check.

## Good habits
- Give each person their own account; never share one.
- Switch an account off the day someone leaves.
- Check the Exceptions view after each service.
- Names and phone numbers are never in lists. Showing a number is a recorded action: do it only when you need to.
