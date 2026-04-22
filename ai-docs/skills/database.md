# SKILL: Database, Drizzle a Auth

## Stack a Konfigurace
- **DB:** PostgreSQL 16 + Drizzle ORM.
- **Auth:** Better Auth 1.6+ (tabulky: `user`, `session`, `account`, `verification`).
- **Migrace:** Dev prostředí používá `drizzle-kit push --force`.

## Pravidla pro Data
1. **Batching:** Při insertech > 100 řádků povinný batching (po 500) kvůli prevenci stack overflow.
2. **JSONB:** Drizzle vrací JSONB jako `unknown`, vždy povinně použít `zod.safeParse` pro typovou bezpečnost.
3. **Encryption:** Citlivá pole (např. externí hesla v `user_module_settings`) šifrovat AES-256-GCM přes `SETTINGS_ENCRYPTION_KEY`.
4. **Relace:** Vždy definovat `foreign keys` (FK) se správným `onDelete` chováním (většinou `cascade`).

