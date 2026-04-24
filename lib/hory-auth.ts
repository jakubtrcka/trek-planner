import { eq, and } from "drizzle-orm";
import { db } from "./db/index";
import { dataSources, modules } from "./db/schema";
import { decrypt } from "./crypto";

export async function getAdminHoryCredentials(): Promise<{ username: string; password: string; hasCredentials: boolean }> {
  const [row] = await db
    .select({ config: dataSources.config })
    .from(dataSources)
    .innerJoin(modules, eq(modules.id, dataSources.moduleId))
    .where(and(eq(modules.slug, "mountains"), eq(dataSources.type, "scraper")))
    .limit(1);

  const config = (row?.config ?? {}) as Record<string, string>;
  const username = config.horyUsername ? decrypt(config.horyUsername) : "";
  const password = config.horyPassword ? decrypt(config.horyPassword) : "";
  return { username, password, hasCredentials: Boolean(username && password) };
}

export function resolveHoryCredentials(username?: string, password?: string) {
  const u = username?.trim() || "";
  const p = password || "";
  if (u && p) return { username: u, password: p, hasCredentials: true };
  return { username: "", password: "", hasCredentials: false };
}
