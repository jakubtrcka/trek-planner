import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../../../lib/auth";
import { decrypt } from "../../../lib/crypto";
import { db } from "../../../lib/db/index";
import { modules, userModuleSettings } from "../../../lib/db/schema";
import { upsertUserVisits, getUserVisitsByModule } from "../../../lib/db/visits-repository";
import { HoryUserService } from "../../../providers/hory/HoryUserService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SettingsSchema = z.object({
  horyUsername: z.string().optional(),
  horyPassword: z.string().optional(),
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const map = await getUserVisitsByModule(session.user.id, "mountains");
  const ascentsMap = Object.fromEntries(map);
  return Response.json({ ascentsMap, totalAscents: map.size });
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(userModuleSettings)
    .innerJoin(modules, eq(modules.id, userModuleSettings.moduleId))
    .where(and(eq(userModuleSettings.userId, session.user.id), eq(modules.slug, "mountains")));
  if (!rows.length) return Response.json({ error: "Nastavte hory.app credentials v nastavení" }, { status: 400 });
  const settingsParsed = SettingsSchema.safeParse(rows[0].user_module_settings.settings);
  if (!settingsParsed.success) return Response.json({ error: "Nastavte hory.app credentials v nastavení" }, { status: 400 });
  const { horyUsername, horyPassword } = settingsParsed.data;
  if (!horyUsername || !horyPassword) return Response.json({ error: "Nastavte hory.app credentials v nastavení" }, { status: 400 });
  const username = decrypt(horyUsername);
  const password = decrypt(horyPassword);
  try {
    const result = await new HoryUserService({ username, password }).scrapeUserAscents();
    const inputs = result.ascents.map((a) => ({
      userId: session.user.id,
      externalId: String(a.peakId),
      visitedAt: a.dates[0] ? new Date(a.dates[0]) : new Date(),
      count: a.count,
      rawDates: a.dates,
    }));
    await upsertUserVisits(inputs);
    return Response.json({ ok: true, total: result.totalAscents });
  } catch (err) {
    console.error("user-ascents scrape failed", err);
    return Response.json({ error: "Chyba při načítání výstupů." }, { status: 503 });
  }
}
