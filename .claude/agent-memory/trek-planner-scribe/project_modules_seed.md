---
name: Modules table seed requirement
description: The modules table must be seeded after DB reset; absence or broken seed idempotence causes silent 404 and missing location_types.
type: project
---

The `modules` table must contain a row for each active module. After any DB reset or fresh migration, seed it with:

```sql
INSERT INTO modules (slug, name, icon) VALUES ('mountains', 'Hory', 'mountain') ON CONFLICT (slug) DO NOTHING;
```

**Why:** `POST /api/user/settings` looks up the module by `moduleSlug` — if the row is missing it returns 404 and user credentials are silently never persisted to `user_module_settings`. Additionally, the seed script (`lib/db/seed.ts`) must use `onConflictDoUpdate` (not `onConflictDoNothing`) for the modules insert — `onConflictDoNothing().returning()` returns an empty array when the row exists, which skips the downstream `location_types` insert. Missing `location_types` row (slug `peak`, module `mountains`) causes `POST /api/sync-peaks` to fail silently.

**How to apply:** Any time a fresh DB is provisioned or the schema is reset, flag this seed step before testing login, settings, or sync-peaks flows. If sync-peaks returns 503 or produces no data, check that `location_types` has a row with slug `peak`.
