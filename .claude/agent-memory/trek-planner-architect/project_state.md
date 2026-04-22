---
name: Trek Planner — aktuální stav projektu
description: Stav fází a klíčových architektonických rozhodnutí projektu Trek Planner
type: project
---

Fáze 0–v12 dokončeny (stav 2026-04-22). Strategický pivot schválen 2026-04-22.

**Strategický pivot (2026-04-22):**
Projekt přeorientován na multi-modulární POI platformu. Manuální trips UX zmrazeno. AI-first plánování tras je budoucí milestone (přes ChatPanel). Bezprostřední priorita: nové POI moduly + visit tracking.

**v13 — Nový modul Zámky (aktuální priorita):**
5 kroků: seed (`castles` modul), provider (`providers/castles/`), sync+get API routes, CastleDetail.tsx s check-in, mapová vrstva + layer toggle. Visit tracking (`user_visits`) je generický — funguje bez změn.

**Klíčový pattern etablovaný v v9.1 (závazný):** Mutace zůstávají v `page.tsx` handler vrstvě. Hooks jsou čisté gettery.

**Architektonický vzor pro nové moduly:**
1. `lib/db/seed.ts` — idempotentní seed (onConflictDoUpdate).
2. `providers/<modul>/` — Playwright scraper.
3. `POST /api/sync-<modul>` (admin) + `GET /api/<modul>` (veřejný).
4. `<Modul>Detail.tsx` — detail s check-in tlačítkem.
5. Mapová vrstva v `app/page.tsx` + layer toggle.

**Trvalé výjimky akceptované architektem:**
- `detail.ts` (244 ř.) — `page.evaluate()` blok nelze rozdělit přes hranice souborů.
- `hooks/useDataFetching.ts` (228 ř.), `useMapEffects.ts`, `useChallenges.ts` — výjimka pro kompoziční kategorii.
- `providers/hory/HoryScraperService.ts` (962 ř.) — výjimka pro `page.evaluate()` blok.
- `hooks/useHoryCredentials.ts` (64 ř.) — threading by byl složitější.
- `components/PeaksSidebar.tsx` (205 ř.) — soudržný UI celek.
- `app/page.tsx` (~245 ř.) — orchestrátor.

**Pending neblokující:**
- `pnpm drizzle-kit push --force` v TTY pro drop `hory_ascents_cache` (TD-19-manual).
