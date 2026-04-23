# PROJECT_CONTEXT: Trek Planner

## 🎯 Cíl projektu: Modulární POI Platforma
Univerzální systém pro správu a vizualizaci bodů zájmu (POI) s mapocentrickým rozhraním. Projekt je koncipován jako platforma, kde jednotlivé vertikály (hory, zámky, pivovary atd.) tvoří samostatné moduly.

### 👥 Uživatelské role a přístupy

#### 🌍 Nepřihlášený návštěvník (public)
* Vidí celou mapu s načtenými lokalitami ze všech aktivních modulů (data z DB, bez přihlášení).
* Vidí přehled výzev bez osobního plnění.
* Nemá přístup k osobním statistikám ani nastavení modulů.

#### 👤 Přihlášený uživatel
* Vidí vše jako návštěvník +
* Svá navštívená místa (check-iny) a progres ve výzvách — načítá se po přihlášení.
* Může propojit svůj účet s externími zdroji (např. hory.app) — přihlašovací údaje se uloží šifrovaně do `user_module_settings`. Při každém přihlášení do Trek aplikace se automaticky synchronizují jeho výstupy.
* Plánování tras a správa výletů (trips).

#### 🔧 Administrátor
* Spravuje datové zdroje (Providery) přes admin panel.
* Spouští aktualizační cykly: **Oblasti**, **Vrcholy**, **Výzvy** — přes dedikovaná tlačítka v admin UI.
* Adminovské credentials pro hory.app jsou uloženy v `.env` (ne v DB) a slouží výhradně pro seed/sync operace, nikoli pro uživatelský přístup.

### 🗺️ UI/UX Koncept: Map-First & Layers
* **Jádro aplikace:** Hlavní obrazovka (Homepage) je tvořena celoplošnou interaktivní mapou — **dostupnou bez přihlášení**.
* **Lokalita (POI):** Základní datová jednotka reprezentovaná bodem na mapě. Lokality se dělí na typy (hory, zámky, pivovary...).
* **Modulární systém:** Každý typ lokality je z pohledu architektury samostatný modul.
* **Vrstvení (Layering):** Uživatel vidí na mapě agregovaná data ze všech modulů. V rozhraní má možnost jednotlivé moduly (vrstvy) dynamicky zapínat a vypínat.

### ⚙️ Architektura Backendových modulů
Backend využívá **vícevrstvý model** se striktní standardizací objektu "Lokalita":
1.  **Databázová vrstva (primární zdroj dat):** Všechna data o lokalitách jsou uložena v PostgreSQL a slouží jako primární zdroj pro frontend — bez nutnosti přihlášení nebo scrapingu za běhu aplikace.
2.  **Provider Layer:** Zapouzdřená logika pro specifické externí zdroje dat.
    * **Seed:** Prvotní naplnění lokální databáze z externího zdroje (spouští admin).
    * **Sync:** Mechanismus pro pravidelnou aktualizaci existujících dat (spouští admin).
3.  **Standardizace:** Aplikace komunikuje s lokalitami přes jednotné rozhraní. Specifika jednotlivých zdrojů (formát dat, způsob scrapingu) jsou izolována uvnitř konkrétních providerů.

### 🔐 Oddělení přihlášení
| Typ | Kde uloženo | K čemu slouží |
|---|---|---|
| Admin credentials (hory.app) | `.env` | Seed/sync DB — spouští se z admin panelu |
| User credentials (hory.app) | `user_module_settings` (šifrovaný JSONB) | Synchronizace osobních výstupů uživatele při přihlášení |
| Trek účet | Better Auth DB | Přihlášení do Trek aplikace, správa sessions |

- **Lokalita:** Česko, Slovensko.
- **Klíčová funkce:** Modulární body zájmu na mapě, evidence návštěv, výzvy, AI plánování tras.

---

## 🛠 Technologický Stack (STRICT)
Agenti nesmí používat jiné verze nebo knihovny bez schválení:
- **Framework:** Next.js 15.2+ (App Router, React 19)
- **Jazyk:** [[ai-docs/skills/typescript|TypeScript 5.7+ (Strict Mode: ON)]]
- **DB & ORM:** PostgreSQL 16 + [[ai-docs/skills/database|Drizzle ORM]]
- **Auth:** [[ai-docs/skills/database|Better Auth 1.6+]] (`better-auth`, `better-auth/adapters/drizzle`)
- **UI:** Tailwind CSS 4, shadcn/ui, Lucide Icons
- **Scraping:** [[ai-docs/skills/scraping|Playwright 1.54+]]
- **Mapy:** Leaflet 1.9 + Maplibre-GL
- **AI:** Vercel AI SDK + Google Gemini 2.0 Flash


---

## 🧭 Strategický pivot (schváleno 2026-04-22)

### Multi-modulární POI platforma — prioritní směr
Projekt se přeorientoval z "hory + plánování tras" na **generickou platformu pro POI moduly s evidencí návštěv**. Každý modul (Hory, Zámky, Pivovary…) je rovnocenný: vlastní provider/scraper, vlastní mapová vrstva, plnohodnotný visit tracking.

### Plánování tras — AI-first, manuální UX zmrazeno
- **Manuální plánování** (TripPanel, RoutesSidebar, waypoint management): **zmrazeno**. Kód zůstává funkční (v10–v12), ale nedostává žádné nové investice.
- **AI-first plánování**: Budoucí milestone. Trasy budou plánované přes AI asistenta (ChatPanel + Gemini). Manuální UI slouží jako fallback / referenční implementace — ne jako primární UX.

### Přidávání nových modulů — architektonický vzor
1. `lib/db/seed.ts` — idempotentní seed pro nový modul + location_type.
2. `providers/<modul>/` — scraper service (Playwright) + Zod schémata.
3. `POST /api/sync-<modul>` (admin) + `GET /api/<modul>` (veřejný) — analogie `/api/sync-peaks` a `/api/peaks`.
4. `components/<Modul>Detail.tsx` — detail POI s check-in tlačítkem.
5. Mapová vrstva — fetch + vrstvení v `app/page.tsx`, layer toggle.
Stávající visit tracking (`user_visits`, `/api/user-visits`) je generický — funguje pro jakýkoli `location_id` bez změn.

---

## 🗺 Roadmapa (Aktuální fáze)
- [x] **Fáze 0-3:** Setup, Migrace, Auth UI, Přepojení dat.
- [x] **Fáze 4:** Výzvy v DB.
  - [x] 15.1: Zod schémata v `providers/hory/schemas.ts`.
  - [x] 15.2: `challenges-repository.ts` (upsert/get).
  - [x] 15.3: Sync API route (seed z cache).
  - [x] 15.4: GET handler v `api/challenges/route.ts`.
  - [x] **15.5: Refaktor (Fáze 4b)** — Extrakce Playwright scrapingu do `providers/`.
  - [x] **Fáze 4c (TD-1):** Split `HoryChallengesService.ts` (1366 ř.) do sub-modulů.
- [x] **Fáze 5:** Plánování tras + AI asistent s persistencí.
  - [x] 17.1: `lib/db/trips-repository.ts`
  - [x] 17.2: `app/api/trips/route.ts` (GET + POST)
  - [x] 17.3: `app/api/trips/[id]/waypoints/route.ts`
  - [x] 17.4: `app/api/trips/[id]/ai-summary/route.ts` (Gemini 2.0 Flash)
  - [x] REFIX 17.5: `addWaypoint()` ukládá název lokality
  - [x] 18.1–18.3: Trips UI (`useTrips`, `TripPanel`, integrace mapy)
- [x] **Fáze 6:** Cleanup mrtvého kódu.
  - [x] 19.1: Opravit `catch {}` v `TripPanel.tsx:37`
  - [x] 19.2: Smazat `horyAscentsCache` z DB schématu (RUČNÍ: `drizzle-kit push --force` v TTY)
  - [x] 19.3: Smazat `data/points-cache/user-ascents.json`
- [x] **Fáze 7:** Split `app/page.tsx` (2772 ř.) do kompozitních komponent.
  - [x] 21.1: Závislostní analýza a extrakce `MapContainer`, `ChatPanel`, `SearchFilter`, `LayerToggle`.
  - [x] 21.2: `app/page.tsx` jako orchestrátor ≤ 150 ř. (187 ř. — akceptovaná odchylka)
- [ ] **Fáze 8:** Refaktor auth modelu — Public-first architektura.
  - [x] 22.x: TD-22a: Split `lib/page-types.ts` a `lib/page-utils.ts` *(prerekvizita splněna)*
  - [x] 8.1: Mapa načítá lokality z DB bez přihlášení (`/api/peaks` — veřejné endpoint).
  - [x] 8.2: Odstranění bootstrap auto-loginu z `useDataFetching` — přihlášení není podmínkou startu.
  - [x] 8.3: Login/Register UI (Better Auth) — `AuthModal` (shadcn Dialog + zod + Better Auth). Trigger v `AppHeader`. `app/api/auth-state/` smazán. `app/api/map-points/` konsolidován do `/api/peaks` (TD-24b).
  - [x] 8.4: Po přihlášení se načtou uživatelské výstupy (`user_visits`) a progres výzev.
  - [x] 8.5: Nastavení modulu Hory — uživatel zadá svoje hory.app credentials, uloží se do `user_module_settings` (šifrovaně).
  - [x] 8.6: Admin panel — stránka `/admin` (chráněná rolí), tlačítka pro Sync Oblasti / Vrcholy / Výzvy.
  - [x] 8.7: Sync výstupů spouštěný přihlášením uživatele. `onLoginSuccess` callback chain: `AuthModal` → `AppHeader` → `app/page.tsx` → `loadUserAscents(true)`. Výzvy jsou globální admin data — synced přihlášením uživatele záměrně vynechány.
- [x] **Fáze 9.1 + 9.2:** Check-in mechanismus (`user_visits`) + Visit statistiky v UI.
  - [x] `lib/db/visits-checkin-repository.ts` — `upsertVisit`, `deleteVisit`, `findLocationIdByExternalId`.
  - [x] `POST /api/user-visits` — Zod validace, auth-guard, upsert visit.
  - [x] `DELETE /api/user-visits/[locationId]` — auth-guard, lookup + delete, 404 pokud neexistuje.
  - [x] `PeakDetail.tsx` — tlačítko check-in/odebrat pro přihlášené uživatele s `isPending` stavem.
  - [x] `app/page.tsx` — `handleVisitChange` volá POST/DELETE a `mutateAscents()`.
- [x] **Fáze 9.2:** Visit statistiky v UI.
  - [x] `getUserVisits(userId)` přidán do `visits-repository.ts` — vrací všechny check-iny uživatele, keyed by `externalId`.
  - [x] `GET /api/user-visits` — vrací `{ visits: UserVisitEntry[] }` s auth-guardem.
  - [x] `hooks/useUserVisits.ts` — čistý getter hook (SWR conditional fetch dle session).
  - [x] `PeakDetail.tsx` — prop `userVisits: Map<string, VisitEntry>`, zobrazuje počet manuálních check-inů.
  - [x] `app/page.tsx` — `handleVisitChange` volá `Promise.all([mutateAscents(), mutateVisits()])`.
- [x] **v9.3 Bugfixy:** HoryUserService Playwright bot-detection bypass, Label invisible text, modules seed.
- [x] **v9.4:** Konsolidace nastavení na `/admin`.
- [x] **TD-orphan + Fáze 9.3 (challenges progres):** `SettingsModal.tsx` smazán (byl nereferencovaný). `GET /api/user/challenges`, `lib/db/user-challenges-repository.ts`, `hooks/useUserChallenges.ts` vytvořeny. Badge "Splněno" (amber) v `ChallengesContent.tsx` — zobrazena pro DB-sourced challenges (integer id). `app/page.tsx` orchestruje `useUserChallenges()` a předává `completedChallengeIds: Set<number>` do `ChallengesContent`.
- [x] **TD-schema-uc:** Unique index `user_challenges(userId, challengeId)` přidán do schématu. `upsertUserChallenge` přepsán na `onConflictDoUpdate` pattern (vzor z `user_visits`). `pnpm drizzle-kit push` propagováno bez konfliktů.
- [x] **Fáze 9.4 — Sync Oblasti:** `areas` + `location_areas` tabulky v schema. `lib/db/areas-repository.ts` (`getAreas`, `upsertArea`, `linkLocationToArea`, `unlinkAllAreasFromLocation`). `POST /api/sync-areas` (admin-only, volá `HoryScraperService.scrapeRanges()`). Tlačítko "Sync Oblasti" aktivováno v `AdminPanel.tsx`.
- [x] **Fáze 9.5 — Linkování oblastí k vrcholům při sync:** `slugFromSource()` extrahuje area slug z `p.source` (URL rangu). `areaSlugByLatLon` map mapuje lat:lon → area slug. Po `upsertLocations` volá `linkLocationBySlug(moduleId, slug, id)` pro každý upserted peak se známým slugem. `linkLocationBySlug` přidán do `areas-repository.ts`. Sync response obsahuje `linked` count. TS 0 chyb. Build OK.
- [x] **v9.6 — Filtrování vrcholů podle oblasti v UI:** `GET /api/areas` (veřejný endpoint). `lib/db/locations-area-repository.ts` (`getLocationsByArea`, `getLocationAreaSlugsMap`). `GET /api/peaks` enrichován o `areaSlugs: string[]` per lokaci (JOIN s `location_areas`+`areas`). `MapPoint` typ rozšířen o `areaSlugs?: string[]`. `hooks/useAreas.ts` (SWR getter). `app/page.tsx` — `selectedAreaSlugs` state, `areaFilteredPoints` (useMemo, client-side OR filtr). `PeaksSidebar.tsx` — `FilterSection` s checkboxy oblastí (renderuje se jen pokud `dbAreas.length > 0`).
- [x] **v10 — Rozšíření AI plánovače tras:**
  - [x] v10.1: `hooks/useTripLayer.ts` (57 ř.) — Leaflet polyline + circle markery pro aktivní výlet. Klik na waypoint marker → `setSelectedPeak()`.
  - [x] v10.3: `PATCH /api/trips/[id]` — ownership check, inline přejmenování v `TripPanel.tsx` (dvojklik → Input, blur/Enter/Escape).
  - [x] v10.2: `GET /api/trips/[id]/export` — GPX generace čistou string interpolací, `escapeXml()` helper, `<a download>` v UI.
- [x] **v11 — Trips UX: Persist AI itinerář + Smazání výletu:**
  - [x] v11.1: Formální verifikace persistence AI summary — `updateTripAiSummary` + `refetch()` po úspěchu. Žádná změna kódu potřeba.
  - [x] v11.2: `deleteTrip(id, userId)` v repository (ownership guard, kaskádové smazání waypoints přes FK). `DELETE /api/trips/[id]` handler. `deleteTrip(id)` v `hooks/useTrips.ts`. UI: `Trash2` tlačítko s dvě-klikovou konfirmací přes `confirmDeleteId` state (bez `window.confirm`).
- [x] **v12 — Trips UX: RoutesSidebar verifikace + Odebrání waypointu + Řazení waypointů:**
  - [x] v12.1: Verifikace `RoutesSidebar.tsx` (87 ř.) — plně funkční, aktivně renderovaná pro `activeModule === "routes"`. Není stub.
  - [x] v12.3: Odebrání waypointu — `deleteWaypoint(tripId, userId, waypointId)` v `trips-waypoints-repository.ts`, `DELETE /api/trips/[id]/waypoints/[waypointId]`, tlačítko X s inline `confirmWpDeleteId` konfirmací v `TripPanel.tsx`.
  - [x] v12.2: Řazení waypointů — `reorderWaypoints(tripId, userId, orderedIds)` (DB transaction, ownership check), `PATCH /api/trips/[id]/waypoints`, tlačítka ChevronUp/Down v `TripPanel.tsx`, `waypointStatus` counter jako trigger `useTripLayer` re-fetch.
  - [x] `hooks/useTripWaypoints.ts` — nový getter hook (19 ř.), `{ waypoints, refetch }`, `useCallback + useEffect` pattern.
- [x] **v9.7 — Perzistence výběru oblastí + UX vylepšení filtru:** `selectedAreaSlugs` persistováno do `localStorage["hory-area-filter"]`. Při inicializaci načítá slugy z localStorage a validuje je (Array.isArray + typeof check). Druhý `useEffect` sanitizuje stav po načtení `dbAreas` — odstraní obsoletní slugy. Nový prop `onClearAreaFilter: () => void` v `PeaksSidebarProps` — podmíněně renderované tlačítko "Zobrazit vše" s ikonou X (Lucide), viditelné pouze pokud `selectedAreaSlugs.length > 0`. Nový prop `filteredCount: number` — badge "Vrcholy" + číslo nad vyhledávacím polem. Žádná změna DB schématu. `app/page.tsx` (232 ř.), `PeaksSidebar.tsx` (205 ř.).
- [x] **v13 + v14 — Modul Zámky:**
  - [x] v13.1: `lib/db/seed.ts` rozšířen o idempotentní seed pro modul `castles` (slug: `castles`, name: `Zámky`, icon: `castle`) a `location_type` `castle`.
  - [x] v13.2: `providers/castles/CastlesParserService.ts` — čte `export.geojson`, Zod discriminatedUnion pro Point/Polygon geometrie, centroid výpočet, `external_id` = `properties["@id"]`.
  - [x] v13.3: `POST /api/sync-castles` (admin-only, ADMIN_EMAILS pattern) + `GET /api/castles` (veřejný). `getAllLocationsByModule(moduleId)` v `locations-repository.ts`. `AdminPanel.tsx` + tlačítko "Sync Zámky".
  - [x] v13.4: `components/CastleDetail.tsx` — analogie `PeakDetail.tsx`. Check-in, souřadnice, otevírací doba, odkaz na zdroj. Sdílí `onVisitChange` mutaci z `page.tsx`.
  - [x] v13.5: `hooks/useCastles.ts` (SWR getter, 25 ř.) + `hooks/useCastleLayer.ts` (Leaflet layer, fialové circleMarkery, 48 ř.). Vrstva toggleovatelná tlačítkem.
  - [x] v14: `components/CastlesSidebar.tsx` jako plnohodnotný tab v levém menu (Castle ikona, analogie PeaksSidebar). Fulltext search, "Filtrovat podle mapy" checkbox (výchozí: zapnuto), flyTo zoom 14 při výběru.
  - [x] v14: Viditelnost bodů dle `activeModule`: `hory` → pouze vrcholy, `zamky` → pouze zámky, `routes`/`trips` → vše viditelné.
  - [x] v14: `GET /api/auth/is-admin` endpoint + `hooks/useIsAdmin.ts` (SWR). Settings ikona viditelná pouze pro `!!session && isAdmin`.
  - [x] v14: Clustering parametry zmírněny: `maxZoom` 14→10, `minPoints` 2→4, `radius` 60→55px.
- [x] **v15 — Zámky: Live Overpass sync:**
  - [x] v15: `CastlesScraperService.ts` — Overpass API scraper s bbox CZ+SK, `AbortController` 60s, Zod validace, `resolveCoords()` pro ways/relations.
  - [x] v15: `CastlesParserService.parseRaw()` — validační pass-through pro live data; `parse()` (GeoJSON file) zachována.
  - [x] v15: `POST /api/sync-castles` nyní volá live Overpass místo `export.geojson`.
- [x] **v15a — Unified clustering vrcholy + zámky:**
  - [x] `lib/map/clustering.ts` — `ClusterResult` discriminated union, `ClusterFeature.kinds: Set<PointKind>`, `computeClusters(TaggedInput[])`, helpers `tagPeaks()` a `tagCastles()`.
  - [x] `hooks/useMapEffects.ts` — přijímá `castlePoints: CastlePoint[]` a `showCastles: boolean`, unified rendering loop.
  - [x] `hooks/useCastleLayer.ts` deprecated jako no-op stub (3 ř.) — rendering přesunut do `useMapEffects`.
- [x] **v15b — Filtr vrcholů jako collapsible panel:**
  - [x] `showPeakFilter: boolean` state, `SlidersHorizontal` toggle, `activeFilterCount` badge.
  - [x] `PeaksSidebar` prop `showFilter: boolean` — FilterSection se skryje při `false`.
- [x] **v15c — AI chat jako floating window:**
  - [x] `ChatPanel` interní `expanded: boolean`, mini (`w-72`) ↔ expanded (`w-[420px]`) stav, horizontální střed (`left-1/2 -translate-x-1/2`), `z-[850]`.
  - [x] `<ChatPanel>` přesunut do mapové oblasti div (mapa využívá plnou šířku v mini stavu).
- [x] **v15d — UI opravy:**
  - [x] Panel toggle konsolidován na `ChevronDown` v icon baru (200ms animace), `border-r` fix, logo odstraněno, legenda Zámky odstraněna.
  - [x] `invalidateSize()` s 210ms zpožděním po změně `isModulePanelOpen` — Leaflet přepočítá rozměry.

---

## Technická Specifika projektu

### Admin panel (přepracován v9.4)
- **`app/(admin)/admin/page.tsx`:** Server Component. Redirect pouze pro **nepřihlášené** uživatele (dříve redirect pro non-adminy). Přihlášení vidí `UserSettingsPanel`. Admin check přes email allowlist v env `ADMIN_EMAILS` (comma-separated) — admini vidí navíc `AdminPanel`. DB schema `users` neobsahuje pole `role`, Better Auth admin plugin není nakonfigurován. Přidán odkaz "← Zpět na mapu".
- **`components/AdminPanel.tsx`:** Client Component (71 ř.), čistý `useState`. Čtyři tlačítka: **Sync Vrcholy** (`POST /api/sync-peaks`), **Sync Výzvy** (`POST /api/sync-challenges`), **Sync Oblasti** (`POST /api/sync-areas`), **Sync Zámky** (`POST /api/sync-castles`). Per-button stav: `idle | loading | success | error`.
- **`components/UserSettingsPanel.tsx`:** Client Component (nová v9.4). Dvě sekce: výběr podkladu mapy (`baseMap`, čte/zapisuje z `localStorage` klíč `hory-basemap`) a hory.app přihlašovací údaje (přes `useHoryCredentials`).

### Dialog z-index (opraveno v Verzi v8.6.1)
- **`app/page.tsx`:** Map wrapper má třídu `isolate` → vlastní stacking context, Leaflet panes (max `z-index: 700`) zůstanou uvnitř a nepřekrývají dialog.
- **`components/ui/dialog.tsx`:** Overlay i content mají `z-[1100]`. Tailwind OKLCH třídy (nefunkční syntaxe) nahrazeny standardními třídami (`bg-white`, `border-zinc-200`, `text-zinc-500` atd.).

### Šifrování uživatelských nastavení (od Verze v8.5)
- **`lib/crypto.ts`:** AES-256-GCM encrypt/decrypt. Klíč z env `SETTINGS_ENCRYPTION_KEY` (přesně 32 znaků). Formát ciphertextu: `ivHex:authTagHex:encryptedHex`.
- **`GET+POST /api/user/settings`:** Auth-guard přes `auth.api.getSession()`. Parametr `moduleSlug` určuje modul. POST šifruje a upsertuje do `user_module_settings`. GET vrací dešifrovaná data nebo `null`.
- **`hooks/useHoryCredentials.ts`:** Fetch credentials z GET na mount (jen přihlášení), zod validace, POST uložení. Výjimka 30 ř. (64 ř.) — sdružuje fetch + validate + async save + field setters + 3 stavové proměnné.

### Výjimky ze souborových limitů
- `detail.ts` (244 ř.) v `providers/hory/challenges/` má trvalou výjimku — obsahuje `page.evaluate()` blok (~160 ř. browser-side kódu), který nelze rozdělit přes hranice souborů. Akceptováno Architektem ve Verzi 20.
- `hooks/useMapEffects.ts` (224 ř.), `hooks/useDataFetching.ts` (228 ř.), `hooks/useChallenges.ts` (124 ř.) — kompoziční hooks s více efekty/operacemi, architektonicky odlišná kategorie od state/getter hooks. Akceptováno Architektem ve Verzi 21. `useMapEffects` rozšířen v15a o unified clustering (castlePoints + showCastles props).
- `components/ChallengesContent.tsx` (276 ř.) — 4 soudržné sub-komponenty v jednom souboru + prop `completedChallengeIds`. Akceptováno Architektem ve Verzi 21.
- `components/PeaksSidebar.tsx` (170 ř.) — soudržný celek. Akceptováno Architektem ve Verzi 21.
- `lib/page-types.ts` a `lib/page-utils.ts` — split dokončen v Verzi 22 (TD-22a). Typy a konstanty přesunuty do `lib/peaks/types.ts`, `lib/challenges/types.ts`, `lib/trips/types.ts`, `lib/map/constants.ts`, `lib/czech/alphabet.ts`, `lib/czech/osmismerka.ts`. Zbývající soubory ≤19 ř.
- `app/api/trips/[id]/waypoints/route.ts` (65 ř.) — výjimka 80 ř. Obsahuje 3 HTTP handlery (GET, POST, PATCH) a 2 Zod schémata — klasifikováno jako komplexní input soubor. Akceptováno v12.
- `providers/hory/HoryScraperService.ts` (962 ř.) — `extractClientSidePoints` obsahuje ~400 ř. `page.evaluate()` bloku (browser-side JS), který nelze rozdělit přes hranice souborů. Stejný precedent jako `detail.ts` (v20). Akceptováno jako trvalá výjimka (Verze 24).

### Specifika hory.app (Scraper)
- **Session Orchestrace (`HoryUserService.ts`)**: Přepsáno v9.4.4 vzorem fungujícího `HoryScraperService` — `fillFirstAvailable` s více selektory, `submitLogin` s Enter fallbackem, `Promise.race([waitForURL, waitForLoadState])`. Race condition fix (v8.7): `click()` odděleno od `waitForURL`, `waitUntil: "domcontentloaded"`, timeout 30 s, explicitní detekce chybového hlášení ze stránky. Bot-detection bypass z v9.3 odstraněn (v9.4.4) — nebyl potřeba po přepisu. Button selektor: `button[type="submit"], input[type="submit"]` (diacritika v Playwright `hasText` filtrech selhávala). Debug screenshots: `/tmp/hory-before-submit.png` a `/tmp/hory-login-fail.png`.
- **Persistence**: Ukládání session state pro zamezení opakovaným loginům.
- **Sub-moduly (od Verze 20):** `HoryChallengesService.ts` (107 ř., orchestrátor) + 8 sub-modulů v `providers/hory/challenges/`: `types.ts`, `login.ts`, `gpx.ts`, `peaks.ts`, `filters.ts`, `scraper.ts`, `detail.ts`, `cache.ts`. Veřejné API zachováno přes re-export.
- **Datový tok vrcholů (od Verze 24 — TD-24a):** `HoryScraperService (Playwright)` → `POST /api/sync-peaks` → `upsert do DB` → `GET /api/peaks`. File cache vrstva (`data/points-cache/all-peaks.json`, `all-peaks-si.json`) byla odstraněna. `data/points-cache/` adresář zachován pro `all-challenges.json`. **`/api/sync-peaks` — request.json() fallback (opraveno v9.4.3):** `AdminPanel` posílá POST bez těla; `request.json()` se zachytí přes `.catch(() => ({}))` — body je volitelné, schema dostane výchozí hodnoty.
- **`/api/map-points` — ODSTRANĚN (TD-24b, Verze 25a):** Konsolidován do `/api/peaks`. `hooks/useDataFetching.ts` volá výhradně `/api/peaks` pro čtení lokací. Mapování `locations[]` → `MapPointsResponse["points"]` provedeno inline.

### Check-in mechanismus (od Verze v9.1)
- **`lib/db/visits-checkin-repository.ts`** (34 ř.): Oddělena od `visits-repository.ts` (scrape-sync) kvůli 60-ř. limitu. Obsahuje `upsertVisit` (increment `count` při existujícím záznamu), `deleteVisit`, `findLocationIdByExternalId` (lookup DB `id` podle `externalId`).
- **`POST /api/user-visits`** (30 ř.): Zod validace (`locationId: string`, `visitedAt?: datetime`), auth-guard, externalId → locations.id lookup, upsert. Response: `{ ok, visit }`.
- **`DELETE /api/user-visits/[locationId]`** (25 ř.): Dynamic segment je `externalId`. Lookup + delete. 404 pokud záznam neexistuje.
- **`PeakDetail.tsx` check-in button:** Props `isLoggedIn: boolean` a `onVisitChange: (externalId, action) => Promise<void>`. Lokální `isPending` stav pro disable tlačítka. Viditelné pouze přihlášeným uživatelům s platným `externalId`. Stav reflektuje `ascent` z `userAscents` mapy.
- **Mutační pattern (závazný):** Mutace (`handleVisitChange`) zůstávají v `page.tsx`. Hooks jsou čisté gettery — nerozšiřovat o write operace.

### DB Schéma (Detailní rozpis)

#### Modul Systém & Konfigurace
- `modules`: `id` (UUID), `slug` (UNIQUE), `name`, `icon`, `description`. **Seed povinný:** `INSERT INTO modules (slug, name, icon) VALUES ('mountains', 'Hory', 'mountain')` — bez tohoto řádku vrací `POST /api/user/settings` 404. **Seed idempotence (opraveno v9.4.3):** `lib/db/seed.ts` používá `onConflictDoUpdate` (ne `onConflictDoNothing`) — zaručuje vrácení existujícího záznamu a pokračování do `location_types` insertu. `onConflictDoNothing().returning()` vracelo prázdné pole a přeskočilo navazující insert.
- `location_types`: `id`, `module_id` (FK), `slug`, `name`.
- `data_sources`: `id`, `module_id` (FK), `config` (JSONB: `targetUrl`, `countryCode`, `crawlRanges`).

#### Lokality (Standardizované POI)
- `locations`:
    - `id` (UUID), `type_id` (FK), `name`.
    - `lat`, `lon` (společný **UNIQUE INDEX** pro zamezení duplicit v prostoru).
    - `altitude`, `external_url`.
    - `external_id` (string): ID lokality v externím zdroji (např. číslo z URL hory.app `/mountain/(\d+)-`). Propagováno do DB přes `peakIdFromUrl()` v `sync-peaks/route.ts`. UPSERT conflict set používá `sql\`EXCLUDED.external_id\`` (opraveno v9.4.4 — dříve odkazovalo na existující NULL hodnotu sloupce).
    - `metadata` (JSONB): Modulárně specifická data (např. prominence u hor, otevírací doba u zámků).

#### Uživatelé a Personalizace
- `user_module_settings`: `user_id` (FK), `module_id` (FK), `settings` (Šifrovaný JSONB – auth tokeny, preference).
- `user_visits`: `user_id` (FK), `location_id` (FK), `visited_at`, `count`, `metadata` (JSONB). **INDEX UNIQUE** na dvojici (`user_id`, `location_id`).

#### Výzvy (Challenges)
- `challenges`: `id`, `module_id` (FK), `name`, `source_url` (UNIQUE), `metadata` (JSONB).
- `challenge_locations`: Propojovací tabulka mezi výzvou a lokalitami.
- `user_challenges`: `user_id`, `challenge_id`, `progress` (JSONB), `completed_at`. **UNIQUE INDEX na `(userId, challengeId)`** (přidán TD-schema-uc). `upsertUserChallenge` používá `onConflictDoUpdate` pattern (vzor z `user_visits`).

#### Oblasti (Areas)
- `areas`: `id` (UUID), `module_id` (FK), `slug` (UNIQUE per module), `name`, `source_url`, `metadata` (JSONB), timestamps. **UNIQUE INDEX na `(moduleId, slug)`.**
- `location_areas`: Propojovací M:N tabulka `locationId × areaId`. **UNIQUE INDEX na `(locationId, areaId)`** (= primární klíč vztahu). `unlinkAllAreasFromLocation(locationId)` zajišťuje čistý re-sync bez akumulace obsoletních vazeb.
- **`lib/db/areas-repository.ts` API:** `getAreas(moduleId)`, `upsertArea(...)`, `linkLocationToArea(locationId, areaId)`, `unlinkAllAreasFromLocation(locationId)`, `linkLocationBySlug(moduleId, slug, locationId)` (přidáno v9.5 — lookup area dle moduleId+slug, pak link). Soubor ≤60 ř.
- **`lib/db/locations-area-repository.ts` API (nové v9.6):** `getLocationsByArea(moduleId, areaSlug)` (server-side filtr, pro budoucí použití), `getLocationAreaSlugsMap(moduleId)` (JOIN `location_areas`+`areas`, vrací `Map<locationId, slug[]>`). Soubor ≤30 ř.
- **`GET /api/areas` (nové v9.6):** Veřejný endpoint (bez auth). Vyhledá modul `mountains` dle slug, vrací `{ areas: AreaRow[] }`. Soubor ≤30 ř.
- **`GET /api/peaks` enrichment (od v9.6):** Volá `getLocationAreaSlugsMap` paralelně s `getAllLocations`. Každé lokaci přiřazuje `areaSlugs: string[]`. `MapPoint` typ rozšířen o `areaSlugs?: string[]`.
- **Sync linkování (od v9.5):** `POST /api/sync-peaks` extrahuje slug z `p.source` URL rangu přes `slugFromSource()`. Buduje `areaSlugByLatLon` mapu (lat:lon → slug). Po upsert peaků volá `linkLocationBySlug` pro každý peak se známým slugem. Response obohacena o `linked` count.

#### Plánování (Trips)
- `trips`: `id`, `user_id` (FK), `name`, `notes`, `ai_summary` (text).
- `trip_waypoints`: `trip_id` (FK), `location_id` (FK), `lat`, `lon`, `order` (pro řazení trasy).
- **API routes (od v10, rozšířeno v11–v12):** `GET+POST /api/trips`, `GET+POST+PATCH /api/trips/[id]/waypoints` (GET waypoints, POST addWaypoint, PATCH reorder), `DELETE /api/trips/[id]/waypoints/[waypointId]`, `POST /api/trips/[id]/ai-summary`, `PATCH /api/trips/[id]` (rename, ownership check), `GET /api/trips/[id]/export` (GPX download), `DELETE /api/trips/[id]` (ownership guard, vrací `{ ok: true }` nebo 404).
- **`lib/db/trips-repository.ts`:** `updateTrip(id, userId, patch)` a `getTripById(id, userId)` přidány v v10.3. `deleteTrip(id, userId)` přidán v v11.2 — DELETE s ownership guardem, vrací `boolean`. Waypoints smažou kaskádou přes FK `trip_waypoints.tripId → trips.id ON DELETE CASCADE`. Ownership check přes `userId` v WHERE clause.
- **`lib/db/trips-waypoints-repository.ts` (nové v12, 28 ř.):** `deleteWaypoint(tripId, userId, waypointId)` — ownership check přes `trips.userId`, DELETE s podmínkou `tripId + waypointId`, vrací `boolean`. `reorderWaypoints(tripId, userId, orderedIds)` — ownership check, validace existence všech IDs, DB transaction pro atomický update `order` pole.
- **`hooks/useTripWaypoints.ts` (nové v12, 19 ř.):** Getter hook pro waypoints aktivního tripu. `useCallback + useEffect` pattern, exportuje `{ waypoints, refetch }`.
- **`hooks/useTripLayer.ts` (57 ř., v10.1):** Spravuje Leaflet vrstvu pro aktivní výlet. Fetchuje `/api/trips/[id]/waypoints` a vykreslí polyline (oranžová, dasharray) + circle markery. Re-fetchuje při změně `waypointStatus`. Klik na waypoint marker → `setSelectedPeak()` pokud má `locationId`.
- **GPX export (v10.2):** `GET /api/trips/[id]/export` — auth-guard, čistá string interpolace, `escapeXml()` helper pro XML bezpečnost. `TripPanel.tsx` — tlačítko "Exportovat GPX" jako `<a download>` obal.
- **Inline přejmenování (v10.3):** `TripPanel.tsx` — dvojklik na název → inline Input, blur/Enter potvrdí, Escape zruší. `renameTrip(id, name)` v `hooks/useTrips.ts`.

#### Modul Zámky (od v13)
- **Seed:** `lib/db/seed.ts` — idempotentní insert `modules(slug: 'castles', name: 'Zámky', icon: 'castle')` + `location_types(slug: 'castle')`. Spustit po DB reset: `DATABASE_URL=... pnpm tsx lib/db/seed.ts`.
- **`providers/castles/CastlesParserService.ts` (110 ř.):** Čte `export.geojson` z `process.cwd()`. Zod discriminatedUnion pro Point/Polygon. Centroid z prvního ringu průměrem souřadnic. `external_id = properties["@id"]`. Features bez `name` nebo souřadnic filtrovány. `metadata` JSONB: `wikidata`, `opening_hours`, `historic`.
- **`lib/castles/types.ts` (24 ř.):** Doménové typy pro modul zámky.
- **`lib/db/locations-repository.ts`:** Rozšířeno o `getAllLocationsByModule(moduleId)` — JOIN přes `location_types.module_id`.
- **`GET /api/castles`** (veřejný) + **`POST /api/sync-castles`** (admin-only, ADMIN_EMAILS pattern).
- **`components/CastlesSidebar.tsx`:** Plnohodnotný tab v levém menu (Castle ikona). Fulltext search, "Filtrovat podle mapy" checkbox (výchozí: zapnuto), flyTo zoom 14 při výběru zámku.
- **`components/CastleDetail.tsx` (86 ř.):** Analogie `PeakDetail.tsx`. Zobrazuje název, souřadnice, otevírací dobu, check-in tlačítko (sdílí `onVisitChange` z `page.tsx`), odkaz na zdroj.
- **`hooks/useCastles.ts` (25 ř.):** SWR getter, fetchuje `/api/castles`.
- **`hooks/useCastleLayer.ts`:** DEPRECATED (no-op stub, 3 ř.) — rendering přesunut do `hooks/useMapEffects.ts` (v15a).
- **`GET /api/auth/is-admin`** + **`hooks/useIsAdmin.ts`:** Settings ikona v UI viditelná pouze pro `!!session && isAdmin`.
- **Import dat (od v15):** Admin panel → "Sync Zámky" volá `CastlesScraperService.scrape()` → Overpass API (bbox CZ+SK, `historic=castle|chateau`, `AbortController` 60s, Zod validace). `export.geojson` již není potřeba.

#### Dočasné / Pomocné
- `hory_ascents_cache`: Odstraněna ze schématu (Verze 19). Ruční krok `pnpm drizzle-kit push --force` v TTY stále čeká — není blokující pro vývoj.
- File cache (`data/points-cache/all-peaks.json`, `all-peaks-si.json`): Odstraněny (Verze 24). Adresář `data/points-cache/` zachován pro `all-challenges.json`.

### Frontendová architektura (od Verze 21, aktualizováno v15d)
`app/page.tsx` (~333 ř.) je čistý orchestrátor. Logika je rozdělena do:
- **Hooks:** `hooks/useMapEffects.ts` (224 ř., unified clustering), `hooks/useDataFetching.ts`, `hooks/useChallenges.ts`, `hooks/useUserAscents.ts`, `hooks/useUserVisits.ts`, `hooks/useTrips.ts`, `hooks/useTripLayer.ts`, `hooks/useTripWaypoints.ts`, `hooks/useHoryCredentials.ts`, `hooks/useUserChallenges.ts`, `hooks/useAreas.ts`, `hooks/useCastles.ts`, `hooks/useIsAdmin.ts`
- **Hooks (deprecated):** `hooks/useCastleLayer.ts` (no-op stub, 3 ř. — čeká na smazání v TD-stub)
- **Komponenty:** `MapContainer`, `ChatPanel` (floating, mini/expanded), `LoginScreen`, `HelpHint`, `FilterSection`, `UserSettingsPanel`, `PeaksSidebar` (collapsible filter), `CastlesSidebar`, `RoutesSidebar`, `ChallengesContent`, `PeakDetail`, `CastleDetail`, `AuthModal`
- **Lib:** `lib/page-types.ts` (zbytek ≤13 ř.), `lib/page-utils.ts` (zbytek ≤19 ř.), `lib/page-config.ts`, `lib/map/constants.ts`, `lib/map/clustering.ts` (unified TaggedInput/discriminated union), `lib/map/leaflet-loader.ts`, `lib/peaks/types.ts`, `lib/challenges/types.ts`, `lib/trips/types.ts`, `lib/czech/alphabet.ts`, `lib/czech/osmismerka.ts`