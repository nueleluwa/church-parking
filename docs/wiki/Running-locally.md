# Running locally

You need Node 20 or newer and pnpm.

```bash
pnpm install
cp .env.example .env.local     # fill in the values
pnpm dev                       # http://localhost:3000
```

`.env.local` needs `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (a long random string), and `ADMIN_PHONE` and `ADMIN_PASSWORD` for the first admin (`pnpm db:seed-admin`). Use a throwaway Supabase project and apply `supabase/migrations/` in order. Never commit `.env.local`.

- **Phone-number check-in:** set `QR_SESSION_FLOW=on` (or `pilot` with `QR_SESSION_AREAS=<car park>`). Unset means off.
- **Weekdays:** check-in is closed with no service. `pnpm dev:test-service on` opens an all-day test service in the dev database.
- **On a phone:** open `http://<laptop address>:3000` on the same Wi-Fi. The scanner needs https: use `pnpm dev:https`.

```bash
pnpm build && pnpm start
pnpm test        # unit
pnpm test:e2e    # browser tests
pnpm lint
pnpm typecheck
```
