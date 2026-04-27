# TODO_NEXT.md — Zadání pro [[ai-docs/CODER|Codera]]
> Vytvořil: [[ai-docs/ARCHITECT|Lead Architect]] | Aktualizováno: 2026-04-27 (rev. 36 — Coder)

---

## ✅ DONE: v21 — Filtry zámků konzistentní s vrcholy (filter icon toggle)

### Kontext a analýza
Vrcholy mají collapsible filter panel za `SlidersHorizontal` ikonou (v15b). Zámky tuto UI vrstvu nemají — checkbox "Filtrovat podle mapy" je inline přímo v `CastlesSidebar` (řádek 33–37), vždy viditelný.

**Stávající stav zámků:**
- `filterCastlesByMapBounds: boolean` state v `app/page.tsx` (řádek 125) — existuje, funguje, ale není za filter togglem.
- `CastlesSidebar` přijímá `filterByMapBounds` prop a renderuje ho inline — bez `showFilter` condition.

**Cílový stav (analogie `hory` modulu):**
- `showCastleFilter: boolean` state v `page.tsx` (toggle přes `SlidersHorizontal` ikonu v header oblasti `zamky`).
- `CastlesSidebar` dostane nový prop `showFilter: boolean` — checkbox se skryje při `false`.
- Žádný badge (`activeFilterCount`) není potřeba v první fázi — zámky mají jen jeden filter. Lze přidat jako `activeFilterCount > 0` pokud `filterCastlesByMapBounds !== true` (výchozí = true = žádný aktivní filtr).

### Zadání

**v21.1 — State a toggle ikona v `app/page.tsx`**
- Přidej `const [showCastleFilter, setShowCastleFilter] = useState(false)` (analogie řádku 90).
- V header oblasti `zamky` (v bloku `activeModule === "zamky"`, analogie řádků 296–298) přidej `SlidersHorizontal` toggle tlačítko:
  - Stejné třídy a conditional styling jako u peaks toggle (řádek 296–298).
  - `onClick={() => setShowCastleFilter((v) => !v)}`
  - Badge: podmíněný — zobraz číslo `1` pokud `!filterCastlesByMapBounds` (= filter aktivní = odchylka od výchozího stavu). Vzor: `{!filterCastlesByMapBounds && <span className="absolute -right-1 -top-1 ...">1</span>}`.
- Pozornost: header oblasti `zamky` v `page.tsx` je nutno najít přesně — hledej podmínku `activeModule === "zamky"` + blok s nadpisem "Zámky" (analogie řádků 292–299 pro `hory`).

**v21.2 — Přidej `showFilter` prop do `CastlesSidebar`**
- V `components/CastlesSidebar.tsx`:
  - Přidej `showFilter: boolean` do `CastlesSidebarProps`.
  - Celý blok s checkboxem (řádky 33–37) obal podmínkou `{showFilter && (...)}`.
  - Checkbox je odstraněn z inline pozice — je dostupný pouze skrz filter panel.
- Prop `filterByMapBounds` a `onFilterByMapBoundsChange` zůstávají beze změny — stav je stále řízen z `page.tsx`.

**v21.3 — Předej `showFilter` z `page.tsx` do `CastlesSidebar`**
- Nalezni volání `<CastlesSidebar ... />` v `page.tsx` (řádek 291).
- Přidej prop `showFilter={showCastleFilter}`.

**Poznámky:**
- `filterCastlesByMapBounds` state i jeho mutace `setFilterCastlesByMapBounds` zůstávají v `page.tsx` beze změny — prop drilling vzor zachován.
- Pokud v21 předchází v16 (useModuleSidebar refaktor): žádný konflikt — v21 jen přidává prop, v16 pak refaktoruje logiku do hooku.
- TS 0 chyb, build OK povinné.
- **Soubory:** `app/page.tsx`, `components/CastlesSidebar.tsx`.

---

## ✅ DONE: v19 — Sloučení "Plánování tras" a "Výlety" do jedné položky menu

### Kontext a analýza
V levém icon baru existují dvě samostatné položky:
- **`routes`** (ikona `Route`) → panel `RoutesSidebar` — AI prompt + parametry trasy + výsledky tras (starý manuální plánovač, **zmrazen** dle PROJECT_CONTEXT)
- **`trips`** (ikona `MapPinned`) → panel `TripPanel` — správa výletů s waypointy, GPX export, AI souhrn

Obě položky jsou konceptuálně spojeny s plánováním tras a jsou adresovány stejnému uživateli (přihlášený, plánující). `routes` je navíc zmrazený modul bez budoucích investic. Dva ikonky v icon baru pro úzce spjaté funkce zbytečně fragmentují navigaci.

### Architektonické rozhodnutí
Sloučení do **jedné menu položky `"planovani"`** s interním přepínačem (tab nebo toggle). Dvě možné realizace:

**Varianta A (doporučená): Tab uvnitř panelu**
- Jedna ikona v icon baru (např. `MapPinned`, nadpis "Plánování")
- Uvnitř expandovaného panelu dva tahy: "Výlety" a "Trasy"
- `activeModule` hodnota `"routes"` a `"trips"` zůstanou jako `SectionKey` ekvivalent uvnitř nového modulu — nebo se sloučí do `"planovani"` + interní `planningTab: "trips" | "routes"` state

**Varianta B: Výlety jako primární, Trasy jako sekundární sekce**
- Výlety = výchozí zobrazení (TripPanel)
- Trasy = skryté tlačítko "AI plánování tras" otevírající RoutesSidebar inline pod TripPanelem

**Doporučení: Varianta A** — tab pattern je čistší, konzistentní se stávajícím vzorem záložek "Vrcholy / Výzvy" v hory modulu.

### Zadání

**v19.1 — Sloučení icon bar položek**
- V `app/page.tsx` odeber ze `SectionKey`-like mapy oba itemy `["routes", ...]` a `["trips", ...]` z icon bar renderu (řádek 272–274).
- Nahraď **jedinou** položkou s hodnotou `"planovani"`, ikonou `MapPinned` a titlem "Plánování".
- Přidej lokální state `planningTab: "trips" | "routes"` inicializovaný na `"trips"`.
- Klik na icon bar setnout `activeModule("planovani")` + `planningTab` se nemění (pamatuje poslední tab).

**v19.2 — Tab přepínač uvnitř panelu**
- Uvnitř podmínky `activeModule === "planovani"` vykresli tab bar (analogie "Vrcholy / Výzvy" na řádcích 293–299):
  - Tab "Výlety" (`planningTab === "trips"`) → `TripPanel` + jeho kontext (waypointStatus hint, TripPanel komponenta)
  - Tab "Trasy" (`planningTab === "routes"`) → `RoutesSidebar` + route plans list
- Hlavička panelu zobrazí "Plánování" (místo podmíněného "Plánování tras" / "Výlety").

**v19.3 — Čištění activeModule typů**
- Typ `activeModule` v `lib/page-types.ts` nebo přímo v `app/page.tsx` — přidej `"planovani"` a odeber `"routes"` a `"trips"` z unión type.
- Všechna místa kde se `activeModule === "routes"` nebo `activeModule === "trips"` testuje (logika viditelnosti markerů, panel render) — sjednoť na `activeModule === "planovani"` + `planningTab` kde je potřeba.
- Klíčová místa ke kontrole: `mapPeakPoints` (řádek 151), `effectiveShowCastles` (řádek 152–157), setActiveModule volání z `useTripLayer` (hook nastavuje `selectedPeak` — tam `activeModule` nenastavuje, OK).

**Poznámky:**
- `useEffect` čistící `selectedCastle` při změně `activeModule` (řádek 126–129) — zkontroluj, zda podmínka `activeModule === "zamky"` zůstane správná po rename.
- TS 0 chyb, build OK povinné.
- **Soubory:** `app/page.tsx`, `lib/page-types.ts` (pokud tam je `activeModule` typ).

---

## ✅ DONE: v20 — Floating overlay karta pro detail vrcholu a zámku

### Kontext a analýza
**Aktuální stav:**
- Detail zámku (`selectedCastle`) v modulu `zamky` se renderuje přímo v sidebaru — `CastleDetail` nahrazuje `CastlesSidebar` uvnitř `ScrollArea` (řádek 291 v `page.tsx`). Tlačítko "Zpět na seznam" vrátí na sidebar.
- Detail vrcholu (`selectedPeak`) v modulu `hory` se renderuje uvnitř `PeaksSidebar` oblasti (řádky 305, 313, 317 v `page.tsx`) — opět sidebar swap.
- Existuje **precedent floating overlay** pro `selectedCastle` při jiném modulu (řádky 328–332): `absolute top-4 right-4 z-[900] w-80` — ale to je jen edge-case pro cross-module stav.

**Cíl:** Detail (peak i castle) se po kliknutí zobrazí jako **floating karta nad mapou**, sidebar zůstane ve svém stavu (seznam).

### Architektonické rozhodnutí

**Umístění v DOM:** Floating overlay patří do mapového `div` (řádek 326: `<div className="relative min-w-0 flex-1 overflow-hidden isolate">`). Tento div má `relative` positioning a `isolate` pro stacking context — ideální kontejner. Z-index: `z-[900]` (pod ChatPanel `z-[850]` — pozor, ChatPanel má `z-[850]`, overlay musí být nad ním: **`z-[900]`**).

**State management:** `selectedPeak` a `selectedCastle` state zůstávají v `page.tsx` beze změny. Overlay je podmíněně renderovaný vedle `MapContainer`, nezávisle na `activeModule`. Sidebar přestane dělat swap na detail.

**`onBack` chování:** V floating kartě `onBack` zavře overlay (`setSelectedPeak(null)` / `setSelectedCastle(null)`). Tlačítko "Zpět na seznam" se přejmenuje na "Zavřít" nebo se nahradí `X` ikonou v rohu karty (floating UX konvence).

### Zadání

**v20.1 — Floating overlay pro PeakDetail**
- Z podmínky `activeModule === "hory"` v sidebaru (řádky 305, 313, 317) **odeber** renderování `PeakDetail` — sidebar bude vždy zobrazovat seznam (PeaksSidebar), nikdy detail.
- Do mapového `div` (za `<MapContainer>`, před `<ChatPanel>`) přidej podmíněný render:
  ```
  {selectedPeak && (
    <div className="absolute bottom-4 left-4 z-[900] w-80 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <PeakDetail ... onBack={() => setSelectedPeak(null)} />
    </div>
  )}
  ```
  Pozice: `bottom-4 left-4` — vlevo dole, aby nepřekrývala ChatPanel (vpravo/uprostřed) a existující castle overlay (vpravo nahoře).
- `PeakDetail` dostane stejné props jako dosud — žádná změna komponenty.

**v20.2 — Floating overlay pro CastleDetail**
- Z podmínky `activeModule === "zamky"` v sidebaru (řádek 291) **odeber** podmíněné renderování `CastleDetail` — sidebar vždy zobrazuje `CastlesSidebar`.
- Sjednoť existující edge-case overlay (řádky 328–332: `absolute top-4 right-4 z-[900] w-80`) s novým přístupem:
  - Původní podmínka `selectedCastle && activeModule !== "zamky"` — změň na **`selectedCastle`** (bez omezení na modul). Castle detail je floating vždy.
  - Pozice: `top-4 right-4 z-[900] w-80` — zachovat stávající pozici jako výchozí.

**v20.3 — Přizpůsobení `onBack` semantiky**
- V `PeakDetail.tsx`: tlačítko "Zpět na seznam" změň label na "Zavřít" (text zůstane, funkce onBack zůstane — změna jen labelu reflektuje nový UX kontext).
- V `CastleDetail.tsx`: stejné — label "Zpět na seznam" → "Zavřít".
- Alternativa (preferovaná): nahradit back tlačítko `X` (Lucide `X` ikona) v pravém horním rohu karty — floating overlay konvence. Implementace volbou Codera.

**Poznámky:**
- `useEffect` flyTo při `selectedCastle` (řádek 216–218) zůstává beze změny — stále funkční.
- ChatPanel má `z-[850]` — overlay `z-[900]` ho překryje. Ověřit vizuálně, zda nedochází ke kolizi pozic (ChatPanel je horizontálně uprostřed/vpravo, overlay vlevo dole / vpravo nahoře — OK).
- `isolate` na mapovém divu vytváří stacking context — z-indexy fungují uvnitř tohoto contextu, nezávisle na `z-[1100]` dialogů.
- TS 0 chyb, build OK povinné.
- **Soubory:** `app/page.tsx`, `components/PeakDetail.tsx`, `components/CastleDetail.tsx`.

---

## ✅ DONE: TD-stub — Smazání `useCastleLayer.ts` no-op stub

### Kontext
`hooks/useCastleLayer.ts` byl v v15a deprecován jako no-op stub (3 řádky) — rendering přesunut do `useMapEffects`. Grep potvrzuje: **žádné reference neexistují** (ověřeno 2026-04-27). Soubor je připraven ke smazání bez dalšího průzkumu.

### Zadání
- Smaž `hooks/useCastleLayer.ts`.
- Updatuj seznam hooks v `ai-docs/PROJECT_CONTEXT.md` (sekce Frontendová architektura) — odeber řádek o `useCastleLayer.ts` (deprecated stub).
- TS 0 chyb, build OK povinné.

**Soubory:** `hooks/useCastleLayer.ts`, `ai-docs/PROJECT_CONTEXT.md`.

---

## ✅ DONE: v16 — Generalizace `useModuleSidebar` logiky

### Kontext (rozhodnutí Architekta — SPUŠTĚNO)
`CastlesSidebar` a `PeaksSidebar` sdílejí identickou logiku: search filter, "Filtrovat podle mapy" toggle, item selection pattern. Se dvěma moduly je duplicita ještě zvládnutelná; před přidáním třetího modulu je extrakce sdílené logiky podmínkou škálovatelnosti. **Hook doposud nebyl implementován.**

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

## ✅ DONE: v17 — Ověření check-in parity Zámky vs. Vrcholy

### Kontext
`CastleDetail.tsx` má `onVisitChange` prop a check-in tlačítko — analogie `PeakDetail.tsx`. Nicméně `handleVisitChange` v `page.tsx` volá `mutateAscents()` + `mutateVisits()`, kde `mutateAscents` je specificky pro hory.app výstupy. Pro zámky je relevantní pouze `mutateVisits`.

### Zadání
- Ověř, zda `handleVisitChange` v `page.tsx` je generický a funguje pro `externalId` zámků i vrcholů bez podmínkování.
- Pokud `mutateAscents()` se volá i pro castle check-in zbytečně: přidej `kind: "peak" | "castle"` parametr do `handleVisitChange` a `mutateAscents()` volej pouze pro kind `"peak"`.
- Pokud vše funguje správně: zapiš "verified OK" do RELEASE_NOTES a uzavři mileston.
- TS 0 chyb, build OK povinné.

**Soubory:** `app/page.tsx`, `components/CastleDetail.tsx`.

---

## ✅ DONE: v18 — Castles scraping workflow — lokální Overpass fetch

### Kontext (nová architektonická realita — 2026-04-27)
Projekt byl nasazen na DO App Platform. Playwright nefunguje spolehlivě na buildpacku. Scraping byl přesunut lokálně: `pnpm scrape:peaks` a `pnpm scrape:areas` generují `data/peaks.json` a `data/areas.json`, které jsou commitnuty do gitu. Sync endpointy čtou ze souborů — žádný browser na serveru.

Tato změna je **architektonicky přijata** jako pragmatická volba pro produkci. Nicméně zůstávají otevřené otázky:

### Zadání
**v18.1 — Audit konzistence castles workflow**
- Ověř, jak probíhá aktualizace dat zámků. `CastlesScraperService.ts` byl smazán (commit `1063c83`). Endpoint `POST /api/sync-castles` volá co? Ověř v `app/api/sync-castles/route.ts`.
- Pokud `sync-castles` stále očekává `export.geojson` (soubor z GeoJSON exportu OSM): potvrdit jako akceptovaný workflow, zdokumentovat do RELEASE_NOTES.
- Pokud endpoint nefunguje nebo odkazuje na smazaný soubor: opravit.

**v18.2 — Konzistence s peaks/areas vzorem**
- Pokud zámky vyžadují ruční export z OSM (Overpass turbo → export.geojson), zvaž přidat `scripts/scrape-castles.ts` analogický `scripts/scrape-areas.ts` — lokální Overpass fetch → `data/castles.json`.
- Toto by sjednotilo workflow: všechna data scrapována lokálně, commitována, sync endpointy čtou ze souborů.
- Rozhodnutí zapiš do RELEASE_NOTES.

**Poznámky:**
- Toto je audit + možná oprava, ne nová feature.
- TS 0 chyb, build OK povinné.

---

### Deprioritizováno (nemazat, neinvestovat)

- **Manuální plánování tras** — TripPanel, RoutesSidebar, waypoint management (v10–v12) jsou kompletní a funkční. Žádné nové featury.
- **Waypoint přidávání z mapy** — odloženo indefinitně.

---

### Pending (neblokující)

#### TD-19-manual: Ruční DB krok
`pnpm drizzle-kit push --force` v TTY pro drop `hory_ascents_cache` z DB. Stále čeká, není blokující pro vývoj.

---

## ✅ Uzavřené verze

- **v16a + v16b (2026-04-24) — Admin & Deployment stabilizace:**
  - `feat: admin příznak v DB` — sloupec `users.role` (user/admin), `lib/db/admin.ts` s `isAdmin(userId)`. Odstraněna `ADMIN_EMAILS` env logika ze všech routes. **Architektonicky důležitá změna:** admin check je nyní DB-backed, ne env-based.
  - `feat: globální admin Hory.app credentials v DB` — `/api/admin/hory-credentials` (GET/POST, admin-only). `data_sources.config` (šifrovaný JSONB) jako úložiště. `sync-peaks` a `sync-areas` čtou credentials z DB místo env.
  - `fix: unique constraint na data_sources(module_id, type)` — migrace 0002, deduplikace, seed opraven.
  - `fix: /api/peaks filtruj podle modulu mountains` — bug kde `/api/peaks` vracel lokality všech modulů.
  - `fix: sync peaks fire-and-forget` (oprava 504 timeoutu) + `fix: zámky overlay bug`.
  - `fix: admin page zobrazuje jen AdminPanel` (ne UserSettingsPanel).
- **v16c (2026-04-27) — Deployment: lokální scraping + statické soubory:**
  - `feat: lokální scraping do statických souborů` — Playwright přesunut lokálně. `pnpm scrape:peaks` → `data/peaks.json`, `pnpm scrape:areas` → `data/areas.json`. Sync endpointy čtou ze souborů. Žádný browser na serveru.
  - `data/peaks.json` a `data/areas.json` commitnuty (scraping 2026-04-27).
  - `fix: page.evaluate jako string` — obejití tsx/esbuild `__name` ReferenceError problému při lokálním scraping spuštění.
  - `CastlesScraperService.ts` smazán (Overpass nahrazen file-based workflow).
  - Vlastní migrační skript `scripts/db-migrate.ts` (místo drizzle-kit CLI pro DO buildpack).
- **v15 + v15a + v15b + v15c + v15d** — Live Overpass sync pro zámky, unified clustering, collapsible filtr, floating ChatPanel, UI opravy. TS 0 chyb. Build OK (33 routes).
- **v13 + v14** — Modul Zámky kompletní: seed, parser, API, CastleDetail, CastlesSidebar, mapová vrstva. TS 0 chyb. Build OK.
- **v12** — Trips UX: odebrání + řazení waypointů. TS 0 chyb. Build OK.
- **v10 + v11** — AI plánovač tras: vizualizace, přejmenování, GPX export, smazání výletu. TS 0 chyb. Build OK.
- **v9.7** — Perzistence výběru oblastí, "Zobrazit vše", filteredCount badge. TS 0 chyb. Build OK.
- **v9.1–v9.6** — Check-in, visit stats, challenges progres, oblasti sync + linkování + UI filtr. TS 0 chyb. Build OK.
- **v8.5–v8.7** — Nastavení (AES-256-GCM), admin panel, sync při přihlášení. TS 0 chyb. Build OK.
- **v21–v26a** — Split page.tsx, auth model refaktoring, public endpoints. TS 0 chyb. Build OK.

---

## Poznámky architekta

- Mutační pattern (v9.1) je závazný: mutace v `page.tsx`, hooks jsou čisté gettery.
- **Admin role (od v16a): DB-backed** — `users.role` (user/admin), `lib/db/admin.ts`. `ADMIN_EMAILS` env odstraněn. `useIsAdmin` hook (SWR) stále platný.
- **Scraping workflow (od v16c): lokální** — `pnpm scrape:peaks` + `pnpm scrape:areas`, výstup do `data/*.json`, commitováno. Sync endpointy čtou ze souborů. Žádný browser na serveru.
- **Admin credentials (od v16a): DB** — Hory.app admin credentials uloženy šifrovaně v `data_sources.config`, přes `/api/admin/hory-credentials`.
- `detail.ts` (244 ř.) — trvalá výjimka pro `page.evaluate()` blok.
- `useMapEffects.ts` (224 ř.) — akceptovaná výjimka pro kompoziční hook s více efekty.
- `providers/hory/HoryScraperService.ts` (962 ř.) — výjimka pro `page.evaluate()` blok.
- `lib/` struktura připravena pro další moduly — každý modul dostane vlastní `lib/<modul>/types.ts`.
- `app/(admin)` — Server Component, admin check přes `isAdmin(userId)` z DB (ne env allowlist).
- GPX generace: bez externích knihoven — čistá string interpolace.
- `useModuleSidebar` hook (v16): generický přes TypeScript generics, neimportuje modul-specifické typy — architektonická podmínka.
