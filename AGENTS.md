<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Church Parking

Read [CLAUDE.md](CLAUDE.md) first: it has the stack, the architecture rules, the conventions and how to run the tests. In short:

- Next.js App Router, TypeScript strict, Tailwind v4, hosted Supabase for development and tests, the church's own server for production. A push to `main` deploys the live site, so never push or merge to `main` unless asked.
- All database access is on the server, through `lib/db`. Business rules are pure functions in `lib/rules` with unit tests. Every input is validated with `zod`.
- Check-in runs two ways, chosen per car park by `QR_SESSION_FLOW` and `QR_SESSION_AREAS` (off on the live server). The product spec is `docs/spec.md`; decisions already made are in `docs/decisions.md` and are not reopened without asking.
- Team-screen conventions: filter forms use `GetForm` (no page reload), admin results are toasts, deletes always ask first and never force a record with history, fields and buttons are 44px, and the church logo is `/cci-logo.svg`.
- Member visits and the audit log are kept forever. Never put names, phone numbers or the check-out code in URLs, QR codes or logs.
- Browser tests start their own server on port 3457: stop any dev server first and run suites one file at a time.

