# RELEASE_NOTES — [[ai-docs/CODER|Coder]] výstup pro [[ai-docs/ARCHITECT|Architekta]]
> Datum: 2026-04-27 | Branch: main | Autor: Claude Sonnet 4.6 (claude-sonnet-4-6)
> Verze: v22 + v22b

---

## v22 — Zámky: datový dluh + sync endpoint

### Status: ✅

#### v22.1 — data/castles.geojson
`data/castles.geojson` byl již generován lokálně (scrape provedený dříve ve stejné session). Soubor existoval jako untracked — přidán ke commitu. Velikost: 69 238 řádků (cca 8 700 zámků/hradů CZ+SK z Overpass API).

#### v22.2 — Ověření sync-castles endpointu
`CastlesParserService.parse()` čte `data/castles.geojson` → validuje GeoJSON schéma přes Zod → mapuje na `CastleLocation[]`. Endpoint `POST /api/sync-castles` volá parser a upsertuje přes `upsertLocations()`. Formát kompatibilní. **Verified OK** — žádné úpravy kódu nebyly potřeba.

#### v22.3 — package.json scrape:castles
Skript `"scrape:castles": "tsx scripts/scrape-castles.ts"` v `package.json` **already present** — žádná úprava.

### Files Changed

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `data/castles.geojson` | NEW (commit) | 69 238 | N/A (data) |

### Technical Audit v22

- **pnpm tsc --noEmit:** ✅ 0 chyb
- **pnpm build:** ✅ OK

---

## v22b — Unified locality detail (jeden slot pro všechny moduly)

### Status: ✅

#### v22b.1 — Sjednocení stavu detailu v page.tsx
Odstraněny separátní stavy `selectedPeak: MapPoint | null` a `selectedCastle: CastlePoint | null`. Nahrazeny jedním `activeDetail: ActiveDetail` stavem (discriminated union).

Nový typ `ActiveDetail` přidán do `lib/page-types.ts`:
```typescript
type ActiveDetail =
  | { type: "peak"; data: MapPoint }
  | { type: "castle"; data: CastlePoint }
  | { type: null; data: null };
```

Derived read-only hodnoty `selectedPeak` a `selectedCastle` jsou odvozeny z `activeDetail` — zachovávají kompatibilitu s `useMapEffects` a `useTripLayer` hooky bez nutnosti jejich modifikace.

Přidány wrapper funkce `setSelectedPeak(p)` a `setSelectedCastle(c)` pro hooks + `handleDetailClose()` pro overlay.

Otevření nového detailu automaticky zavírá předchozí (jeden stav = jedna hodnota).

#### v22b.2 — Sjednocení pozice overlaye
Oba detaily (peak i castle) jsou nyní renderovány v jednom `<div className="absolute bottom-4 left-4 z-[900] w-80 ...">` — stejná pozice, stejný z-index. Castle detail přesunut z `top-4 right-4` na `bottom-4 left-4` (stejná pozice jako peak detail).

Uvnitř wrapperu podmíněně: `activeDetail.type === "peak"` → `<PeakDetail>`, `activeDetail.type === "castle"` → `<CastleDetail>`. Nikdy oba najednou.

#### v22b.3 — Chování při přepínání modulů
Efekt `activeModule` upraven: přepnutí záložky samo o sobě detail nezavírá (dle spec). Efekt pouze zajišťuje `setShowCastlesLayer(true)` při přechodu na modul Zámky.

### Files Changed

| Soubor | Operace | Řádky (wc -l) | Limit |
|---|---|---|---|
| `lib/page-types.ts` | MODIFIED (přidán `ActiveDetail` typ) | 21 | N/A |
| `app/page.tsx` | MODIFIED (unified detail state) | 376 | akceptovaná odchylka (orchestrátor) |

### Technical Audit v22b

- **pnpm tsc --noEmit:** ✅ 0 chyb
- **pnpm build:** ✅ OK
