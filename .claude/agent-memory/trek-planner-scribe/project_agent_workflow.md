---
name: Trek Planner Agent Workflow
description: How the Architect/Coder/Scribe agent roles collaborate and communicate in this project
type: project
---

The Trek Planner project uses a structured multi-agent workflow:

- **Architect** plans tasks in `ai-docs/TODO_NEXT.md` with numbered priorities (e.g., Priorita 20).
- **Coder** implements and writes results to `ai-docs/RELEASE_NOTES.md` with version number, files changed, `wc -l` counts, and a technical audit (tsc + build).
- **Scribe** (this agent) runs after each iteration to: update `PROJECT_CONTEXT.md` (check off roadmap items, update DB schema notes), clean `TEAM_STATE.md`, archive release notes to `ai-docs/archive/RELEASE_NOTES_ARCHIVE.md` (max 5 releases), and reset `RELEASE_NOTES.md` to a blank template.

**Why:** Keeps the context window lean and ensures the Architect always sees a clean, current state.

**How to apply:** When invoked, always read all four files before making any edits. Archive = prepend new release + truncate to 5. Never modify TODO_NEXT.md task content — only the Architect does that (TODO_NEXT is Architect's domain; Scribe only reads it to verify completion).

**User preferences (Jakub):** Minimalist communication ("Easy Mode"). Strict TypeScript (no `any`). Agent communication exclusively via TODO_NEXT and RELEASE_NOTES. Current project phase as of 2026-04-27: **v16-series complete** (DO App Platform deploy stabilizace — DB lazy init, SSL, admin role DB-backed, admin credentials v DB, lokální scraping statické soubory). Next priority: **v22** — commit `data/castles.geojson` + verify sync-castles endpoint (production blocker). Mutational pattern: SWR hooks are pure getters, mutations stay in `page.tsx` — binding for all future hooks.

**Scribe TODO_NEXT handling:** Scribe removes completed detail blocks from TODO_NEXT (e.g., the full task spec sections for closed versions) to keep the file clean. Closed versions are summarised in the "Uzavřené verze" list — that list is maintained by the Coder/Architect, Scribe does not modify it.
