---
name: Area Filtering Pattern
description: How client-side area filtering works in Trek Planner — MapPoint.areaSlugs enrichment via /api/peaks, useMemo filter in page.tsx
type: project
---

Client-side area filtering (v9.6) is implemented as follows:

- `/api/peaks` enriches each location with `areaSlugs: string[]` by calling `getLocationAreaSlugsMap(moduleId)` from `lib/db/locations-area-repository.ts` in parallel with the locations fetch.
- `MapPoint` type (in `lib/types.ts`) has optional `areaSlugs?: string[]` field.
- `hooks/useAreas.ts` is a pure SWR getter hook fetching `GET /api/areas` (public endpoint).
- `app/page.tsx` holds `selectedAreaSlugs: string[]` state and computes `areaFilteredPoints` via `useMemo` — passed as `allPoints` to `useChallenges`.
- Filter logic: if no slugs selected → show all; if slugs selected → show peaks where `areaSlugs` intersects selected slugs (OR logic).
- `PeaksSidebar` renders "Oblasti DB" FilterSection only when `dbAreas.length > 0`.

**Why:** Architect recommended client-side filtering in first iteration — data already in memory, eliminates round-trip. Server-side via `?areaSlug=` query param is deferred for scale.

**How to apply:** When extending area filtering (e.g., AND logic, multi-module), modify `areaFilteredPoints` useMemo in `page.tsx`. For server-side filtering, `getLocationsByArea` in `locations-area-repository.ts` is already available.
