# TODO_NEXT.md — Zadání pro [[ai-docs/CODER|Codera]]
> Vytvořil: [[ai-docs/ARCHITECT|Lead Architect]] | Aktualizováno: 2026-04-23 (rev. 32)

---

## Priorita 1: TD-stub — Smazání `useCastleLayer.ts` no-op stub

### Kontext
`hooks/useCastleLayer.ts` byl v v15a deprecován jako no-op stub (3 řádky) — rendering byl přesunut do `useMapEffects`. Stub byl zachován konzervativně pro případ externích referencí. Než přistoupíme k v16, musí být mrtvý kód odstraněn, aby refaktor začínal čistou bází.

### Zadání
- Ověř, že `useCastleLayer.ts` není referencován nikde v projektu (grep přes `.ts`, `.tsx`).
- Pokud neexistují reference: soubor smaž. Pokud reference existují, odstraň je a pak smaž soubor.
- Updatuj seznam hooks v `ai-docs/PROJECT_CONTEXT.md` (sekce Frontendová architektura) — odeber `hooks/useCastleLayer.ts`.
- TS 0 chyb, build OK povinné.

**Soubory:** `hooks/useCastleLayer.ts`, případně soubory s referencemi, `ai-docs/PROJECT_CONTEXT.md`.

---

## Priorita 2: v16 — Generalizace `useModuleSidebar` logiky

### Kontext (rozhodnutí Architekta — SPUŠTĚNO)
`CastlesSidebar` a `PeaksSidebar` sdílejí identickou logiku: search filter, "Filtrovat podle mapy" toggle, item selection pattern. Se dvěma moduly je duplicita ještě zvládnutelná; před přidáním třetího modulu je extrakce sdílené logiky podmínkou škálovatelnosti.

### Architektonické rozhodnutí
Preferovaný přístup: **sdílený hook `hooks/useModuleSidebar.ts`** — ne sdílená UI komponenta. Důvod: `PeaksSidebar` má komplexní filtrování (oblasti, písmena, range, země) které není přítomné v `CastlesSidebar` — společná UI komponenta by byla přeplněna optional props. Sdílená logika v hooku je méně invazivní a zachovává modul-specifické UI volnost.

### Zadání

**v16.1 — Audit duplicity**
- Porovnej `components/CastlesSidebar.tsx` a `components/PeaksSidebar.tsx`.
- Identifikuj logiku, která je skutečně totožná: search filter (lowercase includes), map-bounds toggle state, item selection/deselection pattern.
- Zapiš zjištění do RELEASE_NOTES jako součást v16.1 (max 5 řádků).

**v16.2 — `hooks/useModuleSidebar.ts`**
- Vytvoř `hooks/useModuleSidebar.ts` (≤60 ř.) jako generický hook pro sdílenou logiku sidebaru.
- Hook přijme pole items a vrátí: `searchQuery`, `setSearchQuery`, `filtered` (items po aplikaci search filtru), `filterByMapBounds`, `setFilterByMapBounds`.
- Hook je generický přes TypeScript generics (`<T extends { name?: string | null }>`) — neimportuje žádné modul-specifické typy.
- `CastlesSidebar` i `PeaksSidebar` (pouze search + map-bounds část) přepíší lokální logiku na volání tohoto hooku.

**v16.3 — Refaktor `CastlesSidebar.tsx`**
- `CastlesSidebar` je jednodušší případ (žádné extra filtry) — začni zde.
- Nahraď inline search filter + filterByMapBounds state voláním `useModuleSidebar`.
- Komponenta musí zůstat funkčně identická, UI beze změny.

**v16.4 — Refaktor `PeaksSidebar.tsx` (pouze search)**
- `PeaksSidebar` má komplexní filtrování — hook přebírá **pouze** search logiku (`peakSearchQuery` a `filtered` search pass).
- Oblast, písmena, range, země filtry zůstávají v `PeaksSidebar` beze změny — hook se na ně nevztahuje.
- Pokud by refaktor `PeaksSidebar` zvýšil komplexitu (hook neušetří víc než 5 řádků), v16.4 se přeskočí — zaznamenat do RELEASE_NOTES.

**Poznámky:**
- TS 0 chyb, build OK povinné po každém kroku.
- `useModuleSidebar.ts` je getter hook (bez write operací) — mutační pattern zachován.
- Soubory: `hooks/useModuleSidebar.ts` (NEW), `components/CastlesSidebar.tsx`, `components/PeaksSidebar.tsx`.

---

## Priorita 3: v17 — Ověření check-in parity Zámky vs. Vrcholy

### Kontext
`CastleDetail.tsx` má `onVisitChange` prop a check-in tlačítko — analogie `PeakDetail.tsx`. Nicméně `handleVisitChange` v `page.tsx` volá `mutateAscents()` + `mutateVisits()`, kde `mutateAscents` je specificky pro hory.app výstupy. Pro zámky je relevantní pouze `mutateVisits`.

### Zadání
- Ověř, zda `handleVisitChange` v `page.tsx` je generický a funguje pro `externalId` zámků i vrcholů bez podmínkování.
- Pokud `mutateAscents()` se volá i pro castle check-in zbytečně: přidej `kind: "peak" | "castle"` parametr do `handleVisitChange` a `mutateAscents()` volej pouze pro kind `"peak"`.
- Pokud vše funguje správně: zapiš "verified OK" do RELEASE_NOTES a uzavři mileston.
- TS 0 chyb, build OK povinné.

**Soubory:** `app/page.tsx`, `components/CastleDetail.tsx`.

---

### Deprioritizováno (nemazat, neinvestovat)

- **Manuální plánování tras** — TripPanel, RoutesSidebar, waypoint management (v10–v12) jsou kompletní a funkční. Žádné nové featury do těchto komponent.
- **Waypoint přidávání z mapy** — odloženo indefinitně.

---

### Pending (neblokující)

#### TD-19-manual: Ruční DB krok
`pnpm drizzle-kit push --force` v TTY pro drop `hory_ascents_cache` z DB. Stále čeká, není blokující pro vývoj.

---

## ✅ Uzavřené verze

- **v15 + v15a + v15b + v15c + v15d** — Live Overpass sync pro zámky (CastlesScraperService, AbortController 60s, Zod validace), unified clustering (discriminated union TaggedInput, tagPeaks/tagCastles helpers, ClusterFeature.kinds), filtr vrcholů jako collapsible panel (SlidersHorizontal toggle, showPeakFilter state, activeFilterCount badge), AI chat jako floating window (mini ↔ expanded, interní expanded state, bottom-4 center), UI vylepšení (ChevronDown toggle pro panel, border-r fix, invalidateSize po resize). TS 0 chyb. Build OK (33 routes).
- **v13 + v14** — Modul Zámky: seed (castles modul + castle location_type), CastlesParserService (OSM GeoJSON parser), sync+get API, CastleDetail, mapová vrstva (fialové markery), CastlesSidebar jako plnohodnotný tab, viditelnost bodů dle activeModule, useIsAdmin hook, GET /api/auth/is-admin, clustering opravy (maxZoom 10, minPoints 4). TS 0 chyb. Build OK (33 routes).
- **v12** — Trips UX: RoutesSidebar verifikace (plně funkční, není stub). Odebrání waypointu (DELETE route + repository + X tlačítko s inline confirm). Řazení waypointů (PATCH route + reorder repository + šipky nahoru/dolů). TS 0 chyb. Build OK.
- **v10 + v11** — AI plánovač tras: vizualizace trasy (useTripLayer, polyline + markery), přejmenování výletu (inline edit, PATCH /api/trips/[id]), GPX export, AI summary persistence, smazání výletu (Trash2 + inline confirm). TS 0 chyb. Build OK.
- **v9.7** — Perzistence výběru oblastí, tlačítko "Zobrazit vše", filteredCount badge. TS 0 chyb. Build OK.
- **v9.1–v9.6** — Check-in, visit stats, challenges progres, oblasti sync + linkování + UI filtr. TS 0 chyb. Build OK.
- **v8.5–v8.7** — Nastavení (AES-256-GCM), admin panel, sync při přihlášení. TS 0 chyb. Build OK.
- **v21–v26a** — Split page.tsx, auth model refaktoring, public endpoints. TS 0 chyb. Build OK.

---

## Poznámky architekta

- Mutační pattern (v9.1) je závazný: mutace v `page.tsx`, hooks jsou čisté gettery.
- `detail.ts` (244 ř.) v `providers/hory/challenges/` — trvalá výjimka pro `page.evaluate()` blok.
- `useMapEffects.ts` (224 ř.) — akceptovaná výjimka pro kompoziční hook s více efekty. Limit 120 ř. platí pro nové soubory, ne pro tento.
- `lib/` struktura je připravena pro další moduly — každý modul dostane vlastní `lib/<modul>/types.ts`.
- `app/(admin)` — bez samostatného layoutu, Server Component ověřuje session před renderem.
- Admin role check je přes `ADMIN_EMAILS` env allowlist (ne DB role). Granulární role = samostatný mileston.
- GPX generace: bez externích knihoven — čistá string interpolace (žádná závislost navíc).
- `useModuleSidebar` hook (v16): generický přes TypeScript generics, neimportuje modul-specifické typy — architektonická podmínka, ne doporučení.
