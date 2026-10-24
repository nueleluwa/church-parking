# Security policy

Church Parking holds drivers' names, phone numbers and plate numbers, and it decides whether a car may leave the car park. Please take a security problem seriously and report it privately.

## Reporting a problem

**Do not open a public issue or discussion for a security problem.** Tell the repository owner directly (a message or a phone call to the parking lead or the person who looks after the server is fine), and include:

- what you saw, and where (the address of the page, or the screen);
- the steps to see it again;
- who it affects (drivers, members, staff, admins);
- anything that already happened because of it (for example, a car released that should not have been).

If you can, do not try it again on the live site, and do not copy anyone's details.

You will get an answer as soon as someone can look. A fix for something that lets a car leave without being checked, or shows someone's details to the wrong person, comes before everything else.

## What is covered

The live site (https://churchparking.online) and the code in this repository. The security rules the app is built to keep are in [docs/security.md](docs/security.md), and the threat model is there too.

## Supported versions

Only the current version on `main` is supported. There are no older releases to patch.

## Keeping the project safe

- Never commit `.env.local` or any key, password or token. The keys live in the server's settings and in GitHub's secrets.
- Dependabot watches the dependencies. A security update for the framework or any package is treated as urgent.
- Names, phone numbers and the check-out code are never written to logs or put in addresses or QR codes (see the rules in `docs/security.md`).
