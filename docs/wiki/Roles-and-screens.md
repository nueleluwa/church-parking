# Roles and screens

## Roles

| Role | What they do |
|---|---|
| Driver (guest) | Scans a car park sign, gives a name, phone number and plate, and gets a pass. |
| Member | Has an account: saved cars, two-tap check-in, parking history. |
| Attendant | Scans passes at the exit, checks the plate, releases the car. Looks cars up by hand, adds cars and members. |
| Coordinator | Everything an attendant does, plus Live Parking, alerts, corrections, the end-of-service sweep and Visits. |
| Admin | Everything a coordinator does, plus services, car parks, QR signs, people, reports and settings. |

## Screens

| Address | What it is | For |
|---|---|---|
| `/` | Home: Check in, Scan a car park sign, member sign-in | Everyone |
| `/c` | "Where are you parking?" | Drivers |
| `/scan` | Scan a car park sign with the camera | Drivers |
| `/c/<car park>` | Check-in for one car park (what its QR sign opens) | Drivers |
| `/c/<car park>/out` | The exit sign: checks out the phone that checked in there | Drivers |
| `/p/<token>` | The pass | Driver; staff see more |
| `/account/*` | Member sign-up, sign-in, cars and history | Members |
| `/staff` | Team home: scanner, Manual Lookup, Add car, Recent Scans, Service Info | Attendants and up |
| `/staff/dashboard`, `/staff/sweep` | Live Board and the end-of-service Sweep | Coordinators and up |
| `/admin/*` | Dashboard, Visits, Vehicles, Users, Reports, Analytics, Settings | Admins (Visits also for coordinators) |

## Team tools on a phone

The attendant tools are built phone-first: **Manual Lookup** (by plate, phone or reference), **Recent Scans** (today's check-ins and releases), **Service Info** (the service now and the car parks), **Live Board** (live counts, alerts and cars parked now) and **Sweep** (cars still recorded as parked after a service).
