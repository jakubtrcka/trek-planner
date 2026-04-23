import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const rawUrl = process.env.DATABASE_URL ?? "";
const isLocal = !rawUrl || rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1");

function buildPoolConfig() {
  if (isLocal) return { connectionString: rawUrl };
  // sslmode v URL přebíjí Pool-level ssl options — stripujeme ho a řídíme SSL sami
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const parsed = new URL(rawUrl);
  parsed.searchParams.delete("sslmode");
  return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
}

const pool = new Pool(buildPoolConfig());
export const db = drizzle(pool);
