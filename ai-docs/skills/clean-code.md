# SKILL: Clean Code a Architektura

## Striktní pravidla (Zero Tolerance)
1. **Shadcn First**: Nepiš vlastní CSS, prioritně využívej shadcn/ui a Tailwind CSS 4.
2. **Scraper Isolation**: Scrapování nesmí běžet v API route. Logika musí být v `providers/` (viz [[ai-docs/skills/scraping|Scraping Standard]]).
3. **Validation First**: Veškerá data (API vstupy, výstupy scraperů, DB JSONB) musí být validována přes `zod`.
4. **Env Safety**: Citlivé údaje (klíče, hesla) patří výhradně do `.env.local`.
5. **No `any`**: Vše musí mít explicitní typy nebo interface (viz [[ai-docs/skills/typescript|TypeScript Skill]]).
6. **Auth Security**: Každá chráněná operace musí ověřovat Better Auth session.

## Souborové limity (Hard Caps)
- Hooks (state/getter): max 25 řádků (výjimka 30 ř. pro > 3 návratové hodnoty).
- Hooks (kompoziční): max 120 řádků — platí pro hooks agregující více `useEffect` nebo async operací (např. `useDataFetching`, `useMapEffects`). Musí být zdůvodněno v RELEASE_NOTES.
- API Routes: max 50 řádků (výjimka 80 ř. pro komplexní input).
- Utility (lib/): max 60 řádků.
- Service (providers/): max 120 řádků.

## Architektonické konvence
- **Vícevrstvý Backend**: Business logika je striktně oddělena od UI a rout. Routa pouze parsuje vstup přes `zod` a volá service/repository.
- **Provider Pattern**: Specifické implementace pro externí zdroje (Sync/Seed) jsou zapouzdřeny v `providers/`.
- **Adresářová struktura**: 
    - `app/(admin)` a `app/(user)` pro rozdělení rolí.
    - `lib/`, `providers/`, `hooks/`, `components/`. 
    - Nepoužívat `src/` prefix.
- **Reporting**: Po každém zápisu souboru povinné měření délky přes `wc -l`.


## Adresářová struktura a Standardy (Strict)
Projekt striktně dodržuje toto rozdělení (nepoužívat `src/` prefix):

- **`app/`**: Next.js App Router (stránky a routy).
    - `app/(admin)`: Layout a stránky pro správu platformy.
    - `app/(user)`: Hlavní mapové rozhraní pro uživatele.
    - `app/api/auth/[...all]/`: Koncový bod pro Better Auth handler.
- **`components/`**: UI komponenty (prioritně shadcn/ui).
- **`lib/`**: Jádro logiky a konfigurace.
    - `lib/auth.ts` & `lib/auth-client.ts`: Instance Better Auth (server/client).
    - `lib/db/`: Definice `schema.ts`, `migrations/` a Drizzle konfigurace.
- **`providers/`**: Služby a externí integrace. Zde sídlí scrapery, AI logika a moduly.
- **`hooks/`**: Vlastní React hooky pro sdílenou logiku v UI.
- **`public/`**: Statické soubory, mapové podklady a ikony.