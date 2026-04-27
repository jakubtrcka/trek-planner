import { headers } from "next/headers";
import { auth } from "../../../lib/auth";
import { db } from "../../../lib/db/index";
import { modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { upsertArea } from "../../../lib/db/areas-repository";
import { isAdmin } from "../../../lib/db/admin";
import fs from "fs";
import path from "path";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AreaSchema = z.object({
  name: z.string(),
  url: z.string(),
  slug: z.string(),
});

const AreasFileSchema = z.object({
  scrapedAt: z.string(),
  areas: z.array(AreaSchema),
});

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [mod] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, "mountains")).limit(1);
  if (!mod) return Response.json({ error: "Modul 'mountains' nenalezen. Spusť seed." }, { status: 500 });

  const dataFile = path.join(process.cwd(), "data", "areas.json");
  if (!fs.existsSync(dataFile)) {
    return Response.json({ error: "Soubor data/areas.json neexistuje. Spusť lokálně: pnpm scrape:areas" }, { status: 404 });
  }

  const raw = JSON.parse(fs.readFileSync(dataFile, "utf-8")) as unknown;
  const { areas, scrapedAt } = AreasFileSchema.parse(raw);

  let synced = 0;
  for (const area of areas) {
    await upsertArea(mod.id, area.slug, area.name, area.url);
    synced += 1;
  }

  return Response.json({ ok: true, synced, total: areas.length, scrapedAt });
}
