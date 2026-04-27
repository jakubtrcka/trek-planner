
## v16-deploy + v16b-bugfix + v16c-admin-credentials + v16d-playwright-fix + v16e-static-data-files — DO App Platform deploy stabilizace + lokální scraping (přesunuto z RELEASE_NOTES.md 2026-04-27)

> Datum: 2026-04-27 | Branch: main | Autor: Claude Sonnet 4.6

### Status: ✅ (v16d zavřeno jako neřešitelné — nahrazeno v16e)

#### v16e — Lokální scraping do statických souborů

| Soubor | Operace | Popis |
|---|---|---|
| `scripts/scrape-peaks.ts` | CREATE | Lokální Playwright scraper → `data/peaks.json` |
| `scripts/scrape-areas.ts` | CREATE | Lokální Playwright scraper → `data/areas.json` |
| `app/api/sync-peaks/route.ts` | REWRITE | Čte z `data/peaks.json`, žádný Playwright na serveru |
| `app/api/sync-areas/route.ts` | REWRITE | Čte z `data/areas.json`, žádný Playwright na serveru |
| `package.json` | UPDATE | Skripty `scrape:peaks` a `scrape:areas` |

Workflow: Lokálně `pnpm scrape:peaks` → `data/peaks.json` → commit & push → Admin panel "Sync Vrcholy" → DB.

#### v16d — Playwright na DO App Platform (zavřeno bez řešení)

DO App Platform buildpack odděluje build a runtime prostředí — browser nainstalovaný v build fázi nebyl dostupný při runtime. 4 pokusy selhaly. Finální závěr: Playwright na DO s buildpack architekturou není spolehlivě řešitelný bez Dockerfile deploy. Řešení: přesunout scraping lokálně → statické soubory (v16e).

#### v16c — Globální admin credentials Hory.app v DB

| Soubor | Operace | Popis |
|---|---|---|
| `app/api/admin/hory-credentials/route.ts` | CREATE | GET/POST — credentials do `data_sources.config` (šifrovaně) |
| `lib/hory-auth.ts` | REWRITE | `getAdminHoryCredentials()` async z DB |
| `components/AdminPanel.tsx` | UPDATE | `HoryCredentialsForm` formulář |

#### v16b-bugfix — Produkční opravy

| Soubor | Operace | Popis |
|---|---|---|
| `lib/db/locations-repository.ts` | UPDATE | `getLocationsByModuleAndCountry()` s JOIN na `location_types` |
| `app/api/peaks/route.ts` | UPDATE | Filtruje přes modul mountains |
| `app/api/sync-peaks/route.ts` | UPDATE | Fire-and-forget 202, Playwright na pozadí |
| `components/AdminPanel.tsx` | UPDATE | Polling `/api/peaks` každých 10s |
| `app/page.tsx` | UPDATE | Clear `selectedCastle` při přepnutí modulu |
| `hooks/useMapEffects.ts` | UPDATE | `activeModule` v deps clusterovacího efektu |

Opravené problémy: (10) Zámky zobrazeny v modulu Hory — `getAllLocations()` bez filtrování modulu. (11) 504 Gateway Timeout na sync vrcholů. (12) `selectedCastle` stale state přežívající přepnutí modulu.

#### v16-deploy — DO App Platform deploy stabilizace

| Soubor | Operace | Popis |
|---|---|---|
| `lib/db/index.ts` | UPDATE | Strip `sslmode` + `rejectUnauthorized: false` + `dotenv.config()` |
| `lib/db/lazy-init.ts` | CREATE | Singleton `ensureDbInitialized()` |
| `lib/db/admin.ts` | CREATE | `isAdmin(userId)` — dotaz do DB |
| `lib/db/schema.ts` | UPDATE | `role varchar(32) DEFAULT 'user'` v tabulce `user` |
| `lib/auth.ts` | UPDATE | `baseURL` a `secret` z env vars |
| `lib/auth-client.ts` | UPDATE | Odstraněn `baseURL` (inferuje z `window.location.origin`) |
| `scripts/db-migrate.ts` | CREATE | Vlastní migrace — trackuje v `public._migrations` |
| `drizzle/0000_nosy_raider.sql` | CREATE | Čerstvá migrace — 17 tabulek |
| `drizzle/0001_left_living_lightning.sql` | CREATE | `ALTER TABLE user ADD COLUMN role` |
| `providers/castles/CastlesScraperService.ts` | DELETE | Mrtvý kód |

Opravené problémy: (1) ENOTFOUND base — DO private network DNS. (2) SSL SELF_SIGNED_CERT. (3) SASL dotenv hoisting. (4) Staré migrace. (5–6) BetterAuth baseURL. (7) Overpass API 406/429. (8) Permission denied drizzle. (9) Admin role DB-backed.

**Technical Audit:** `pnpm tsc --noEmit` ✅ čisté (všechny sub-verze).

---

## v15 + v15a + v15b + v15c + v15d — Live Overpass sync, unified clustering, collapsible filter, floating chat, UI opravy (přesunuto z RELEASE_NOTES.md 2026-04-23)

> Datum: 2026-04-23 | Branch: main | Verze: v15, v15a, v15b, v15c, v15d

### Status: ✅ Success (všechny sub-verze)

#### v15 — Zámky: Live Overpass sync (nahrazení GeoJSON souboru)

| Soubor | Operace | Řádky |
|---|---|---|
| `providers/castles/CastlesScraperService.ts` | CREATE | 103 |
| `providers/castles/CastlesParserService.ts` | UPDATE (+parseRaw) | 116 |
| `app/api/sync-castles/route.ts` | UPDATE | 55 |

- `CastlesScraperService.scrape()` volá Overpass API s bbox CZ+SK (46.5–51.5 lat, 12.0–22.5 lon)
- Query: `historic=castle` a `historic=chateau` pro nody, ways i relations
- `AbortController` 60s timeout. Zod validace přes `OverpassNodeSchema`. `resolveCoords()` pro ways/relations (center objekt).
- `CastlesParserService.parseRaw()` přidána jako validační pass-through; `parse()` (GeoJSON file) zachována.
- `POST /api/sync-castles` nyní volá `scraper.scrape()` → `parser.parseRaw()` místo file-based `parser.parse()`.

#### v15a — Unified clustering pro vrcholy + zámky

| Soubor | Operace | Řádky |
|---|---|---|
| `lib/map/clustering.ts` | UPDATE | 69 |
| `hooks/useMapEffects.ts` | UPDATE | 224 |
| `hooks/useCastleLayer.ts` | DEPRECATE (no-op stub) | 3 |
| `app/page.tsx` | UPDATE | 333 |

- `ClusterResult` discriminated union: `PointFeaturePeak | PointFeatureCastle`
- `ClusterFeature.kinds: Set<PointKind>` — reflektuje obsah clusteru (peak/castle/mix)
- `computeClusters()` přijímá `TaggedInput[]`. Helpers `tagPeaks()` a `tagCastles()`.
- Cluster barva: mix = fialová (`#7c3aed`), pouze peak = dark (`#0f172a`).
- `useMapEffects` přijímá `castlePoints: CastlePoint[]` a `showCastles: boolean`.
- `useCastleLayer.ts` deprecated jako no-op stub — rendering přesunut do `useMapEffects`.

#### v15b — Filtr vrcholů jako collapsible panel

| Soubor | Operace | Řádky |
|---|---|---|
| `components/PeaksSidebar.tsx` | UPDATE | 211 |
| `app/page.tsx` | UPDATE | 333 |

- `showPeakFilter: boolean` state (výchozí `false`, neperzistuje).
- Toggle: `SlidersHorizontal` Lucide ikona v záhlaví sekce "Vrcholy".
- `activeFilterCount` badge: počítá selectedLetters, selectedAreaSlugs, selectedRangeUrls, selectedCountries (≠ jen CZ).
- `PeaksSidebar` prop `showFilter: boolean` — při `false` FilterSection nere renderuje.

#### v15c — AI asistent jako floating window

| Soubor | Operace | Řádky |
|---|---|---|
| `components/ChatPanel.tsx` | UPDATE | 126 |
| `app/page.tsx` | UPDATE | 333 |

- `ChatPanel`: interní `expanded: boolean` (výchozí `false`).
- Mini: floating `w-72`, `z-[850]`, `bottom-4 left-1/2 -translate-x-1/2` (horizontální střed).
- Expanded: `w-[420px]` overlay, zprávy zůstávají. Zavírací X → mini stav.
- `<ChatPanel>` přesunut z aside do mapové oblasti div.

#### v15d — UI vylepšení: navigace, logo, legenda, chat, invalidateSize

| Soubor | Operace |
|---|---|
| `app/page.tsx` | UPDATE |
| `components/ChatPanel.tsx` | UPDATE |

- Panel toggle: `ChevronDown` ikona v icon baru (otáčí se 200ms), tlačítko z hlavičky odstraněno.
- Modulová tlačítka přepínají modul a vždy otevírají panel (toggle chování odebráno).
- `border-r` přesunut z aside na panel div — při zavřeném panelu jedna čára.
- Logo (Mountain ikona) odstraněno. Legenda Zámky ze spodního rohu odstraněna.
- Chat: `bottom-4 left-1/2 -translate-x-1/2` — horizontální střed v mapovém framu.
- `invalidateSize()` s 210ms zpožděním po změně `isModulePanelOpen` — Leaflet přepočítá rozměry.

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 33 routes (všechny sub-verze).

---

## v13 + v14 — Modul Zámky + UX opravy (přesunuto z RELEASE_NOTES.md 2026-04-23)

> Datum: 2026-04-23 | Branch: main | Verze: v13.1–v13.5, v14

### Status: ✅ Success

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `lib/db/seed.ts` | MODIFY (+castles module + castle location type) | 43 | ≤60 |
| `providers/castles/CastlesParserService.ts` | CREATE | 110 | ≤120 |
| `lib/castles/types.ts` | CREATE (domain types) | 24 | ≤60 |
| `lib/db/locations-repository.ts` | MODIFY (+getAllLocationsByModule) | 58 | ≤60 |
| `app/api/sync-castles/route.ts` | CREATE (POST, admin-only) | 52 | ≤80 |
| `app/api/castles/route.ts` | CREATE (GET, public) | 28 | ≤50 |
| `components/AdminPanel.tsx` | MODIFY (+Sync Zámky button) | 71 | — (UI komponenta) |
| `components/CastleDetail.tsx` | CREATE | 86 | — (UI komponenta) |
| `components/CastlesSidebar.tsx` | CREATE | — | — (UI komponenta) |
| `hooks/useCastles.ts` | CREATE (SWR getter) | 25 | ≤25 |
| `hooks/useCastleLayer.ts` | CREATE (Leaflet layer, kompoziční) | 48 | ≤120 |
| `hooks/useIsAdmin.ts` | CREATE (SWR) | — | ≤25 |
| `app/api/auth/is-admin/route.ts` | CREATE | — | ≤30 |
| `lib/map/clustering.ts` | MODIFY (méně agresivní parametry) | — | — |
| `app/page.tsx` | MODIFY (+castles state, hooks, layer toggle, CastleDetail, viditelnost dle activeModule, admin check) | 288 | — (orchestrátor) |

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 33 routes.

**v13.1 — DB Seed:** `seedModules()` rozšířena o idempotentní insert pro modul `castles` (slug: `castles`, name: `Zámky`, icon: `castle`) a `location_type` `castle`. Pattern `onConflictDoUpdate` / `onConflictDoNothing` dodržen.

**v13.2 — CastlesParserService:** Čte `export.geojson` z `process.cwd()`. Validace přes Zod discriminatedUnion pro `Point` a `Polygon` geometrie. Pro Polygon centroid z prvního ringu průměrem souřadnic. `external_id` = `properties["@id"]`. Features bez `name` nebo souřadnic filtrovány. `metadata` JSONB: `wikidata`, `opening_hours`, `historic`.

**v13.3 — API routes:** `POST /api/sync-castles` (admin-only, ADMIN_EMAILS pattern). `GET /api/castles` (veřejný). `getAllLocationsByModule(moduleId)` — JOIN přes `location_types.module_id`. `AdminPanel.tsx` rozšířen o 4. tlačítko "Sync Zámky" (Lucide Castle ikona).

**v13.4 — CastleDetail:** Analogická `PeakDetail.tsx`. Zobrazuje název, souřadnice, otevírací dobu, check-in tlačítko pro přihlášené uživatele, odkaz na zdroj. Sdílí `onVisitChange` mutaci z `page.tsx` — funguje genericky přes `externalId`.

**v13.5 — Mapová vrstva:** `useCastles` (SWR, 25 ř.). `useCastleLayer` (fialové `circleMarker` body, 48 ř.). Vrstva toggleovatelná tlačítkem. Při výběru zámku z mapy se zobrazí `CastleDetail` panel.

**v14 — CastlesSidebar + UX opravy:**
- `CastlesSidebar.tsx`: plnohodnotný tab v levém menu (Castle ikona, analogie PeaksSidebar). Fulltext search, "Filtrovat podle mapy" checkbox (výchozí: zapnuto), flyTo zoom 14 při výběru.
- Viditelnost dle `activeModule`: `hory` → pouze vrcholy, `zamky` → pouze zámky, `routes`/`trips` → vše viditelné.
- `GET /api/auth/is-admin` + `hooks/useIsAdmin.ts`: Settings ikona viditelná pouze pro `!!session && isAdmin`.
- Clustering: `maxZoom` 14→10, `minPoints` 2→4, `radius` 60→55px.

---

## v12 — Trips UX: RoutesSidebar verifikace + Odebrání waypointu + Řazení waypointů (plný záznam — přesunuto z RELEASE_NOTES.md 2026-04-22)

> Datum: 2026-04-22 | Branch: main | Verze: v12.1, v12.3, v12.2

### Status: ✅ Success

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `lib/db/trips-waypoints-repository.ts` | CREATE | 28 | ≤40 |
| `app/api/trips/[id]/waypoints/[waypointId]/route.ts` | CREATE (DELETE handler) | 23 | ≤30 |
| `app/api/trips/[id]/waypoints/route.ts` | MODIFY (+PATCH handler) | 65 | ≤80 (výjimka — 3 handlers, 2 schemas) |
| `hooks/useTripWaypoints.ts` | CREATE | 19 | ≤25 |
| `components/TripPanel.tsx` | MODIFY (+waypoints display, delete, reorder) | 158 | — (UI komponenta) |
| `app/page.tsx` | MODIFY (+handleWaypointDelete, +handleWaypointReorder callbacks) | — | — (orchestrátor) |

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 33 routes.

**v12.1 — Verifikace RoutesSidebar:** Plně funkční (87 ř.), aktivně renderovaná. Není stub.

**v12.3 — Odebrání waypointu:** `deleteWaypoint(tripId, userId, waypointId)` — ownership check, boolean return. `DELETE /api/trips/[id]/waypoints/[waypointId]`. X tlačítko s `confirmWpDeleteId` inline confirm.

**v12.2 — Řazení waypointů:** `reorderWaypoints(tripId, userId, orderedIds)` — ownership check, validace IDs, DB transaction. `PATCH /api/trips/[id]/waypoints`. ChevronUp/Down tlačítka (disabled pro první/poslední). `waypointStatus` counter jako trigger.

**Odchylky:** `waypoints/route.ts` 65 ř. (výjimka 80) — 3 handlers + 2 Zod schémata.

---

## v11 — Trips UX: Persist AI itinerář + Smazání výletu (plný záznam — přesunuto z RELEASE_NOTES.md 2026-04-22)

> Datum: 2026-04-22 | Branch: main | Verze: v11.1 + v11.2

### Status: ✅ Success

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `lib/db/trips-repository.ts` | MODIFY (+deleteTrip) | 54 | 60 |
| `app/api/trips/[id]/route.ts` | MODIFY (+DELETE handler) | 42 | 50 |
| `hooks/useTrips.ts` | MODIFY (+deleteTrip) | 38 | kompoziční výjimka |
| `components/TripPanel.tsx` | MODIFY (+delete button + onTripDelete prop) | 135 | — (UI komponenta) |
| `app/page.tsx` | MODIFY (onTripDelete prop) | 248 | — (orchestrátor) |

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 31 routes.

**v11.1 — Persist AI summary:** Formální verifikace — persistencia fungovala správně, kód beze změny.

**v11.2 — Smazání výletu:** `deleteTrip(id, userId)` — ownership guard, kaskádové FK. `DELETE /api/trips/[id]`. `Trash2` button s `confirmDeleteId` state (dvě-kliková konfirmace bez `window.confirm`).

---

> Starší verze (V1–V26a, TD-cleanup, v8.5, v8.6, v8.6.1, v8.7, TD-build, v9.1–v9.7, TD-orphan, TD-schema-uc, Fáze 9.4, v10) jsou trvale archivovány. Archiv udržuje pouze posledních 5 verzí.
