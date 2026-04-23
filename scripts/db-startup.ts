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
      console.warn(`[db-startup] Pokus ${attempt}/5 selhal, retry za ${delay / 1000}s:`, (err as Error).message);
      if (attempt < 5) await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.error("[db-startup] Všechny pokusy selhaly:", (lastError as Error).message);
  process.exit(1);
}

run();
