# RELEASE_NOTES — [[ai-docs/CODER|Coder]] výstup pro [[ai-docs/ARCHITECT|Architekta]]
> Datum: 2026-04-24 | Branch: main | Autor: Claude Sonnet 4.6 (claude-sonnet-4-6)
> Verze: v16-deploy

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
