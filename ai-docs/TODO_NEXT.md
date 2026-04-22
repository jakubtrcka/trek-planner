# TODO_NEXT.md — Zadání pro [[ai-docs/CODER|Codera]]
> Vytvořil: [[ai-docs/ARCHITECT|Lead Architect]] | Aktualizováno: 2026-04-22 (rev. 26)

---

## Aktuální priorita: v13 — Nový modul Zámky (první rozšíření platformy)

**Strategický pivot (schváleno Architektem 2026-04-22):**
Projekt se přeorientovává na multi-modulární POI platformu. Manuální plánování tras (TripPanel, RoutesSidebar) zůstává v kódu, ale nedostává žádné nové investice. Budoucí plánování tras půjde výhradně přes AI asistenta (ChatPanel). Bezprostřední priorita je rozšiřování platformy o nové POI moduly a evidence návštěv.

---

### v13 — Nový modul: Zámky

**Cíl:** Přidat druhý POI modul (Zámky) a tím ověřit modulární architekturu v praxi. Modul musí prokázat, že stávající DB schéma, provider vrstva a visit tracking fungují genericky — bez úprav core platformy.

#### v13.1 — DB seed: modul `castles`
- `lib/db/seed.ts` rozšířit o idempotentní insert pro modul `castles` (slug: `castles`, name: `Zámky`, icon: `castle`).
- Přidat `location_type` pro `castle` (module_id = castles modul).
- Vzor: kopírovat stávající `mountains` seed blok. `onConflictDoUpdate` pattern povinný.

#### v13.2 — Provider `providers/castles/`
- Nový provider adresář: `providers/castles/`.
- `CastlesParserService.ts` — **bez Playwright**. Parsuje lokální soubor `/export.geojson` (OSM Overpass export, ODbL licence).
- **GeoJSON schéma:**
  - `features[].type === "Feature"`
  - `features[].geometry.type` je `"Polygon"` nebo `"Point"` (OSM relation/way/node). Pro souřadnice: pokud `geometry.type === "Point"` → `coordinates[0], coordinates[1]`; pokud `"Polygon"` → centroid z `coordinates[0]` (průměr bodů polygonu) nebo první bod `coordinates[0][0]`.
  - `features[].properties`: `name` (string), `historic` (hodnota `"castle"` nebo jiná), `website` (string | undefined), `wikidata` (string | undefined), `opening_hours` (string | undefined), `"@id"` (string, formát `"relation/18139"` nebo `"way/..."` nebo `"node/..."` — použít jako `external_id`).
- Výstup: pole objektů kompatibilní s `locations` upsert schématem (`name`, `lat`, `lon`, `external_id`, `external_url`, `metadata`).
  - `external_id` = hodnota `properties["@id"]` (např. `"relation/18139"`)
  - `external_url` = `properties.website` (pokud existuje) nebo `https://www.openstreetmap.org/<@id>`
  - `metadata` JSONB = `{ wikidata, opening_hours, historic }` (vynechat undefined hodnoty)
  - Filtrovat features bez `name` nebo bez souřadnic.
- **Vzor parseru:** jednoduchý `fs.readFileSync` + `JSON.parse` — bez Playwright.

#### v13.3 — Sync API route pro Zámky
- `POST /api/sync-castles` (admin-only) — stejný pattern jako `/api/sync-peaks`.
  - Volá `CastlesParserService.parse()` (čte `/export.geojson` ze server-side file systému).
  - **Pozor:** `export.geojson` je v project rootu (`/export.geojson` relativně od CWD procesu Next.js). Použít `path.resolve(process.cwd(), 'export.geojson')` nebo `path.join(__dirname, '../../../export.geojson')` — ověřit cestu při implementaci.
- Tlačítko "Sync Zámky" v `AdminPanel.tsx`.
- `GET /api/castles` (veřejný endpoint) — vrací lokality modulu `castles`.

#### v13.4 — Visit tracking pro Zámky
- Ověřit, že `POST /api/user-visits` a `DELETE /api/user-visits/[locationId]` fungují genericky pro `castles` lokality (měly by — používají `location_id` UUID, ne modul-specifické klíče).
- `CastleDetail.tsx` — detail komponenta analogická `PeakDetail.tsx`. Musí podporovat check-in tlačítko pro přihlášené uživatele.
- Vzor: `components/PeakDetail.tsx`.

#### v13.5 — Mapová vrstva Zámky
- `hooks/useDataFetching.ts` rozšířit o fetch `/api/castles` (paralelně s `/api/peaks`).
- `app/page.tsx` — renderovat `castles` body na mapě jako samostatnou vrstvu (odlišná barva/ikona od hor).
- Layer toggle pro modul Zámky (zapnout/vypnout vrstvu).

---

### Deprioritizováno (nemazat, neinvestovat)

- **Manuální plánování tras** — TripPanel, RoutesSidebar, waypoint management (v10–v12) jsou kompletní a funkční. Žádné nové featury do těchto komponent.
- **Waypoint přidávání z mapy** (původní kandidát v13) — odloženo indefinitně.

---

### Pending (neblokující)

#### TD-19-manual: Ruční DB krok
`pnpm drizzle-kit push --force` v TTY pro drop `hory_ascents_cache` z DB. Stále čeká, není blokující pro vývoj.

---

## ✅ Uzavřené verze

- **v12** — Trips UX: RoutesSidebar verifikace (plně funkční, není stub). Odebrání waypointu (DELETE route + repository + X tlačítko s inline confirm). Řazení waypointů (PATCH route + reorder repository + šipky nahoru/dolů). TS 0 chyb. Build OK.
- **v21** — Split `app/page.tsx` (187 ř. z 2772 ř.), 18 nových souborů.
- **v22** — TD-22a: Split `lib/page-types.ts` a `lib/page-utils.ts` do doménových modulů. Všechny `lib/` soubory ≤60 ř. TS 0 chyb. Build OK.
- **v23** — Fáze 8.1 + 8.2: Public `/api/peaks` endpoint ověřen. Odstraněn bootstrap auto-login. Mapa se načítá bez přihlášení z veřejného endpointu.
- **v24** — TD-24a: File cache vrstva odstraněna. `map-points` čte výhradně z DB (GET). `sync-peaks` spouští live scrape → upsert do DB. TS 0 chyb.
- **v25a** — TD-24b: Konsolidace `map-points` → `peaks`. `loadCachedPeaksForCountries` volá `/api/peaks`. `app/api/map-points/` smazán. TS 0 chyb.
- **v25b** — Fáze 8.3: `AuthModal` (Dialog, zod, Better Auth). `AppHeader` trigger. `app/api/auth-state/` smazán. TS 0 chyb. Build OK.
- **v26a** — Fáze 8.4: `useUserAscents` SWR conditional fetching dle session. `/api/user-ascents` se nevolá bez přihlášení. TS 0 chyb. Build OK.
- **TD-cleanup** — `LoginScreen.tsx` vyčištěn: odstraněny stale `username`/`password` props a form. TS 0 chyb. Build OK.
- **v8.5** — Nastavení modulu Hory: `SettingsModal.tsx` sekce credentials, `useHoryCredentials` hook (fetch/validate/save), `GET+POST /api/user/settings`, AES-256-GCM `lib/crypto.ts`. TS 0 chyb. Build OK.
- **v8.6** — Admin panel `/admin`: `app/(admin)/admin/page.tsx` (Server Component, email allowlist via `ADMIN_EMAILS` env, redirect na `/`), `components/AdminPanel.tsx` (3 tlačítka: Sync Vrcholy, Sync Výzvy, Sync Oblasti=disabled). TS 0 chyb.
- **v8.6.1** — Bugfix: přihlašovací dialog nešel vyplnit. Příčina: Leaflet z-index (až 700) překrýval dialog (z-50) + broken OKLCH Tailwind třídy. Fix: `isolate` na map wrapper v `app/page.tsx`, `z-[1100]` pro dialog overlay/content, OKLCH třídy nahrazeny standardními Tailwind třídami v `components/ui/dialog.tsx`.
- **v8.7** — Sync výstupů při přihlášení: `onLoginSuccess` callback v `AuthModal` → `AppHeader` → `app/page.tsx`. Volá `loadUserAscents(true)` (POST `/api/user-ascents`). TD-build uzavřen.
- **v9.1** — Fáze 9.1: Check-in mechanismus. `POST /api/user-visits`, `DELETE /api/user-visits/[locationId]`, `lib/db/visits-checkin-repository.ts`. Tlačítko v `PeakDetail.tsx`. TS 0 chyb. Build OK.
- **v9.2** — Fáze 9.2: Visit statistiky v UI. `GET /api/user-visits`, `hooks/useUserVisits.ts`, zobrazení check-in count v `PeakDetail.tsx`. TS 0 chyb. Build OK.
- **v9.4** — Konsolidace nastavení na `/admin`. `UserSettingsPanel.tsx`. `HoryUserService` login přepsán. Seed idempotence fix. `externalId` propagace + UPSERT fix.
- **TD-orphan** — `components/SettingsModal.tsx` smazán. TS 0 chyb. Build OK.
- **v9.3** — Fáze 9.3: `GET /api/user/challenges`, `lib/db/user-challenges-repository.ts`, `hooks/useUserChallenges.ts`. Badge "Splněno" v `ChallengesContent.tsx`. TS 0 chyb. Build OK.
- **TD-schema-uc** — Unique index `user_challenges(userId, challengeId)`. `upsertUserChallenge` přepsán na `onConflictDoUpdate`. `pnpm drizzle-kit push` propagováno. TS 0 chyb. Build OK.
- **v9.4** — Fáze 9.4: `areas` + `location_areas` tabulky v schema. `lib/db/areas-repository.ts`. `POST /api/sync-areas` (admin-only). Tlačítko "Sync Oblasti" aktivováno. TS 0 chyb. Build OK.
- **v9.5** — Fáze 9.5: Linkování oblastí k vrcholům při sync. `slugFromSource()`, `areaSlugByLatLon` map, `linkLocationBySlug`. Response obsahuje `linked` count. TS 0 chyb. Build OK.
- **v9.6** — Fáze 9.6: Filtrování vrcholů podle oblasti v UI. `GET /api/areas`, `lib/db/locations-area-repository.ts`, `hooks/useAreas.ts`. `MapPoint.areaSlugs` rozšíření. `/api/peaks` obohacen o `areaSlugs`. `PeaksSidebar` sekce "Oblasti DB". Client-side filtr přes `useMemo`. TS 0 chyb. Build OK.
- **v9.7** — Perzistence výběru oblastí (`localStorage["hory-area-filter"]`), sanitizace obsoletních slugů po načtení dbAreas, tlačítko "Zobrazit vše" (Zrušit filtr), `filteredCount` badge nad vyhledávacím polem. TS 0 chyb. Build OK.
- **v11** — Trips UX: v11.1 verifikace AI summary persistence (fungovala správně, `refetch()` po generate). v11.2 smazání výletu — `deleteTrip` v repository, `DELETE /api/trips/[id]`, `deleteTrip` hook, Trash2 button s inline confirm v TripPanel, `onTripDelete` callback. TS 0 chyb. Build OK.
- **v10** — Rozšíření AI plánovače tras: v10.1 vizualizace trasy (useTripLayer, polyline + markery), v10.3 přejmenování výletu (inline edit, PATCH /api/trips/[id]), v10.2 GPX export (GET /api/trips/[id]/export). TS 0 chyb. Build OK.

---

## Pending (neblokující)

### TD-19-manual: Ruční DB krok
`pnpm drizzle-kit push --force` v TTY pro drop `hory_ascents_cache` z DB. Stále čeká, není blokující pro vývoj.

---

## Poznámky architekta

- Mutační pattern (v9.1) je závazný: mutace v `page.tsx`, hooks jsou čisté gettery.
- `detail.ts` (244 ř.) v `providers/hory/challenges/` — trvalá výjimka pro `page.evaluate()` blok.
- `lib/` struktura je připravena pro další moduly — každý modul dostane vlastní `lib/<modul>/types.ts`.
- `app/(admin)` — bez samostatného layoutu, Server Component ověřuje session před renderem.
- Admin role check je přes `ADMIN_EMAILS` env allowlist (ne DB role). Granulární role = samostatný mileston.
- GPX generace: bez externích knihoven — čistá string interpolace (žádná závislost navíc).
