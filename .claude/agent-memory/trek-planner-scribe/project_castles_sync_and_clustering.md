---
name: Castles sync workflow and unified clustering
description: Castles sync reads data/castles.geojson (local file); CastlesScraperService deleted in v16-deploy; useCastleLayer deleted in v16-v21; clustering unified in useMapEffects.
type: project
---

**Current state (as of v16-deploy, 2026-04-27):**

The castles sync workflow no longer uses live Overpass API or the in-server `CastlesScraperService`. That file was deleted in v16-deploy as dead code.

Current flow:
- Local scraping: `scripts/scrape-castles.ts` (Overpass API, no Playwright, no credentials needed) → `data/castles.geojson`
- `POST /api/sync-castles` reads `data/castles.geojson` via `CastlesParserService.parse()`
- **`data/castles.geojson` is NOT yet committed to the repo** — this blocks castle sync in production (Priorita 1, v22 task).

History for context:
- v13: `CastlesParserService.parse()` introduced (reads `export.geojson` from `process.cwd()`).
- v15: `CastlesScraperService.ts` created (live Overpass sync) + `CastlesParserService.parseRaw()` added.
- v16-deploy: `CastlesScraperService.ts` DELETED (Overpass caused 406/429 on deploy). Parser now looks for `data/castles.geojson` first, then `export.geojson`.

Unified clustering (since v15a, unchanged):
- `lib/map/clustering.ts` — `computeClusters(TaggedInput[])` + discriminated union `{ kind: "peak" | "castle"; ... }`
- `ClusterFeature.kinds: Set<PointKind>` — mix = purple (#7c3aed), peak-only = dark (#0f172a)
- Helpers `tagPeaks()` and `tagCastles()`
- `hooks/useCastleLayer.ts` was a no-op stub — **now fully deleted** (TD-stub completed in v16-v21)

**Why:** DO App Platform rate-limited Overpass immediately on every deploy. Static file is the reliable approach (same pattern as peaks/areas).

**How to apply:** When reviewing castle sync, look at `CastlesParserService.parse()` and `scripts/scrape-castles.ts`. If `data/castles.geojson` is missing, that is the v22 blocker. If `useCastleLayer.ts` still appears, it should already be deleted.
