import { seedModules } from "./seed";

let initialized = false;
let initializing: Promise<void> | null = null;

export async function ensureDbInitialized() {
  if (initialized) return;
  if (initializing) return initializing;

  initializing = (async () => {
    try {
      await seedModules();
      console.log("[lazy-init] Seed hotový.");
      initialized = true;
    } catch (err) {
      initializing = null;
      console.error("[lazy-init] Seed selhal:", err);
    }
  })();

  return initializing;
}
