# RELEASE_NOTES — [[ai-docs/CODER|Coder]] výstup pro [[ai-docs/ARCHITECT|Architekta]]
> Datum: 2026-04-27 | Branch: main | Autor: Claude Sonnet 4.6 (claude-sonnet-4-6)
> Verze: v16-deploy + v16b-bugfix + v16c-admin-credentials + v16d-playwright-fix + v16e-static-data-files

---

## v16e-static-data-files — Lokální scraping do statických souborů, sync z disku

### Status: ✅

### Files Changed

| Soubor | Operace | Popis |
|---|---|---|
| `scripts/scrape-peaks.ts` | CREATE | Lokální Playwright scraper → `data/peaks.json` |
| `scripts/scrape-areas.ts` | CREATE | Lokální Playwright scraper → `data/areas.json` |
| `app/api/sync-peaks/route.ts` | REWRITE | Čte z `data/peaks.json`, upsertuje do DB — žádný Playwright na serveru |
| `app/api/sync-areas/route.ts` | REWRITE | Čte z `data/areas.json`, upsertuje do DB — žádný Playwright na serveru |
| `package.json` | UPDATE | Přidány skripty `scrape:peaks` a `scrape:areas` |

### Architektura

**Dřív:** Admin panel → `/api/sync-peaks` → Playwright scraper na serveru → DB

**Nyní:**
```
Lokálně:   pnpm scrape:peaks  →  data/peaks.json  →  git commit & push
Produkce:  Admin panel → /api/sync-peaks → čte data/peaks.json → DB
```

Stejný princip jako `export.geojson` u zámků — statický soubor v repozitáři, server jen importuje.

### Workflow pro správce dat

1. Lokálně nastav `HORY_USERNAME` a `HORY_PASSWORD` v `.env.local`
2. Spusť `pnpm scrape:peaks` (trvá 5–15 min, Playwright crawluje hory.app)
3. Commitni `data/peaks.json` a pushnout
4. V Admin panelu klikni **Sync Vrcholy** — rychlý import z JSON do DB

### Technical Audit

- **pnpm tsc --noEmit:** ✅ čisté

---

## v16d-playwright-fix — Neúspěšné pokusy o Playwright na DO App Platform

### Status: ⚠️ Zavřeno bez řešení — nahrazeno v16e

### Problémy a pokusy

#### 14. Playwright browser binary chybí na DO runtime

DO App Platform buildpack (heroku/nodejs) odděluje build a runtime prostředí. Browser nainstalovaný v build fázi do `/workspace/.cache/ms-playwright/` nebyl dostupný při runtime.

**Pokus 1:** `pnpm exec playwright install --with-deps chromium` v build skriptu → selhalo (`sudo` nedostupný na DO buildpacku).

**Pokus 2:** `pnpm exec playwright install chromium` v build skriptu → browser nainstalovaný, ale `.cache/` directory není součástí runtime slug.

**Pokus 3:** Přechod na Dockerfile (`dockerfile_path: Dockerfile` v app spec) → DO App Platform ignorovalo spec změnu, stále používalo buildpack.

**Pokus 4:** `pnpm exec playwright install chromium && next start` ve start skriptu → stáhlo browser při každém startu kontejneru, ale DO stále ignorovalo spec s Dockerfile.

**Finální závěr:** Playwright na DO App Platform s buildpack architekturou není spolehlivě řešitelný bez přechodu na Dockerfile deploy (který vyžaduje reset komponenty v DO UI nebo vlastní DO App Platform Dockerfile support). Řešení: přesunout scraping lokálně → statické soubory.

---

## v16c-admin-credentials — Globální admin přihlašovací údaje Hory.app v DB

### Status: ✅

### Files Changed

| Soubor | Operace | Popis |
|---|---|---|
| `app/api/admin/hory-credentials/route.ts` | CREATE | GET/POST endpoint — čte/zapisuje Hory.app credentials do `data_sources.config` (šifrovaně), admin-only |
| `lib/hory-auth.ts` | REWRITE | `getAdminHoryCredentials()` — async, čte z DB (`data_sources.config`); `resolveHoryCredentials()` zachován pro explicitní předání |
| `app/api/sync-peaks/route.ts` | UPDATE | Používá `getAdminHoryCredentials()` místo env; přidán admin auth check |
| `app/api/sync-areas/route.ts` | UPDATE | Používá `getAdminHoryCredentials()` místo env; odstraněn starý import |
| `components/AdminPanel.tsx` | UPDATE | Přidán formulář `HoryCredentialsForm` — načte existující credentials z DB, uloží přes POST |

### Problém a řešení

#### 13. Admin sync vrcholů používal soukromé uživatelské credentials
`sync-peaks` a `sync-areas` původně četly Hory.app přihlašovací údaje z env proměnných (`HORY_USERNAME`, `HORY_PASSWORD`). Ty byly sdíleny se standardní uživatelskou session — admin operace (scraping veřejných vrcholů do DB) tak závisela na soukromých údajích konkrétního uživatele.

**Příčina:** Credentials nebyly architektonicky odděleny — jedno místo pro uživatelský login i admin sync.

**Řešení:** Globální admin credentials jsou uloženy v `data_sources.config` (JSONB, šifrováno přes `lib/crypto.ts`) a vázány na modul `mountains` + type `scraper`. Admin je zadá jednou přes formulář v AdminPanelu — odděleně od uživatelských nastavení v UserSettingsPanel. `getAdminHoryCredentials()` je nyní async a čte výhradně z DB.

### Technical Audit

- **pnpm tsc --noEmit:** ✅ čisté

---

## v16b-bugfix — Oprava smíchání dat peaks/castles, 504 sync, admin polling

> **Poznámka:** Přímé opravy Claudem mimo standardní agent workflow — produkční bugfixy navazující na v16-deploy.

### Status: ✅

### Files Changed

| Soubor | Operace | Popis |
|---|---|---|
| `lib/db/locations-repository.ts` | UPDATE | Nová `getLocationsByModuleAndCountry()` s JOIN na `location_types` |
| `app/api/peaks/route.ts` | UPDATE | Filtruje přes modul mountains (ne všechny lokality) |
| `app/api/sync-peaks/route.ts` | UPDATE | Fire-and-forget: vrátí 202 okamžitě, Playwright běží na pozadí |
| `components/AdminPanel.tsx` | UPDATE | Polling `/api/peaks` každých 10s, přepne z „Běží…" na „OK" po dokončení |
| `app/page.tsx` | UPDATE | Clear `selectedCastle` při přepnutí modulu |
| `hooks/useMapEffects.ts` | UPDATE | `activeModule` přidán do deps clusterovacího efektu + diagnostický log |

### Problémy a řešení

#### 10. Zámky zobrazeny v modulu Hory — data smíchána v DB
`getAllLocations()` vracela **všechny lokality bez ohledu na modul** — peaks i castles dohromady. API `/api/peaks` tedy posílalo i zámky, které se renderovaly jako vrcholy v hory modulu.

**Příčina:** `getAllLocations()` dělá `SELECT * FROM locations` bez JOIN na `location_types`. Castles i peaks sdílí stejnou tabulku `locations`, odlišují se jen přes `type_id → location_types → module_id`.

**Řešení:** Nová funkce `getLocationsByModuleAndCountry(moduleId, countryCode)` joinuje přes `location_types`. `/api/peaks` nyní vždy filtruje podle modulu `mountains` — vrací výhradně vrcholy.

#### 11. 504 Gateway Timeout na sync vrcholů
Playwright scraper na `/api/sync-peaks` trvá 60–120 sekund. DO App Platform gateway timeout je ~30s → 504.

**Řešení:** Endpoint vrátí `202 { status: "started" }` okamžitě. Playwright scrape běží jako fire-and-forget (`runSync().catch(...)`) v procesu serveru (DO App Platform běží jako persistent container, ne serverless). Výsledek loguje: `[sync-peaks] Hotovo: XXXX vrcholů`.

**AdminPanel:** Při `202` zobrazí „Běží…" a každých 10 sekund polluje `/api/peaks?country=cz`. Jakmile počet lokací vzroste, přepne na „OK". Polling se zastaví při přechodu ze stavu `background`.

#### 12. Zámkový detail viditelný v modulu Hory — stale state
`selectedCastle` state přežíval přepnutí modulu. Podmínka `activeModule !== "zamky"` na floating overlay znamenala, že vybraný zámek ze zamky session se zobrazoval jako overlay na mapě v hory modulu.

**Řešení:** `useEffect` při změně `activeModule` volá `setSelectedCastle(null)` (pokud nový modul není `zamky`).

### Technical Audit

- **pnpm tsc --noEmit:** ✅ čisté

---

## v16-deploy — Oprava DO App Platform deploye: DB konektivita, auth, admin role

> **Poznámka:** Tato iterace byla prováděna přímo Claudem mimo standardní agent workflow — řešení produkčních problémů při deployi na Digital Ocean App Platform.

### Status: ✅

### Files Changed

| Soubor | Operace | Popis |
|---|---|---|
| `lib/db/index.ts` | UPDATE | Strip `sslmode` z URL + `rejectUnauthorized: false` + `dotenv.config()` |
| `lib/db/seed.ts` | UPDATE | Přidán `dotenv.config()` pro standalone spuštění |
| `lib/db/lazy-init.ts` | CREATE | Singleton `ensureDbInitialized()` pro lazy seed při prvním requestu |
| `lib/db/admin.ts` | CREATE | `isAdmin(userId)` — dotaz do DB místo env proměnné |
| `lib/db/schema.ts` | UPDATE | Sloupec `role varchar(32) DEFAULT 'user'` v tabulce `user` |
| `lib/auth.ts` | UPDATE | `baseURL` a `secret` z env vars |
| `lib/auth-client.ts` | UPDATE | Odstraněn `baseURL` — klient inferuje z `window.location.origin` |
| `app/api/castles/route.ts` | UPDATE | Lazy init + auto-sync ze souboru (místo Overpass) |
| `app/api/sync-castles/route.ts` | UPDATE | Čte z `export.geojson` přes `CastlesParserService.parse()`, admin přes DB |
| `app/api/sync-areas/route.ts` | UPDATE | Admin check přes `isAdmin(userId)` z DB |
| `app/api/auth/is-admin/route.ts` | UPDATE | Admin check přes `isAdmin(userId)` z DB |
| `app/(admin)/admin/page.tsx` | UPDATE | Admin check přes `isAdmin(userId)` z DB |
| `instrumentation.ts` | UPDATE | Vyprázdněn |
| `package.json` | UPDATE | `db:migrate` → `tsx scripts/db-migrate.ts`, `start` = `next start` |
| `scripts/db-migrate.ts` | CREATE | Vlastní migrační skript (trackuje v `public._migrations`) |
| `scripts/db-test.ts` | CREATE | Diagnostický skript pro testování DB konektivity |
| `drizzle/0000_nosy_raider.sql` | CREATE | Čerstvá migrace — 17 tabulek (smazány staré peaks/user_ascents) |
| `drizzle/0001_left_living_lightning.sql` | CREATE | `ALTER TABLE user ADD COLUMN role` |
| `providers/castles/CastlesScraperService.ts` | DELETE | Mrtvý kód — Overpass scraper nahrazen GeoJSON souborem |
| `scripts/db-startup.ts` | DELETE | Mrtvý kód — nahrazen `scripts/db-migrate.ts` |
| `providers/castles/CastlesParserService.ts` | UPDATE | Odstraněna metoda `parseRaw` (mrtvý kód po smazání scraperu) |
| `drizzle.config.ts` | UPDATE | `NODE_TLS_REJECT_UNAUTHORIZED=0` pro drizzle-kit |

### Problémy a řešení

#### 1. `ENOTFOUND base` — DO private network DNS
DO App Platform injektuje `DATABASE_URL` s hostname `base` přes private network. Tento hostname se resolvuje až po plné registraci kontejneru do service mesh — tedy ne při startu, ale až při prvním HTTP requestu.

**Řešení:** `package.json` `start` = `next start` (bez startup skriptu). `instrumentation.ts` vyprázdněn. Nový `lib/db/lazy-init.ts` se singleton `ensureDbInitialized()` spouští seed při prvním requestu na `/api/castles`.

#### 2. SSL: `SELF_SIGNED_CERT_IN_CHAIN` + `no pg_hba.conf entry... no encryption`
DO Managed Database vyžaduje SSL s self-signed certifikátem. `sslmode=require` v connection URL přebíjí Pool-level `ssl: { rejectUnauthorized: false }`.

**Řešení:** V `lib/db/index.ts` stripovat `sslmode` z URL, nastavit `ssl: { rejectUnauthorized: false }` v Pool konfiguraci + `NODE_TLS_REJECT_UNAUTHORIZED = "0"`.

#### 3. `SASL: client password must be a string` — ESM import hoisting
Statické importy se vykonají před tělem modulu. `lib/db/index.ts` vytvořil Pool (a četl `DATABASE_URL`) ještě před tím, než `dotenv.config()` v jiném modulu načetl `.env.local`.

**Řešení:** `dotenv.config({ path: ".env.local" })` přímo v `lib/db/index.ts` před vytvořením Pool.

#### 4. Staré migrace nekompatibilní se současným schématem
Migrační soubory obsahovaly tabulky `peaks` a `user_ascents` z původní architektury.

**Řešení:** Smazány staré migrační soubory, přegenerováno z aktuálního `schema.ts` → `0000_nosy_raider.sql` (17 tabulek). Migrace spuštěna ručně v pgAdmin.

#### 5. `ERR_CONNECTION_REFUSED` na auth endpointech — BetterAuth `baseURL`
`lib/auth.ts` neměl `baseURL`. BetterAuth fallbackoval na `http://localhost:3000`.

**Řešení:** `baseURL: process.env.BETTER_AUTH_URL` a `secret: process.env.BETTER_AUTH_SECRET` do BetterAuth konfigurace.

#### 6. `ERR_CONNECTION_REFUSED` v prohlížeči — auth klient
`lib/auth-client.ts` četl `NEXT_PUBLIC_BETTER_AUTH_URL` — ta na DO nastavena nebyla (jen `BETTER_AUTH_URL` bez prefixu). Klient fallbackoval na `http://localhost:3000`.

**Řešení:** Odstraněn `baseURL` z klienta úplně. BetterAuth klient bez `baseURL` automaticky použije `window.location.origin`.

#### 7. Overpass API 406/429 — zámky se nenačetly
Overpass API je sdílená infrastruktura, při každém deployi okamžitý request způsoboval rate-limiting.

**Řešení:** Auto-sync i manuální sync (`/api/sync-castles`) přepnuty na `CastlesParserService.parse()` — čte lokální `export.geojson`. Smazán `CastlesScraperService` (mrtvý kód).

#### 8. `permission denied for database dev-db-trek` — drizzle migrátor
Drizzle ORM migrátor i `drizzle-kit migrate` CLI se pokoušejí vytvořit schéma `drizzle` pro tracking migrací. DO Managed DB uživatel na to nemá práva.

**Řešení:** Vlastní `scripts/db-migrate.ts` — trackuje migrace v `public._migrations` (kam uživatel práva má). Idempotentní: zachytí PostgreSQL chyby `42701` (duplicate_column), `42P07` (duplicate_table), `42710` (duplicate_object) a přeskočí je.

#### 9. Admin role v DB místo `ADMIN_EMAILS` env proměnné
Admin kontrola přes env proměnnou je nepraktická a netransparentní.

**Řešení:** Sloupec `role varchar(32) DEFAULT 'user'` v tabulce `user`. `lib/db/admin.ts` s `isAdmin(userId)`. Odstraněna `ADMIN_EMAILS` logika ze všech routes a admin page. Migrace: `drizzle/0001_left_living_lightning.sql`.

### Technical Audit

- **pnpm tsc --noEmit:** ✅ čisté
- **pnpm db:migrate (lokálně):** ✅ idempotentní — 2× aplikováno, 2× přeskočeno

### Postup pro DO produkci

1. `pnpm db:migrate` v DO App Console — aplikuje `0001` (role sloupec), vytvoří `public._migrations`
2. `UPDATE "user" SET role = 'admin' WHERE email = 'tvuj@email.cz';` — nastavení admina
3. Otevřít app → `/api/castles` spustí seed + auto-sync ze souboru
