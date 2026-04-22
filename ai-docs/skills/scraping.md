# SKILL: Scraping a Playwright

## Standardy a Lokalita
- **Technologie**: Playwright 1.54+ (Chromium).
- **Architektura**: Scraping logicky patří do `providers/[module_name]/`. Nesmí běžet přímo v API routě.
- **Provider Pattern**: Každý scraper musí implementovat standardizované metody:
    - `seed()`: Prvotní naplnění lokalit do DB.
    - `sync()`: Aktualizace existujících dat (např. nové výzvy).
- **Validace**: Veškerý výstup ze scraperu (objekty před zápisem do DB) musí projít `zod` validací (např. v `providers/[module]/schemas.ts`).

## Odolnost a Etika
- **Anti-blocking**: Používat reálné `User-Agent` hlavičky.
- **Throttling**: Implementovat rozumné pauzy mezi požadavky (`throttleMs`), aby nedocházelo k přetěžování cílových serverů.
- **Headless**: V produkčním/serverovém prostředí běžet v `headless: true`.

## Práce s daty a Cache
- **Disk Cache**: Vždy nejprve číst z diskové cache (např. `data/points-cache/`), pokud není explicitně vyžadován `forceRefresh`.
- **Database First**: Pokud data existují v DB a nejsou expirovaná, scraper se vůbec nespouští.