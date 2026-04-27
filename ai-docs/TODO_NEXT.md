# TODO_NEXT.md — Zadání pro [[ai-docs/CODER|Codera]]
> Vytvořil: [[ai-docs/ARCHITECT|Lead Architect]] | Aktualizováno: 2026-04-27 (rev. 39 — coder)

---

## ✅ HOTOVO — v22: Zámky — aktualizace dat + sync endpoint

### Kontext a analýza
`scripts/scrape-castles.ts` existuje a generuje `data/castles.geojson`. `CastlesParserService` hledá soubor v tomto pořadí: `data/castles.geojson` → `export.geojson`. Žádný z těchto souborů v repozitáři není — `sync-castles` endpoint je de facto nefunkční v produkci.

Analogicky jako peaks/areas musí Coder:
1. Spustit lokální scraping → získat `data/castles.geojson`
2. Commitnout soubor do repozitáře

Toto je **datový dluh**, ne kódová chyba — ale blokuje funkčnost modulu Zámky v produkci.

### Zadání

**v22.1 — Lokální scraping zámků**
- Spusť `pnpm scrape:castles` lokálně (nebo ekvivalent: `pnpm tsx scripts/scrape-castles.ts`).
- Script komunikuje s Overpass API (bez Playwright, bez credentials) — stačí internetové připojení.
- Výstup: `data/castles.geojson`
- Commitni `data/castles.geojson` do repozitáře (analogie `data/peaks.json` a `data/areas.json`).

**v22.2 — Sjednocení `sync-castles` se vzorem peaks/areas**
- Aktuální `CastlesParserService.parse()` čte GeoJSON s vlastním schématem. Peaks/areas vzor čte `data/peaks.json` (pole plain objektů). Oba přístupy jsou architektonicky akceptovatelné — GeoJSON má bohatší strukturu.
- Ověř, že po spuštění scrape a commitu GeoJSON souboru endpoint `POST /api/sync-castles` v produkci projde bez chyby. Pokud ano, zapiš "verified OK" do RELEASE_NOTES.
- Pokud je formát nekompatibilní nebo jsou jiné problémy: oprav v minimálním rozsahu.

**v22.3 — Přidej `scrape:castles` do `package.json`**
- Zkontroluj, zda `package.json` obsahuje skript `"scrape:castles": "tsx scripts/scrape-castles.ts"`.
- Pokud chybí, přidej ho. Pokud existuje, zapiš "already present" do RELEASE_NOTES.

**Poznámky:**
- TS 0 chyb, build OK povinné.
- **Soubory:** `data/castles.geojson` (NEW), `package.json` (pokud chybí skript).

---

## ✅ HOTOVO — v22b: Unified locality detail — jeden slot pro všechny moduly

### Kontext a analýza
Aktuálně `PeakDetail` a `CastleDetail` jsou nezávislé floating overlaye, které se zobrazují na různých místech obrazovky (nebo se kumulují). Uživatel očekává, že detail lokality je **jediný sdílený UI slot** — ať otevřeš kopec nebo zámek, detail se vždy zobrazí na stejném místě.

**Požadované chování:**
- Existuje právě jeden "detail lokality" — otevření jakéhokoliv detailu (kopec, zámek, ...) zobrazí panel na pevné pozici.
- Otevření detailu zámku při otevřeném detailu kopce zavře detail kopce a na jeho místě zobrazí detail zámku (a naopak).
- Při zavření detailu se slot vyprázdní — žádný detail není viditelný.
- Přepnutí záložky (Hory ↔ Zámky) samo o sobě detail nezavírá ani neotevírá.

### Architektonické rozhodnutí
Sdílený slot se řídí jedním stavem: `activeDetail: { type: "peak" | "castle" | null, id: string | null }` (nebo analogicky). Tento stav žije v `page.tsx` (orchestrátor). `PeakDetail` a `CastleDetail` jsou podmíněně renderovány na základě `activeDetail.type` — nikdy oba najednou.

Floating overlay pozice (top/left/right/bottom) musí být identická pro oba komponenty — ideálně extrahovat do jednoho `<DetailOverlay>` wrapperu, který se přepne obsahem.

### Zadání

**v22b.1 — Sjednoť stav detailu v `page.tsx`**
- Nahraď `selectedPeakId` + `selectedCastleId` jedním `activeDetail: { type: "peak" | "castle" | null, id: string | null }` stavem (nebo TypeScript discriminated union).
- Handlerům `onPeakClick`, `onCastleClick` nastav `activeDetail` — otevření nového detailu automaticky zavře předchozí.
- `onDetailClose` nastaví `activeDetail` na `null`.

**v22b.2 — Sjednoť pozici overlaye**
- Oba detaily (`PeakDetail`, `CastleDetail`) renderuj do stejného místa v DOM — stejný `position`, stejný `top`/`right`/`bottom`/`left`, stejná `z-index`.
- Ideálně: jeden wrapper `<div>` s fixní pozicí, uvnitř podmíněně `{activeDetail.type === "peak" && <PeakDetail>}` nebo `<CastleDetail>`.
- Žádná animace přechodu není nutná — stačí okamžité nahrazení.

**v22b.3 — Ověření**
- Otevři detail kopce → klikni na zámek → ověř, že kopec zmizel a zámek se zobrazil na stejném místě.
- Otevři detail zámku → klikni na kopec → ověř analogicky.
- Zavři detail → ověř, že slot je prázdný.
- TS 0 chyb, build OK.

**Poznámky:**
- `useModuleSidebar` hook se tohoto netýká — sidebar a detail overlay jsou ortogonální UI oblasti.
- Pokud `PeakDetail` / `CastleDetail` přijímají `onClose` prop, nech je tak — jen sjednoť stav nad nimi.

---

## PRIORITA 1 — v23: Oblasti pro modul Zámky

### Kontext a analýza
Modul Hory má plnohodnotný systém oblastí (tabulky `areas` + `location_areas`, endpoint `/api/areas`, filtraci v sidebaru s persistencí do localStorage). Modul Zámky oblasti nemá.

Oblasti pro zámky mají jiný charakter než horské oblasti — pro zámky jsou přirozenou hierarchií **kraje nebo historické oblasti** (Čechy, Morava, Slezsko; nebo 14 krajů ČR + SR kraje). Data pro krajovou příslušnost jsou dostupná přímo v OSM tagách zámků (`addr:region`, `is_in:region`) nebo přes reverse geocoding z lat/lon.

Toto je **střednědobá priorita** — přidá filtraci podle kraje do `CastlesSidebar`, analogii k oblastní filtraci v `PeaksSidebar`.

### Architektonické rozhodnutí
Vzor je přesně definován v PROJECT_CONTEXT (Fáze 9.4–9.6). Nový modul dostane oblasti stejnou cestou:
1. `areas` tabulka + `location_areas` M:N — generické, modulové. Seed není potřeba (oblasti se plní synchronizací).
2. `POST /api/sync-castles-areas` (admin) nebo rozšíření `POST /api/sync-castles` o oblast-linkování.
3. `GET /api/castles/areas` (veřejný) nebo rozšíření `GET /api/areas?module=castles`.
4. `CastlesSidebar` — filtr podle oblasti (analogie PeaksSidebar `FilterSection`).

### Zadání (odloženo — nutná v22 nejprve)

Toto mileston je podmíněn dostupností dat zámků (v22). Až bude `data/castles.geojson` v repozitáři, Coder provede:

**v23.1 — Audit OSM tagů v datech zámků**
- Otevři `data/castles.geojson` a zkontroluj, jaké tagy jsou přítomny (`addr:region`, `addr:county`, `is_in`, `name:en`).
- Na základě dostupnosti dat rozhodni: parsovat oblast ze souborových tagů, nebo použít jednoduchý bbox grid pro CZ/SK kraje.
- Zapiš závěr do RELEASE_NOTES.

**v23.2–v23.4 — Implementace** (Zadáme po v23.1 auditu — Architect rozhodne approach.)

---

## PRIORITA 2 — v24: Třetí modul — rozšíření platformy

### Kontext a analýza
Architektonický vzor pro nový modul je plně etablovaný a zdokumentovaný v PROJECT_CONTEXT. Po stabilizaci modulu Zámky (v22) je přidání třetího modulu přirozený krok.

**Kandidáti (Architect preferuje v tomto pořadí):**

1. **Rozhledny** — OSM tag `tourism=viewpoint`, bohaté pokrytí CZ+SK, přirozený zájem hikerů. Data dostupná z Overpass (lokální scrape bez Playwright). Nejjednodušší pro implementaci — stejný vzor jako Zámky.

2. **Pivovary** — OSM tag `craft=brewery` nebo `amenity=pub` + `microbrewery=yes`. Odlišný charakter — víc POI v městech. Vhodné pro pozdější fázi kdy platforma prokáže model mimo outdoor.

3. **Jeskyně** — OSM tag `natural=cave_entrance`. Niche, ale silně tematicky zaměřené na outdoorový segment.

**Doporučení Architekta: Rozhledny jako v24** — nejbližší Hory modulu v charakteru uživatele (outdoor), maximální synergii s challenges a trip planning.

### Zadání (nevysílat Coderovi dokud Architect nepotvrdí volbu modulu)

Bude definováno po potvrzení volby modulu. Vzor viz PROJECT_CONTEXT — "Přidávání nových modulů — architektonický vzor".

---

## Pending technický dluh

### TD-19-manual: Drop `hory_ascents_cache` z DB
`pnpm drizzle-kit push --force` v TTY pro odebrání zastaralé tabulky ze schématu. Stále čeká. Není blokující pro vývoj. Spustit ručně v terminálu — nejde přes agent.

---

## Deprioritizováno (nemazat, neinvestovat)

- **Manuální plánování tras** — TripPanel, RoutesSidebar, waypoint management (v10–v12) jsou kompletní a funkční. Žádné nové featury.
- **Waypoint přidávání z mapy** — odloženo indefinitně.
- **AI-first plánování** — budoucí milestone po stabilizaci modulární platformy.

---

## Uzavřené verze (souhrn)

- **v22 + v22b (2026-04-27):** `data/castles.geojson` commitnut (69 238 ř.), sync-castles endpoint verified OK, `scrape:castles` already present. Unified locality detail slot — `ActiveDetail` discriminated union, single overlay position `bottom-4 left-4`, `handleDetailClose`. TS 0 chyb. Build OK.
- **v16–v21 (2026-04-27):** `useModuleSidebar` hook, sloučení Plánování do jednoho menu (`"planovani"` + `planningTab`), floating overlays pro PeakDetail + CastleDetail, castle filter toggle (analogie peaks), check-in parita ověřena, castles workflow audit + `scripts/scrape-castles.ts` přidán, TD-stub `useCastleLayer.ts` smazán. TS 0 chyb. Build OK.
- **v16-deploy + v16b + v16c (2026-04-27):** DO App Platform deploy stabilizace — DB konektivita, SSL, admin role DB-backed, admin Hory.app credentials v DB, lokální scraping (`pnpm scrape:peaks`, `pnpm scrape:areas`), sync endpointy čtou ze statických souborů. TS 0 chyb.
- **v15 + v15a–v15d** — Live Overpass sync, unified clustering, collapsible filtr, floating ChatPanel, UI opravy.
- **v13 + v14** — Modul Zámky kompletní.
- **v12** — Trips UX: odebrání + řazení waypointů.
- **v10 + v11** — AI plánovač tras: vizualizace, přejmenování, GPX export, smazání výletu.
- **v9.1–v9.7** — Check-in, visit stats, challenges progres, oblasti, area filter.
- **v8.5–v8.7** — Nastavení (AES-256-GCM), admin panel, sync při přihlášení.
- **v21–v26a (dříve)** — Split page.tsx, auth model refaktoring, public endpoints.

---

## Poznámky architekta

- Mutační pattern (v9.1) je závazný: mutace v `page.tsx`, hooks jsou čisté gettery.
- **Admin role (od v16-deploy): DB-backed** — `users.role` (user/admin), `lib/db/admin.ts`. `ADMIN_EMAILS` env odstraněn.
- **Scraping workflow (od v16c): lokální** — `pnpm scrape:*`, výstup do `data/*.json` nebo `data/*.geojson`, commitováno. Sync endpointy čtou ze souborů. Žádný browser na serveru.
- **Admin credentials (od v16-deploy): DB** — Hory.app admin credentials šifrovaně v `data_sources.config`, přes `/api/admin/hory-credentials`.
- Nové moduly: mapová vrstva integrovaná do `useMapEffects` (ne separátní `use<Modul>Layer` hook) — vzor z v15a, závazný.
- `lib/` struktura: každý modul dostane `lib/<modul>/types.ts`.
- `app/(admin)` — Server Component, admin check přes `isAdmin(userId)` z DB.
- GPX generace: bez externích knihoven — čistá string interpolace.
- `useModuleSidebar` hook (v16): generický přes TypeScript generics, neimportuje modul-specifické typy — architektonická podmínka.
- `app/page.tsx` (367 ř.) — orchestrátor, akceptovaná odchylka. Nekrátit dokud není strukturální nutnost.
