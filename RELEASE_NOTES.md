# Release Notes

---

## v16 + v17 + v18 + v19 + v20 + v21 + TD-stub — UI refaktoring, moduly, floaty overlay, filtry

> Datum: 2026-04-27 | Branch: main

### Status: ✅ Success — TS 0 chyb, Build OK (33 routes)

---

### TD-stub — Smazání `useCastleLayer.ts`

| Soubor | Operace | Řádky |
|---|---|---|
| `hooks/useCastleLayer.ts` | DELETE | — |
| `ai-docs/PROJECT_CONTEXT.md` | UPDATE (sekce v15a) | — |

- Soubor byl 3-řádkový no-op stub (rendering přesunut do `useMapEffects` ve v15a).
- Grep potvrdil 0 referencí před smazáním.

---

### v16 — `useModuleSidebar` hook + refaktor CastlesSidebar

**Audit (v16.1):**
- `CastlesSidebar`: inline 3-řádkový search filter (`castles.filter(...)`) — jediná sdílená logika.
- `PeaksSidebar`: filtering probíhá upstream v `useChallenges` — žádná inline search logika, v16.4 přeskočeno (< 5 ušetřených řádků).

| Soubor | Operace | Řádky |
|---|---|---|
| `hooks/useModuleSidebar.ts` | CREATE | 25 |
| `components/CastlesSidebar.tsx` | UPDATE | 97 |

- `useModuleSidebar<T>` — generický hook (`getSearchText: (item: T) => string`), neimportuje modul-specifické typy.
- `useMemo` pro filtrování — reaktivní na `items`, `searchQuery`, `getSearchText`.
- `CastlesSidebar` nahradila inline filter voláním hooku + `useCallback` pro `getCastleName`.
- **v16.4 přeskočeno**: `PeaksSidebar` nemá inline search — hook by neušetřil žádné řádky.

---

### v17 — Ověření check-in parity Zámky vs. Vrcholy

| Soubor | Operace | Řádky |
|---|---|---|
| `app/page.tsx` | UPDATE (`handleVisitChange`) | — |

- `handleVisitChange` přijímá nový optional parametr `kind: "peak" | "castle" = "peak"`.
- `mutateAscents()` volána pouze při `kind === "peak"` — zamezuje zbytečnému fetchování hory.app ascents při castle check-inu.
- CastleDetail call site: wrapper `(id, action) => handleVisitChange(id, action, "castle")`.
- Komponenty `PeakDetail`, `CastleDetail` beze změny (prop typ stále kompatibilní).

---

### v18 — Castles scraping workflow — lokální Overpass fetch

| Soubor | Operace | Řádky |
|---|---|---|
| `scripts/scrape-castles.ts` | CREATE | 102 |
| `providers/castles/CastlesParserService.ts` | UPDATE | 117 |
| `package.json` | UPDATE (`scrape:castles` script) | — |

- `scripts/scrape-castles.ts` — Overpass API fetch (bbox CZ+SK, `historic=castle`), výstup: `data/castles.geojson` ve GeoJSON formátu.
- `CastlesParserService` — prioritně čte `data/castles.geojson` (nový scraper), fallback na `export.geojson` (legacy ruční export).
- `pnpm scrape:castles` → `data/castles.geojson` → commit → `pnpm sync-castles` z admin panelu.
- Sjednocuje workflow: peaks, areas i castles scrapovány lokálně, commitovány, sync endpointy čtou ze souborů.

---

### v19 — Sloučení "Plánování tras" a "Výlety" do jedné položky menu

| Soubor | Operace | Řádky |
|---|---|---|
| `app/page.tsx` | UPDATE | 367 |

- `activeModule` typ: `"hory" | "planovani" | "zamky"` (odebráno `"routes"`, `"trips"`).
- Nový state `planningTab: "trips" | "routes"` (inicializace: `"trips"`, pamatuje tab při přepnutí modulu).
- Icon bar: dvě ikony nahrazeny jedinou `MapPinned` / "Plánování" → `setActiveModule("planovani")`.
- Panel `"planovani"`: tab bar "Výlety" + "Trasy" (analogie "Vrcholy / Výzvy" v hory modulu).
- `effectiveShowCastles`: `"planovani"` → `showCastlesLayer` (zachovává chování `"routes"`/`"trips"`).

---

### v20 — Floating overlay karta pro PeakDetail a CastleDetail

| Soubor | Operace | Řádky |
|---|---|---|
| `app/page.tsx` | UPDATE | 367 |
| `components/PeakDetail.tsx` | UPDATE | 122 |
| `components/CastleDetail.tsx` | UPDATE | 84 |

- `PeakDetail`: odstraněn ze sidebar swap (`selectedPeak ? ... : list`), sidebar vždy zobrazuje seznam.
- Floating overlay: `absolute bottom-4 left-4 z-[900] w-80 max-h-[calc(100vh-6rem)]` — vlevo dole, pod ChatPanelem.
- `CastleDetail`: odstraněn ze sidebar swap, floating overlay `absolute top-4 right-4 z-[900] w-80`.
- Castle overlay podmínka: `selectedCastle` (vždy, bez omezení na `activeModule !== "zamky"`).
- Filter toggle pro peaks: `!selectedPeak` podmínka odebrána — filtr dostupný i při zvoleném vrcholu.
- `onBack` nahrazeno `X` ikonou (Lucide `X`) v rohu karty — floating overlay UX konvence.

---

### v21 — Filtry zámků konzistentní s vrcholy

| Soubor | Operace | Řádky |
|---|---|---|
| `app/page.tsx` | UPDATE | 367 |
| `components/CastlesSidebar.tsx` | UPDATE | 97 |

- `showCastleFilter: boolean` state v `page.tsx` (analogie `showPeakFilter`).
- `SlidersHorizontal` toggle v sub-headeru zamky sekce — stejné třídy jako u peaks toggle.
- Badge: zobrazí `1` pokud `!filterCastlesByMapBounds` (odchylka od výchozího stavu).
- `CastlesSidebar` nový prop `showFilter: boolean` — checkbox "Filtrovat podle mapy" skryt při `false`.
