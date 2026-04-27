---
name: DO App Platform deployment constraints and admin role
description: Key lessons from v16-deploy: lazy DB init, SSL config, custom migrations, DB-backed admin role, no Playwright on server.
type: project
---

Lessons from v16-deploy (2026-04-27) — DO App Platform constraints:

**DB connectivity:**
- DO private network DNS: hostname `base` resolves only after container registers in service mesh — not at startup. Solution: `lib/db/lazy-init.ts` singleton `ensureDbInitialized()` — seed runs on first HTTP request.
- SSL: strip `sslmode` from URL, set `ssl: { rejectUnauthorized: false }` in Pool config + `NODE_TLS_REJECT_UNAUTHORIZED = "0"`.
- ESM import hoisting: `dotenv.config()` must be called in `lib/db/index.ts` before Pool creation.

**Migrations:**
- DO Managed DB user lacks permission to create the `drizzle` schema. Custom `scripts/db-migrate.ts` tracks migrations in `public._migrations`. Idempotent — catches PostgreSQL errors 42701, 42P07, 42710.
- Run: `pnpm db:migrate` (= `tsx scripts/db-migrate.ts`).
- After fresh migration: set admin manually — `UPDATE "user" SET role = 'admin' WHERE email = '...'`.

**Admin role (DB-backed since v16-deploy):**
- `user.role varchar(32) DEFAULT 'user'` — migration `drizzle/0001_left_living_lightning.sql`.
- `lib/db/admin.ts` — `isAdmin(userId)` queries DB. `ADMIN_EMAILS` env is GONE.
- All admin checks (`app/(admin)/admin/page.tsx`, sync routes, `is-admin` endpoint) use `isAdmin(userId)`.

**Scraping architecture (no Playwright on server):**
- Playwright cannot run reliably on DO buildpack (build/runtime slug separation, no sudo).
- All scraping is local: `pnpm scrape:peaks` / `pnpm scrape:areas` / `pnpm tsx scripts/scrape-castles.ts`.
- Output files (`data/peaks.json`, `data/areas.json`, `data/castles.geojson`) are committed to repo.
- Sync endpoints read from these static files — no browser on server.

**Admin credentials for Hory.app:**
- Stored encrypted in `data_sources.config` (JSONB), module `mountains`, type `scraper`.
- Endpoint: `GET+POST /api/admin/hory-credentials` (admin-only).
- `getAdminHoryCredentials()` in `lib/hory-auth.ts` is async and reads from DB.
- Set once via `HoryCredentialsForm` in AdminPanel.

**Why:** Production deploy revealed multiple environmental differences between local dev and DO App Platform that required architectural changes to DB init, migrations, auth, and scraping.

**How to apply:** When suggesting sync or scraping features, always assume no browser on server. When reviewing admin checks, look for `isAdmin(userId)` not `ADMIN_EMAILS`. When debugging DB connection on DO, check lazy init and SSL config first.
