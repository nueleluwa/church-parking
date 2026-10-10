# Church Parking Project Overview

## A. Project Overview

Church Parking is a digital parking system designed for churches that need a safer, faster, and more organised way to manage vehicle check-in and exit during services. Instead of handing out paper parking tallies, the project gives drivers a digital pass and gives the church team a simple way to verify arrivals, releases, and live counts.

It is designed for church members, guests, attendants, and the person coordinating parking on the day. The main goal is to reduce the friction of parking check-in while keeping the exit check strong enough to protect the church’s vehicles and grounds.

For drivers, it means scanning a QR code, registering a car, and receiving a pass they can keep on their phone. For the church team, it means seeing who is on site, identifying the correct car at the exit, and managing any exceptions without relying on handwritten records.

## B. The Problem We're Solving

Many churches handle parking manually during busy services. The current approach described in the project is based on paper tallies: attendants hand out numbered slips, drivers keep them in the car, and the car is only released when the tally matches the vehicle at the exit. That process is simple in principle, but it creates practical problems.

The project identifies several issues with that method. Tallies can run out early, drivers may not have the correct slip at the exit, and the handwritten information is time-consuming to manage. Church staff must also keep track of who is still parked, who has already left, and which cars may need follow-up if something does not match.

This creates pressure at the busiest times of the day, especially when multiple services happen back to back and parking teams are trying to move vehicles in and out quickly without slowing down the congregation. The project is designed to improve that experience by replacing paper-based check-in with a digital system that still keeps the exit check strong and visible.

## C. Who the Project Is For

The product is primarily intended for churches or similar community organisations that manage regular parking during services or events. The main users are:

- Members who arrive in cars and want a quick way to check in.
- Guests or first-time visitors who need a simple one-off parking pass.
- Attendants who verify cars at the exit and release them.
- The parking lead or coordinator who needs to monitor traffic, manage exceptions, and keep the car parks running smoothly.
- Administrators who need to manage services, areas, staff access, and reporting.

The system is not aimed at general public parking or commercial car parks. It is built around the workflow of a church running multiple regular services with repeat users and occasional visitors. That is why the design focuses on familiar church tasks: member accounts, guest passes, service-based parking windows, and a simple check-out process for attendants.

## D. Our Solution

Church Parking replaces paper tallies with a digital parking pass and a structured check-in process. Drivers scan a QR code in the car park or use an app flow to register their vehicle for the current service. They receive a digital pass that can be shown at the exit, and the system keeps track of whether that car is still parked or has already left.

The core idea behind the solution is simple: keep the security benefit of the tally system while removing the paperwork and manual tracking. The system records who checked in, which service and area they are in, and whether the pass is still valid. At the exit, attendants can scan the pass or look up a car by plate, then compare the details with the vehicle and release it if everything matches.

This makes the process faster for drivers and easier for the church team to manage, especially when several services are running close together and the parking team needs live visibility across the site.

## E. How It Works in Practice

A typical journey starts with a driver arriving at church and scanning a QR code in the car park. The system identifies the correct area, suggests the current service, and asks the driver to check in their car. Members can save their vehicles in advance and check in with two taps. Guests can enter their name, phone number, and plate and receive a pass for that visit.

Once checked in, the driver keeps the pass on their phone. At the end of the service, when they leave, an attendant scans the pass, checks the registration details on the screen, and releases the vehicle if the information matches. If a car arrives without a pass, attendants can also search by plate or other details and verify the driver manually before releasing the car.

For the church team, the coordinator can monitor live counts by service and area, review alerts, handle missed check-outs, and manage exceptions after the service. This keeps the flow familiar for drivers while giving staff a clearer operational picture of what is happening across the site.

## F. What We've Built

Church Parking is built and live at https://churchparking.online. These parts work today:

**For drivers**
- A home page with **Check in** (choose a car park from a list) and **Scan a car park sign** (a separate camera page that reads the sign's QR code and opens that car park's check-in). A sign for another website, an unknown car park or a parking pass is refused with a clear message.
- Guest check-in with name, phone number and plate; member check-in in two taps with saved cars.
- A digital pass with a QR code, remembered on the phone that made it and shown to a signed-in member on any phone. A repeated check-in (for example after a dropped connection) returns the same pass instead of an error.
- Member accounts: sign up and sign in with a phone number and PIN, saved cars with a picture, make and colour, visit history, and turning a guest visit into an account.

**For the parking team**
- Staff sign-in, a scanner, search by plate, phone or reference, and manual registration of a car.
- Release a car, or mark it as not matching, which holds it until a coordinator clears it with a reason. Attendants say which car park they stand at; a car from another car park gets a warning and a one-tap fix.
- A live board with counts per car park and service and an alerts feed, and an end-of-service sweep that closes the cars that left unchecked.

**For admins**
- A dashboard with today's numbers, a service picker and change against last time; **Visits** by day, car park, service and status with search and export; **Vehicles**, **Members** (with each member's cars and visits) and **Staff Accounts** (search, roles, edit details, recent activity); **Services**; **Car Parks** and printable **QR Signs** on A4 or A5; **Reports** in four views with CSV export and print; **Analytics** with average stay, peak times, car park usage and more; and **Settings** with an activity log.
- Screens that work as tables on a desktop and as cards on a phone.

**Behind the scenes**
- The app runs on the church's own server with its own database, nightly backups and automatic deploys that wait while a service is on.
- Guest records are deleted after 24 months. Phone numbers are masked, and showing one is logged.
- Unit tests, end-to-end tests with a synthetic camera, accessibility checks on every screen, and slow-network and load tests.

**Still to do**
- Try it on real phones in a real car park (the checklist is in `docs/field-test.md`), print and test the QR signs, and run the staff through a busy changeover.
- Copy backups off the server.
- A few open questions are listed in `docs/roadmap.md`.

## G. What Makes This Approach Useful

The project’s value comes from simplifying a process that is normally repetitive and easy to mismanage. It gives church staff a clear, structured way to track vehicles without needing paper tallies and manual notes. It also gives drivers a smoother experience by letting them check in on their phone and keep a digital pass rather than searching for a physical slip.

The approach is useful because it combines familiarity with better visibility. The driver still follows a simple check-in and exit routine, but the church gains a better operational view of what is happening in each service and each area. That makes the process more reliable at busy times and easier to supervise.

The design is also intentionally practical. It focuses on the core needs of the church environment: fast check-in, a secure exit check, simple member access, and clear operational oversight. Rather than building a broad general-purpose parking system, it stays centred on the specific workflow a church actually needs.

## H. The Value for Users

The product is designed to help users achieve a few clear outcomes:

- Faster and easier church parking check-in for drivers.
- A more secure exit check that still matches the purpose of the paper tally system.
- Less reliance on physical paperwork and manual handling by staff.
- Better visibility of parking activity during and after services.
- A smoother experience for members who regularly attend and want a familiar way to check in.

These are value points the project is designed to provide, and they are consistent with the product’s implemented flows and documented goals. The project does not present measured business results or user adoption statistics in the workspace, so any broader claims about outcomes should be treated as intended benefits rather than proven results.

## I. Current Project Status

The product is live and ready for its first real-world trial. The features above are built and tested, and the church's server, database, backups and deploys are in place. What remains is the work that cannot be done at a desk: testing with real phones, cameras and printed signs, and rehearsing with the team.

The full history of what was decided and why is in `docs/decisions.md`, how the app is put together is in `docs/architecture.md`, and the guides for the team are `docs/attendant-guide.md` and `docs/admin-guide.md`. No measured results or adoption numbers exist yet, so the benefits in this overview are the intended ones, not proven ones.

## J. Closing Summary

Church Parking is a practical digital parking solution for churches that want to replace paper tallies with a faster, clearer, and more secure system. It is built for members, guests, attendants, and church staff who need a better way to manage parking during services while keeping the exit check trustworthy.

The project aims to reduce manual work, help people check in quickly, and give the church live visibility into parking activity without making the experience complicated for drivers. In short, it is a focused tool for making church parking easier to run and easier to understand.
