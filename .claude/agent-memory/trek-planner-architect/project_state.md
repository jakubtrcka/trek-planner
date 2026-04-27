---
name: Trek Planner — aktuální stav projektu
description: Stav fází a klíčových architektonických rozhodnutí projektu Trek Planner
type: project
---

Fáze 0–v21 dokončeny (stav 2026-04-27). Aktuální priorita: v22 (data zámků do repozitáře) → v23 (oblasti zámků) → v24 (třetí modul).

**Strategický pivot (2026-04-22):**
Projekt přeorientován na multi-modulární POI platformu. Manuální trips UX zmrazeno. AI-first plánování tras je budoucí milestone (přes ChatPanel). Bezprostřední priorita: nové POI moduly + visit tracking.

**v16–v21 (2026-04-27) — DOKONČENO (commit 3a49197):**
- `hooks/useModuleSidebar.ts` — generický hook pro sdílenou sidebar logiku (search, mapBounds filter).
- Sloučení "Plánování tras" + "Výlety" do jedné menu položky `"planovani"` s `planningTab: "trips" | "routes"` state.
- Floating overlays: PeakDetail (bottom-left, `z-[900]`) + CastleDetail (top-right, `z-[900]`) — sidebar již nedělá swap na detail.
- Castle filter toggle: `showCastleFilter` state + SlidersHorizontal ikona (analogie peaks).
- Check-in parita ověřena: `handleVisitChange` akceptuje `kind: "peak" | "castle"`, `mutateAscents()` pouze pro peaks.
- `scripts/scrape-castles.ts` přidán — lokální Overpass fetch → `data/castles.geojson`.
- TD-stub: `hooks/useCastleLayer.ts` smazán.

**v16-deploy + v16b + v16c (2026-04-27) — DOKONČENO:**
- DO App Platform deploy stabilizace — DB konektivita (SSL, lazy init), auth (baseURL z env).
- Admin role přesunut z ADMIN_EMAILS env do DB sloupce `users.role`. `lib/db/admin.ts` s `isAdmin(userId)`.
- Admin Hory.app credentials šifrovaně v `data_sources.config`, přes `/api/admin/hory-credentials`.
- Playwright přesunut lokálně — žádný browser na serveru.
- `pnpm scrape:peaks` → `data/peaks.json`, `pnpm scrape:areas` → `data/areas.json` (commitnuto).
- Sync endpointy čtou ze statických JSON souborů.
- `scripts/db-migrate.ts` vlastní migrační skript (místo drizzle-kit CLI pro DO buildpack).

**KRITICKÝ DATOVÝ DLUH (blokuje modul Zámky v produkci):**
- `data/castles.geojson` — neexistuje v repozitáři. `CastlesParserService` hledá tento soubor.
- `scripts/scrape-castles.ts` existuje — stačí spustit lokálně a commitnout výstup.
- `sync-castles` endpoint bude funkční ihned po commitu souboru.

**Aktuální TODO (rev. 37):**
1. v22 (BLOKUJÍCÍ): Spustit `pnpm scrape:castles` → commitnout `data/castles.geojson`. Ověřit `sync-castles` endpoint. Přidat `scrape:castles` skript do package.json pokud chybí.
2. v23: Oblasti pro modul Zámky — po dostupnosti dat v22. Audit OSM tagů nejprve.
3. v24: Třetí modul — Architect preferuje Rozhledny (OSM `tourism=viewpoint`, outdoor segment).

**Klíčový pattern etablovaný v v9.1 (závazný):** Mutace zůstávají v `page.tsx` handler vrstvě. Hooks jsou čisté gettery.

**Architektonický vzor pro nové moduly (závazný):**
1. `lib/db/seed.ts` — idempotentní seed (onConflictDoUpdate).
2. `providers/<modul>/` — parser (+ scraper lokálně jako `scripts/scrape-<modul>.ts`).
3. `scripts/scrape-<modul>.ts` — lokální scraping → `data/<modul>.json` nebo `.geojson`.
4. `POST /api/sync-<modul>` (admin, čte ze souboru) + `GET /api/<modul>` (veřejný).
5. `<Modul>Detail.tsx` — detail s check-in tlačítkem.
6. `<Modul>Sidebar.tsx` jako plnohodnotný tab v levé navigaci s useModuleSidebar hookem.
7. Mapová vrstva integrovaná do `useMapEffects` (ne separátní `use<Modul>Layer` hook).

**Scraping workflow (od v16c — závazný pro produkci):**
- Scraping probíhá lokálně, ne na serveru.
- Výstupy commitovány do gitu jako statické soubory v `data/`.
- Sync endpointy čtou ze souborů, ne z live scraperů.
- Peaks/areas: `data/*.json`. Castles: `data/castles.geojson` (GeoJSON kvůli geometrii).

**Admin architektura (od v16-deploy):**
- `users.role` sloupec (user/admin) — DB-backed admin check.
- `lib/db/admin.ts` — `isAdmin(userId)` funkce.
- `ADMIN_EMAILS` env odstraněn ze všech routes.
- Admin Hory.app credentials: šifrovaný JSONB v `data_sources.config`, přes `/api/admin/hory-credentials`.

**Trvalé výjimky akceptované architektem:**
- `detail.ts` (244 ř.) — `page.evaluate()` blok nelze rozdělit přes hranice souborů.
- `hooks/useDataFetching.ts` (228 ř.), `useMapEffects.ts` (224 ř.), `useChallenges.ts` — výjimka pro kompoziční kategorii.
- `providers/hory/HoryScraperService.ts` (962 ř.) — výjimka pro `page.evaluate()` blok.
- `hooks/useHoryCredentials.ts` (64 ř.) — threading by byl složitější.
- `components/PeaksSidebar.tsx` (~211 ř.) — soudržný UI celek.
- `app/page.tsx` (367 ř.) — orchestrátor, akceptovaná odchylka.

**Pending neblokující:**
- `pnpm drizzle-kit push --force` v TTY pro drop `hory_ascents_cache` (TD-19-manual).
