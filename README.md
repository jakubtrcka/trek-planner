# Hory.app scraper (Next.js)

Jednoduchá aplikace v Next.js, která:
- vezme login + heslo pro `cs.hory.app`,
- přihlásí se přes headless browser (Playwright),
- načte stránku (default `https://cs.hory.app/country/czech-republic`),
- načte seznam pohoří,
- umí také vrátit body načtené v mapovém modulu (OpenStreetMap vrstva),
- umožňuje filtrovat vrcholy podle počátečních písmen a zobrazit je na OSM mapě.
- má 2krokový workflow: po přihlášení načte oblasti a jejich hranice, výběr oblastí pak probíhá klikáním v mapě.

## Spuštění

```bash
cp .env.example .env.local
npm install
npx playwright install chromium
npm run dev
```

Pak otevři `http://localhost:3000`.

`MAPY_API_KEY` v `.env.local` je povinný pro plánování tras (`POST /api/plan-route`).
`HORY_TARGET_URL` v `.env.local` určuje zdrojovou country stránku pro scrape (default je ČR).
`GEMINI_API_KEY` je volitelný pro AI parser promptů (`POST /api/ai-plan-route`); bez něj se použije heuristický parser.

## Poznámky

- Endpointy:
  - `POST /api/scrape` (seznam pohoří)
  - `POST /api/area-geojson` (hranice oblastí pro mapový výběr)
  - `POST /api/map-points` (body z mapy)
  - `POST /api/plan-route` (plánování turistických tras přes Mapy.com Routing API)
  - `POST /api/ai-plan-route` (textový prompt -> intent -> plánování tras)
- Login probíhá server-side, údaje se nikam trvale neukládají.
- Selektory pro login jsou dělané obecně; pokud by se stránka změnila, může být potřeba je upravit v `app/api/scrape/route.ts`.
- U mapových bodů platí: endpoint vrací vše, co se podaří získat z mapových API odpovědí (GeoJSON/JSON s koordináty) po načtení mapy a krátké interakci (zoom/pan). Pokud backend mapy vrací data po dávkách podle výřezu, může být potřeba scraper rozšířit o systematické procházení bbox.
- `POST /api/map-points` průběžně loguje postup do terminálu (`npm run dev`), např. kolik `/area` stránek už proběhlo a průběžný počet bodů.
- Volitelně lze poslat `maxRanges` (1-300) pro omezení počtu procházených `/area` stránek při country URL.
- Výstup bodů nyní obsahuje i `peakName` (název vrcholu), a pokud je dostupné, také `altitude` a `mountainLink`.
- V UI je filtr písmen abecedy; do API se posílá jako `startsWithLetters`.
- Výběr oblastí probíhá klikáním v mapě polygonů (toggle výběru), technicky přes `selectedAreaUrls`.

## Debug mapy

Pro analýzu toho, co se při načtení mapy opravdu volá (network + JS bundly), je v projektu script:

```bash
HORY_USERNAME='tvuj_login' \
HORY_PASSWORD='tvoje_heslo' \
TARGET_URL='https://cs.hory.app/country/czech-republic' \
npm run inspect:map
```

Výstup uloží do `map-debug-report.json`:
- `filteredNetwork`: kandidátní requesty pro mapu (xhr/fetch/tile/json),
- `scriptInsights`: nalezené URL/API stringy z načtených JS souborů,
- `counters`: rychlé počty (`jsonLike`, `tileLike` atd.).
