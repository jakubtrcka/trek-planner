import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../lib/db/index";
import { seedModules } from "../lib/db/seed";

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function run() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await migrate(db, { migrationsFolder });
      console.log("[db-startup] Migrace hotové.");
      await seedModules();
      console.log("[db-startup] Seed hotový.");
      return;
    } catch (err) {
      lastError = err;
      const delay = attempt * 2000;
      const cause = (err as any)?.cause;
      console.warn(`[db-startup] Pokus ${attempt}/5 selhal:`, (err as Error).message);
      if (cause) console.warn("  Příčina:", cause.message ?? cause);
      if (attempt < 5) await new Promise((r) => setTimeout(r, delay));
    }
  }
  const cause = (lastError as any)?.cause;
  console.error("[db-startup] Všechny pokusy selhaly:", (lastError as Error).message);
  if (cause) console.error("  Příčina:", cause.message ?? cause);
  process.exit(1);
}

run();
