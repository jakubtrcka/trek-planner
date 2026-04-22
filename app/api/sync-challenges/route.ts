import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../../../lib/db/index";
import { modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { ChallengesCacheSchema } from "../../../providers/hory/schemas";
import { upsertChallenges } from "../../../lib/db/challenges-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_PATH = path.join(process.cwd(), "data", "points-cache", "all-challenges.json");

export async function POST() {
  let raw: string;
  try {
    raw = await fs.readFile(CACHE_PATH, "utf8");
  } catch {
    return Response.json({ error: "Cache soubor nenalezen." }, { status: 404 });
  }

  const parsed = ChallengesCacheSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return Response.json({ error: "Neplatný formát cache.", details: parsed.error.issues }, { status: 400 });
  }

  const [mod] = await db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.slug, "mountains"))
    .limit(1);

  if (!mod) {
    return Response.json({ error: "Modul 'mountains' nenalezen. Spusť seed." }, { status: 500 });
  }

  const all = parsed.data.challenges;
  const active = all.filter((c) => c.isEnded !== true);

  try {
    await upsertChallenges(mod.id, active);
  } catch {
    return Response.json({ error: "Chyba při ukládání do DB." }, { status: 503 });
  }

  return Response.json({ ok: true, total: all.length, seeded: active.length });
}
