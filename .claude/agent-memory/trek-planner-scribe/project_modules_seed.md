---
name: Modules table seed requirement
description: The modules table must be seeded after DB reset; absence or broken seed idempotence causes silent 404 and missing location_types. Covers both mountains and castles modules.
type: project
---

The `modules` table must contain rows for all active modules. After any DB reset or fresh migration, run the seed script:

```bash
DATABASE_URL=... pnpm tsx lib/db/seed.ts
```

This script is idempotent and registers:
- `mountains` (Hory, icon: mountain) + `location_type` slug `peak`
- `castles` (Zámky, icon: castle) + `location_type` slug `castle`

**Why:** `POST /api/user/settings` looks up the module by `moduleSlug` — if the row is missing it returns 404 and user credentials are silently never persisted to `user_module_settings`. The seed script uses `onConflictDoUpdate` (not `onConflictDoNothing`) — `onConflictDoNothing().returning()` returns an empty array when the row exists, which skips the downstream `location_types` insert. Missing `location_types` rows cause sync endpoints (`POST /api/sync-peaks`, `POST /api/sync-castles`) to fail silently.

**How to apply:** Any time a fresh DB is provisioned or the schema is reset, flag this seed step before testing login, settings, or sync flows. If a sync endpoint returns 503 or produces no data, check that `modules` and `location_types` have the expected rows.
