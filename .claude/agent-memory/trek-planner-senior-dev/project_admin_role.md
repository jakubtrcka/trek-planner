---
name: Admin Role Check Pattern
description: How admin access is implemented in Trek Planner — DB-backed role column, isAdmin() helper, useIsAdmin SWR hook
type: project
---

Admin access is DB-backed since v16a (2026-04-24). `ADMIN_EMAILS` env var was REMOVED.

**Current implementation:**
- `users.role` column (`user` | `admin`) in DB schema via `lib/db/schema.ts`
- `lib/db/admin.ts` — `isAdmin(userId: string): Promise<boolean>` — server-side check
- `hooks/useIsAdmin.ts` — SWR hook (`GET /api/auth/is-admin`) — client-side check
- Admin routes: `await isAdmin(session.user.id)` — returns 403 if not admin
- UI: `!!session && isAdmin` from `useIsAdmin()` hook guards admin links

**Why:** ADMIN_EMAILS env was fragile and environment-coupled. DB-backed role is more robust.
**How to apply:** For admin-gated API routes, use `isAdmin(session.user.id)` from `lib/db/admin.ts`. For admin-gated UI, use `useIsAdmin()` hook.
