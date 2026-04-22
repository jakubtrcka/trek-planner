---
name: Trek Planner Coder Workflow
description: How the Senior Developer role works in this repo — file limits, doc workflow, and key conventions
type: project
---

CODER.md is the authoritative guide. Before any implementation, read CODER.md, TODO_NEXT.md, and the skills/ files.

**Why:** The project uses a structured agent workflow where the Architect writes TODO_NEXT.md and the Coder implements. Each completed version must be documented in RELEASE_NOTES.md and previous content archived to ai-docs/archive/RELEASE_NOTES_ARCHIVE.md.

**How to apply:**
- File limits are hard caps: API routes ≤50 ř., Service (providers/) ≤120 ř., Utility (lib/) ≤60 ř., Hooks ≤25 ř.
- After every file write, run `wc -l` to verify the line count.
- Run `pnpm tsc --noEmit` and `pnpm build` after each task to verify zero errors.
- Verify package versions with `pnpm list` when in doubt.
- Callers must remain unchanged after any refactor — check import paths explicitly.
- `readAllPeaksCache` in peaks.ts takes `normalizeText` as a callback to avoid circular imports between peaks.ts and scraper.ts.

## v23 Fáze 8.1+8.2 — Public-First Architecture (2026-04-20)

- `app/api/peaks/route.ts` — public GET endpoint (no auth), returns `{ locations, count }` from `locations` table. No changes needed.
- `hooks/useDataFetching.ts` — removed `authBootstrapLoading`, `hasStoredCredentials`, `isAuthenticated`, `/api/auth-state` useEffect. Added `publicPeaksLoading` state and mount useEffect that fetches `/api/peaks` and maps `Location → MapPoint` (locationId, name, lat, lon, altitude, mountainLink from externalUrl).
- `app/page.tsx` — removed `LoginScreen` gate (`!fetch$.isAuthenticated` early return). Map always renders. Removed `LoginScreen` import and unused `FormEvent` import.
- `components/LoginScreen.tsx` — removed `authBootstrapLoading`, `hasStoredCredentials` props and bootstrap spinner UI. Component still exists for future 8.3 use.
- `components/SettingsModal.tsx` — removed `hasStoredCredentials` prop.
- `app/api/auth-state/route.ts` — kept in project (not deleted), will be removed/repurposed in 8.3+.
- DO NOT import server-side `lib/db/` types in client hooks — define inline response types instead.

## v22 TD-22a — lib/ Module Reorganization (2026-04-20)

- `lib/page-types.ts` split into `lib/peaks/types.ts`, `lib/challenges/types.ts`, `lib/trips/types.ts` (all ≤60 ř.)
- `lib/page-utils.ts` split into `lib/map/constants.ts`, `lib/czech/alphabet.ts`, `lib/czech/osmismerka.ts` (all ≤60 ř.)
- `useDataFetching` had 3 missing properties that `page.tsx` was using: `isAuthenticated` (derived: `rangeOptions.length > 0`), `authBootstrapLoading`, `hasStoredCredentials` (fetched from `/api/auth-state` on mount).
- `loadRangesAndAreas` had a 2-param call in page.tsx but only accepted 1 — added optional `_useStoredCreds` param (ignored, hook uses internal state).

## v21 app/page.tsx Split — Architectural Decisions

- `computePeakIds` is a closure over `allPoints` — lives in `useChallenges`, passed as callback prop to `useMapEffects`.
- `selectedLetterColorMap` is built in page.tsx via useMemo (depends on selectedLetters state) — passed to both `useMapEffects` and `PeaksSidebar` as prop.
- `pointColorByName` is an inline closure in page.tsx (2 lines) — NOT moved to useChallenges because it needs `selectedLetterColorMap` which lives in page.tsx.
- Route submit handlers in `useDataFetching` take `modulePoints: MapPoint[]` as second arg — page.tsx wraps them: `(e) => void fetch$.handleRoutePlanningSubmit(e, visiblePoints)`.
- Leaflet refs are typed `any` throughout — Leaflet has no full TS declarations; each usage has eslint-disable comment.
- `addOrSwapBaseLayer` is exported from `MapContainer.tsx` and imported in `useMapEffects.ts` (same direction, no circular dependency).
- Hook exceptions: `useMapEffects` (210 ř.), `useDataFetching` (217 ř.), `useChallenges` (124 ř.) — all exceed 25-line limit, justified by shared refs / loading state grouping. Documented in RELEASE_NOTES v21.
