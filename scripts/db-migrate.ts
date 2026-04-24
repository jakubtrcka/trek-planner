import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import path from "path";
import fs from "fs";
import { db } from "../lib/db/index";
import { sql } from "drizzle-orm";

const migrationsFolder = path.join(process.cwd(), "drizzle");

function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as any)?.cause?.code ?? (err as any)?.code;
  return code === "42701" || code === "42P07" || code === "42710"; // duplicate_column, duplicate_table, duplicate_object
}

async function run() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public._migrations (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamp DEFAULT now() NOT NULL
    )
  `);

  const applied = await db.execute(sql`SELECT name FROM public._migrations`);
  const appliedNames = new Set((applied as any).rows.map((r: any) => r.name as string));

  const files = fs.readdirSync(migrationsFolder)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`[migrate] Přeskočeno: ${file}`);
      continue;
    }

    const content = fs.readFileSync(path.join(migrationsFolder, file), "utf-8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`[migrate] Aplikuji: ${file} (${statements.length} příkazů)...`);
    let failed = 0;
    for (const statement of statements) {
      try {
        await db.execute(sql.raw(statement));
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          // příkaz byl již aplikován dříve — přeskočíme
        } else {
          console.error(`[migrate] Chyba v příkazu:\n${statement}\n`, (err as Error).message);
          throw err;
        }
      }
    }

    await db.execute(sql`INSERT INTO public._migrations (name) VALUES (${file})`);
    console.log(`[migrate] OK: ${file}`);
    ran++;
  }

  console.log(`[migrate] Hotovo. Aplikováno: ${ran}, přeskočeno: ${files.length - ran}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("[migrate] Chyba:", (err as Error).message);
  process.exit(1);
});
