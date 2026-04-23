import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});
export const db = drizzle(pool);
