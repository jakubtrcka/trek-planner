import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Pool } from "pg";

async function main() {
  const rawUrl = process.env.DATABASE_URL ?? "";
  console.log("DATABASE_URL set:", !!rawUrl);
  console.log("URL prefix:", rawUrl?.substring(0, 40) + "...");

  const isLocal = !rawUrl || rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1");
  console.log("isLocal:", isLocal);

  // Strip sslmode z URL a vypni verifikaci certifikátu
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const parsed = isLocal ? new URL("postgres://localhost") : new URL(rawUrl);
  if (!isLocal) parsed.searchParams.delete("sslmode");
  const connectionString = isLocal ? rawUrl : parsed.toString();
  console.log("URL (stripped):", connectionString.substring(0, 50) + "...");

  const pool = new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  try {
    const res = await pool.query("SELECT 1 as ok");
    console.log("✓ Connection OK:", res.rows);
  } catch (err: any) {
    console.error("✗ Connection FAILED:", err.message);
    console.error("  Cause:", err.cause?.message ?? err.cause ?? "(none)");
    console.error("  Code:", err.code);
  }

  await pool.end();
}

main();
