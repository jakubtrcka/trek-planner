---
name: Admin Role Check Pattern
description: How admin access is implemented in Trek Planner — DB schema has no role field, so ADMIN_EMAILS env var is used
type: project
---

Admin access (v8.6) is controlled via `ADMIN_EMAILS` env variable (comma-separated email list), NOT via a DB role field.

**Why:** The `users` table in `lib/db/schema.ts` has no `role` column, and the Better Auth admin plugin is not configured. Adding a DB migration was out of scope for 8.6.

**How to apply:** When implementing admin-gated features, check `session.user.email` against `ADMIN_EMAILS`. If a role-based system is needed in the future, the DB schema must be migrated first (add `role` column to `users` table) and Better Auth admin plugin configured in `lib/auth.ts`.
