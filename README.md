# Trek Planner

Mapová aplikace pro plánování výletů s modulárním systémem lokalit (horské vrcholy, hrady a zámky, ...).

## Spuštění lokálně

```bash
pnpm install
pnpm dev
```

Otevři `http://localhost:3000`.

### Požadované proměnné prostředí (`.env.local`)

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
SETTINGS_ENCRYPTION_KEY=...
```

### Migrace DB

```bash
pnpm db:migrate
```

---

## Příprava dat — lokální scraping

Data do DB se načítají ze statických JSON souborů commitnutých v repozitáři.
Playwright běží **pouze lokálně**, produkční server scraper nepotřebuje.

### 1. Nastav Hory.app přihlašovací údaje v `.env.local`

```env
HORY_USERNAME=tvuj@email.cz
HORY_PASSWORD=tvoje_heslo
```

Volitelně:
```env
HORY_TARGET_URL=https://cs.hory.app/country/czech-republic
HORY_COUNTRY_CODE=cz
```

### 2. Nainstaluj Playwright browser (jednou)

```bash
pnpm exec playwright install chromium
```

### 3. Spusť scraper

```bash
# Vrcholy (~5–15 minut, crawluje všechny oblasti)
pnpm scrape:peaks

# Oblasti (rychlé, jen seznam pohoří)
pnpm scrape:areas
```

Výstup:
- `data/peaks.json` — seznam vrcholů s koordináty, nadmořskou výškou a odkazem na oblast
- `data/areas.json` — seznam pohoří s URL a slugem

### 4. Commitni a pushni data

```bash
git add data/peaks.json data/areas.json
git commit -m "data: aktualizuj vrcholy a oblasti"
git push
```

### 5. Importuj do DB přes Admin panel

Po deployi klikni v Admin panelu na **Sync Vrcholy** a **Sync Oblasti**.
Endpoint přečte JSON soubor z disku a upsertuje záznamy do DB (sekundy, žádný browser).

---

## Admin panel

Dostupný na `/admin` (vyžaduje roli `admin` v DB).

Pro nastavení admin role v produkci:
```sql
UPDATE "user" SET role = 'admin' WHERE email = 'tvuj@email.cz';
```

---

## Struktura dat

| Soubor | Obsah |
|---|---|
| `data/peaks.json` | Horské vrcholy (ČR) — scraping z hory.app |
| `data/areas.json` | Pohoří (ČR) — scraping z hory.app |
| `public/export.geojson` | Hrady a zámky — export z OpenStreetMap |
