
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

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 33 routes. `pnpm drizzle-kit push` není potřeba — žádná změna DB schématu.

**v12.1 — Verifikace RoutesSidebar:** `components/RoutesSidebar.tsx` (87 ř.) je plně funkční komponenta aktivně renderovaná v `app/page.tsx` pro `activeModule === "routes"`. Přijímá 12 props (AI prompt, loading state, route mode, max distance, planning submit handlers). Není stub — obsahuje dva Cards (AI prompt + parametry trasy) a podmíněně renderovanou AI interpretaci.

**v12.3 — Odebrání waypointu:** `deleteWaypoint(tripId, userId, waypointId)` v novém `trips-waypoints-repository.ts`: ownership check přes `trips.userId`, DELETE s podmínkou `tripId + waypointId`, vrací `boolean`. `DELETE /api/trips/[id]/waypoints/[waypointId]`: auth-guard, parse, delegace. UI: X tlačítko s `confirmWpDeleteId` state (inline confirm, bez `window.confirm`). Po potvrzení: callback `onWaypointDelete` z `page.tsx` + local `refetchWaypoints()`.

**v12.2 — Řazení waypointů:** `reorderWaypoints(tripId, userId, orderedIds)`: ownership check, validace existence všech IDs, DB transaction pro atomický update `order` pole. `PATCH /api/trips/[id]/waypoints`: přijme `{ orderedIds: number[] }`. UI: ChevronUp/Down tlačítka (disabled pro první/poslední). Lokální swap v seřazeném poli + `onWaypointReorder` callback. `waypointStatus` incrementován po každé mutaci → trigger `useTripLayer` re-fetch.

**useTripWaypoints hook:** Nový getter hook (19 ř.) — `useCallback + useEffect` pattern. Exportuje `{ waypoints, refetch }`.

**Odchylky:** `app/api/trips/[id]/waypoints/route.ts` — 65 ř. (limit 50, výjimka 80). Zdůvodnění: 3 HTTP handlery (GET, POST, PATCH) + 2 Zod schémata — klasifikováno jako komplexní input. Pořadí implementace: v12.1 → v12.3 → v12.2 (dle technické poznámky v TODO).

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

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 31 routes. `pnpm drizzle-kit push` není potřeba — žádná změna DB schématu.

**v11.1 — Persist AI summary:** Ověřeno, že `POST /api/trips/[id]/ai-summary` volá `updateTripAiSummary(tripId, text)` a vrací `{ summary: text }`. `TripPanel.tsx` volá `await refetch()` po úspěchu — `trips` stav přenačten z DB. Po refreshi stránky `activeTrip.aiSummary` pochází z DB. Peristence fungovala správně již před v11 — v11.1 je formální verifikace bez nutnosti dalšího kódu.

**v11.2 — Smazání výletu:**
- `deleteTrip(id, userId)` v repository: DELETE s WHERE userId (ownership guard). Waypoints smažou kaskádou přes FK `ON DELETE CASCADE`.
- `DELETE /api/trips/[id]`: auth-guard + parse + ownership-scoped DELETE → `{ ok: true }` nebo 404.
- `deleteTrip(id)` v hook: fetch DELETE + `refetch()` po úspěchu.
- UI: Lucide `Trash2` button na každé trip kartě. Dvě-kliková konfirmace přes `confirmDeleteId` state (bez `window.confirm` — čisté React state pattern). Po potvrzení: `onActiveTripChange(null)` + `onTripDelete()` callback.

**Odchylky:** `hooks/useTrips.ts` má 38 řádků — přesahuje 25-ř. limit pro getter hooks. Klasifikováno jako kompoziční hook (agreguje `createTrip`, `renameTrip`, `deleteTrip`, `refetch` — 4 async operace). Platí 120-ř. kompoziční výjimka. Inline confirm state místo `window.confirm` dle zadání — čistší UX (červené zbarvení + tooltip bez browser dialogu).

---

## v10 — Rozšíření AI plánovače tras (plný záznam — přesunuto z RELEASE_NOTES.md 2026-04-22)

> Datum: 2026-04-22 | Branch: main | Verze: v10.1 + v10.3 + v10.2

### Status: ✅ Success

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `hooks/useTripLayer.ts` | CREATE | 57 | 60 |
| `lib/db/trips-repository.ts` | MODIFY | 52 | 60 |
| `app/api/trips/[id]/route.ts` | CREATE | 30 | 40 |
| `app/api/trips/[id]/export/route.ts` | CREATE | 42 | 40+2 |
| `hooks/useTrips.ts` | MODIFY | 33 | — |
| `components/TripPanel.tsx` | MODIFY | 91 | — |
| `app/page.tsx` | MODIFY | ~245 | — |

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅. `pnpm drizzle-kit push` není potřeba — žádné změny schématu.

**v10.1 — Vizualizace trasy na mapě:** Nový hook `hooks/useTripLayer.ts` spravuje Leaflet vrstvu pro aktivní výlet. Při změně `activeTripId` fetchuje `/api/trips/[id]/waypoints` a vykreslí polyline (oranžová, dasharray) + circle markery. Re-fetchuje také při změně `waypointStatus`. Klik na waypoint marker → `setSelectedPeak()` pokud má `locationId` v `locationIdToPeak` mapě. `tripLayerRef` a `locationIdToPeak` přidány do `app/page.tsx`.

**v10.3 — Přejmenování výletu:** `updateTrip(id, userId, patch)` a `getTripById(id, userId)` přidány do `lib/db/trips-repository.ts`. `PATCH /api/trips/[id]` — auth-guard + ownership check přes userId v WHERE clause. `renameTrip(id, name)` v `hooks/useTrips.ts`. `TripPanel.tsx` — dvojklik na název → inline Input, blur/Enter potvrdí, Escape zruší.

**v10.2 — GPX export:** `GET /api/trips/[id]/export` — auth-guard, ownership check přes `getTripById`. GPX generace čistou string interpolací, XML escape přes lokální `escapeXml()`. `TripPanel.tsx` — tlačítko "Exportovat GPX" jako `<a download>` obal.

**Odchylky:** `export/route.ts` má 42 řádků (limit 40) — přidán `escapeXml()` helper pro bezpečnost XML výstupu. Waypoint click handler nevolá `e.stopPropagation()` (Leaflet events nemají standardní DOM API) — nevadí.

---

## v9.7 — Perzistence výběru oblastí + UX vylepšení filtru (plný záznam — přesunuto z RELEASE_NOTES.md 2026-04-22)

> Datum: 2026-04-22 | Branch: main | Verze: v9.7

### Status: ✅ Success

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `app/page.tsx` | MODIFY | 232 | — (orchestrátor) |
| `components/PeaksSidebar.tsx` | MODIFY | 205 | — (UI komponenta) |

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 29 routes. `pnpm drizzle-kit push` není potřeba — žádná změna DB schématu.

**Perzistence výběru oblastí:** `selectedAreaSlugs` persistováno do `localStorage["hory-area-filter"]` přes dedikovaný `useEffect`. Při inicializaci načítá slugy z localStorage s validací (Array.isArray + typeof === "string"). Druhý `useEffect` sanitizuje stav po načtení `dbAreas` — odstraní slugy, které v DB již neexistují (ochrana před obsoletními hodnotami). Vzor analogický k `hory-basemap` v `UserSettingsPanel.tsx`.

**Tlačítko "Zobrazit vše":** Nový prop `onClearAreaFilter: () => void` v `PeaksSidebarProps`. Podmíněně renderovaný button s ikonou `X` (Lucide) uvnitř FilterSection "Oblasti DB". Viditelný pouze pokud `selectedAreaSlugs.length > 0`. Volá `handleClearAreaFilter()` v orchestrátoru → `setSelectedAreaSlugs([])`.

**Počet viditelných vrcholů:** Nový prop `filteredCount: number` předán z `app/page.tsx` (délka `areaFilteredPoints`). Zobrazen jako badge nad vyhledávacím polem. Formát: label "Vrcholy" + číslo ve `rounded-full bg-zinc-100` badge.

**Odchylky:** Žádné. Všechna akceptační kritéria splněna.

---

## v9.6 — Filtrování vrcholů podle oblasti v UI (plný záznam — přesunuto z RELEASE_NOTES.md 2026-04-22)

> Datum: 2026-04-22 | Branch: main | Verze: v9.6

### Status: ✅ Success

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `app/api/areas/route.ts` | CREATE | 28 | 50 |
| `lib/db/locations-area-repository.ts` | CREATE | 27 | 60 |
| `hooks/useAreas.ts` | CREATE | 16 | 25 |
| `lib/types.ts` | MODIFY | 11 | — |
| `app/api/peaks/route.ts` | MODIFY | 37 | 50 |
| `hooks/useDataFetching.ts` | MODIFY | 228 | 120 (kompoziční výjimka) |
| `components/PeaksSidebar.tsx` | MODIFY | 190 | — (UI komponenta) |
| `app/page.tsx` | MODIFY | 205 | — (orchestrátor) |

**Technical Audit:** `pnpm tsc --noEmit` 0 chyb. `pnpm build` ✅ — 29 routes. `pnpm drizzle-kit push` není potřeba — žádná změna DB schématu.

**Backend:** `GET /api/areas` — veřejný endpoint, vyhledává modul `mountains` dle slug, vrací `{ areas: AreaRow[] }`. `lib/db/locations-area-repository.ts` — `getLocationsByArea(moduleId, areaSlug)` (server-side filtr, pro budoucí použití) + `getLocationAreaSlugsMap(moduleId)` (JOIN `location_areas`+`areas`, vrací `Map<locationId, slug[]>`). `GET /api/peaks` rozšířen — volá `getLocationAreaSlugsMap` paralelně s `getAllLocations`, přiřazuje `areaSlugs: string[]` ke každé lokaci.

**Frontend:** `MapPoint` typ rozšířen o `areaSlugs?: string[]`. `hooks/useAreas.ts` — SWR getter hook bez write operací (vzor z v9.1). `app/page.tsx` — `selectedAreaSlugs: string[]` state, `useAreas()` hook, `areaFilteredPoints` (useMemo, client-side OR filtr), `handleToggleAreaSlug` helper. `areaFilteredPoints` předán do `useChallenges` jako `allPoints`. `PeaksSidebar.tsx` — nový `FilterSection` s id `db-areas`, checkboxy oblastí z DB, renderuje se pouze pokud `dbAreas.length > 0`.

**Odchylky:** Žádné. Client-side filtr dle doporučení architekta. `areaSlugs` vloženy do `/api/peaks` odpovědi (eliminuje extra round-trip).

---

> Starší verze (V1–V26a, TD-cleanup, v8.5, v8.6, v8.6.1, v8.7, TD-build, v9.1, v9.2, v9.3, v9.4, v9.5, TD-orphan, TD-schema-uc, Fáze 9.4) jsou trvale archivovány. Archiv udržuje pouze posledních 5 verzí.
