# Architecture

- **Stack:** Next.js (App Router), TypeScript strict, Tailwind v4, PostgreSQL through PostgREST, `zod` for every input.
- **Database access** runs on the server only, through `lib/db`. The browser never holds a database key.
- **Business rules** are pure functions in `lib/rules/` with unit tests. Pages and actions call them.
- **Auth** is custom: members use phone and PIN (180-day cookie), staff use phone and password (12-hour cookie).
- **Check-in** is one database call that applies rate limits and the one-open-visit rules, creates the visit and returns the pass. A one-time key makes retries safe.
- **Release** is a conditional update, so two attendants at once give exactly one success. Every staff change writes an audit row in the same transaction.
- **Production** runs on one server behind Cloudflare; a push to `main` runs the checks and deploys, except while a service is on.

| Folder | What lives there |
|---|---|
| `app/` | Pages and server actions; `(team)/` holds staff and admin screens |
| `components/` | Shared UI, including the design system in `components/ds/` |
| `lib/rules/` | Business rules |
| `lib/db/` | The only database access |
| `supabase/migrations/` | The schema as ordered SQL |
| `tests/` | End-to-end and performance tests |

More: `docs/architecture.md`, `docs/data-model.md` and `docs/security.md` in the repository.
