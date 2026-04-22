# SKILL: TypeScript a Typová bezpečnost

## Striktní pravidla (Zero Tolerance)
- **Framework & Runtime**: Next.js 15.2+ (App Router), React 19.
- **TypeScript Core**: Verze 5.7+, Strict Mode: **ON**.
- **No `any`**: Každá proměnná, parametr funkce a návratová hodnota musí mít explicitní typ. Použití `any` je důvodem k okamžitému REFIXu.
- **No Casting**: Zákaz používání `as Type` pro:
    - `JSON.parse()`
    - `request.json()`
    - Výstupy z DB JSONB sloupců (viz [[ai-docs/skills/database|Database Skill]]).
- **Zod Validation**: Povinná pro každý externí nebo nespolehlivý vstup:
    - API Body / Query parametry.
    - Disk cache (soubory v `data/`).
    - DB JSONB metadata.
    - **Vždy** odvozovat TypeScript typy přes `z.infer<typeof schema>`.

## Architektura Typů
- **Domain Types**: Definovat v `lib/types/` (pokud jsou sdílené) nebo přímo u schémat v `lib/db/schema.ts`.
- **Module Specifics**: Pro metadata různých modulů (hory, zámky) používat diskriminované uniony (Discriminated Unions), aby TypeScript věděl, že u modulu 'hory' existuje v metadatech 'altitude'.

## Error Handling
- **Větvení logiky**: Nikdy nepoužívat `error.message.includes()`.
- **Typované chyby**: Používat vlastní Error třídy (např. `AppError`, `HoryAuthError`) s atributy `statusCode` a `code`.
- **Try/Catch**: V API routách vždy ošetřit nečekané chyby a vracet standardizovaný JSON response (viz [[ai-docs/skills/clean-code|Clean Code Skill]]).