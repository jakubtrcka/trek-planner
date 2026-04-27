---
name: Castles Module Architecture (v13–v22b)
description: How the castles POI module is structured — provider, seed, API routes, unified clustering, unified detail overlay, and scraping workflow
type: project
---

Castles module (v13) was added as the second POI module to validate the multi-module architecture. Updated through v22b (2026-04-27).

**Key decisions:**
- `useCastles` is a standalone SWR hook (not merged into `useDataFetching`)
- `useCastleLayer` DELETED in TD-stub (2026-04-27) — was a 3-line no-op stub since v15a. Castle rendering in `useMapEffects`.
- Castle rendering participates in unified clustering via `computeClusters()` in `lib/map/clustering.ts`
- `CastleDetail` renders in unified detail slot (v22b) — `absolute bottom-4 left-4 z-[900]`, same as `PeakDetail`. Never both at once.

**Unified detail slot (v22b — 2026-04-27):**
- `page.tsx` uses single `activeDetail: ActiveDetail` state (discriminated union in `lib/page-types.ts`)
- `ActiveDetail = { type: "peak"; data: MapPoint } | { type: "castle"; data: CastlePoint } | { type: null; data: null }`
- `setSelectedPeak(p)` and `setSelectedCastle(c)` are wrapper functions (not useState setters) that call `setActiveDetail`
- `handleDetailClose()` sets `activeDetail` to `{ type: null, data: null }`
- Hooks (`useMapEffects`, `useTripLayer`) receive the wrapper functions — no changes to hooks needed
- Module switch does NOT close detail (spec requirement)

**Scraping workflow (v18/v22 — 2026-04-27):**
- `scripts/scrape-castles.ts` — local Overpass API fetch → `data/castles.geojson` (GeoJSON, committed to git)
- `CastlesParserService.parse()` — prioritně čte `data/castles.geojson`, fallback na `export.geojson`
- `pnpm scrape:castles` → commit → Admin panel "Sync Zámky"
- `data/castles.geojson` committed in v22 (69 238 lines, ~8 700 entries)
- `CastlesScraperService.ts` DELETED — was live Overpass scraper, replaced by local script

**Unified clustering (v15a):**
- `lib/map/clustering.ts` accepts `TaggedInput[]` = `{ kind: "peak" | "castle"; point: MapPoint | CastlePoint }[]`
- `tagPeaks()` and `tagCastles()` helpers for building tagged arrays
- `ClusterFeature.kinds: Set<PointKind>` distinguishes cluster content for visual color
- Cluster color: peak-only = dark, castle-only or mixed = violet

**Filter toggle (v21):**
- `showCastleFilter: boolean` in `page.tsx` — `SlidersHorizontal` toggle in zamky sub-header
- `CastlesSidebar` prop `showFilter: boolean` — checkbox "Filtrovat podle mapy" hidden when false
- Badge `1` when `!filterCastlesByMapBounds` (active filter = deviation from default)

**Activation after deployment:**
1. Run `pnpm tsx lib/db/seed.ts` to register `castles` module and `castle` location type in DB
2. `pnpm scrape:castles` → commit `data/castles.geojson` → Admin panel "Sync Zámky"

**Why:** Unified clustering + single detail slot + local scraping ensures scalable, deploy-safe architecture.
**How to apply:** Future POI modules follow same pattern: local scrape script + CastlesParserService pattern + unified detail slot via `ActiveDetail`.
