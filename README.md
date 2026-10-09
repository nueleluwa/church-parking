# Church Parking

A digital replacement for paper parking tallies at church.

- **Drivers** scan the QR sign in their car park, register their car and get a digital pass. Members have an account, so they check in with two taps.
- **Attendants** scan the pass at the exit, check that the plate matches the car and release it.
- **The parking lead** sees live counts for each car park and service, walks the lots after each service to clear missed check-outs, and exports reports.

## Status

Planning is finished and the app hasn't been built yet. See `docs/roadmap.md`.

## Docs

| File | What's in it |
|---|---|
| [docs/spec.md](docs/spec.md) | Product spec: roles, flows, requirements and business rules |
| [docs/security.md](docs/security.md) | Threat model and the security rules |
| [docs/data-model.md](docs/data-model.md) | Database schema (Postgres) |
| [docs/decisions.md](docs/decisions.md) | Decisions made, with reasons |
| [docs/roadmap.md](docs/roadmap.md) | Build milestones and acceptance checks |
| [CLAUDE.md](CLAUDE.md) | Working instructions for Claude Code |

## Building with Claude Code

Open this folder in Claude Code and ask for one milestone at a time, for example:

> Build milestone M1 from docs/roadmap.md

Check each milestone's acceptance checks before moving on to the next one.

## Still needed

- The church's exact name
- A logo file (PNG or SVG) to go in `public/brand/`
