# Church Parking wiki

A digital replacement for paper parking tallies at church. Drivers check in on their phone and keep a digital pass; the parking team checks the pass against the real car at the exit. Live at https://churchparking.online (used by Celebration Church).

## Start here

| If you are... | Read |
|---|---|
| New to the project | [[How it works]] and [[Roles and screens]] |
| A volunteer on the parking team | [[Attendant guide]] |
| A coordinator or admin | [[Coordinator and admin guide]] |
| A developer | [[Running locally]], [[Architecture]], [[Testing]], [[Conventions]] |
| Planning a change | [[Decisions and rules]] |

## In one paragraph

Drivers scan a car park sign, get a pass (a QR code and a short reference such as `PK-7Q4M`), and an attendant releases the car at the exit after matching the plate. Car parks switched on for **phone-number check-in** let a member type a phone number, confirm their car, and later check out by scanning the **exit sign**. Coordinators watch live counts and alerts; admins manage services, car parks, QR signs, people and reports.

The full documents are in the repository's `docs/` folder. This wiki is the friendly map.

## Installing the app

It is a PWA: on Android Chrome tap **Add the app to your home screen** on the home page; on iPhone tap **Share**, then **Add to Home Screen**. The parking team's app (`/staff`) installs separately as "Parking Team". With no signal it shows a plain offline page; nothing is stored on the phone.
