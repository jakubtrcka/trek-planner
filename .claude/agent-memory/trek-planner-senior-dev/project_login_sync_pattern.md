---
name: Login Sync Trigger Pattern (v8.7)
description: How post-login sync is triggered in Trek Planner — explicit callback, not useEffect on session
type: project
---

Post-login sync uses an explicit `onLoginSuccess?: () => void` callback prop chain: `AuthModal` → `AppHeader` → `app/page.tsx`. The callback calls `fetch$.loadUserAscents(true)` which POSTs to `/api/user-ascents` triggering a fresh hory.app scrape using stored credentials.

**Why:** A `useEffect` watching session state would fire on page load/session restore (cookie-based), not just on fresh login. The callback fires only in `handleLogin` after `authClient.signIn.email()` succeeds — guaranteeing it's triggered exclusively on explicit user login.

**How to apply:** Any future "do X only on login, not on page load" logic should follow the same `onLoginSuccess` callback pattern through `AppHeader` props, not a session `useEffect`.
