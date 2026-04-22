import { db } from "./index";
import { challenges, challengeLocations, locations, modules } from "./schema";
import { eq, inArray } from "drizzle-orm";
import type { ChallengeItem } from "../../providers/hory/schemas";

export async function upsertChallenges(moduleId: number, items: ChallengeItem[]): Promise<void> {
  for (let i = 0; i < items.length; i += 50) {
    for (const item of items.slice(i, i + 50)) {
      const { category, activeFrom, activeTo, rulesHtml, gpxUrl, isSpecificList, isCrossword, challengeType, levels, isEnded } = item;
      const metadata = { category, activeFrom, activeTo, rulesHtml, gpxUrl, isSpecificList, isCrossword, challengeType, levels, isEnded };
      const [row] = await db
        .insert(challenges)
        .values({ moduleId, name: item.name, description: item.rulesText, sourceUrl: item.url, metadata })
        .onConflictDoUpdate({
          target: [challenges.sourceUrl],
          set: { name: item.name, description: item.rulesText, metadata },
        })
        .returning({ id: challenges.id });
      if (!row) continue;

      await db.delete(challengeLocations).where(eq(challengeLocations.challengeId, row.id));

      const peakIds = [...new Set([
        ...(item.peakIds ?? []),
        ...(item.levels?.flatMap((l) => l.peakIds) ?? []),
      ])];
      if (peakIds.length === 0) continue;

      const locs = await db
        .select({ id: locations.id })
        .from(locations)
        .where(inArray(locations.externalId, peakIds.map(String)));
      if (locs.length === 0) continue;

      await db.insert(challengeLocations)
        .values(locs.map((l) => ({ challengeId: row.id, locationId: l.id })))
        .onConflictDoNothing();
    }
  }
}

export async function getChallengesByModule(
  moduleSlug: string
): Promise<Array<{ id: number; name: string; sourceUrl: string | null; metadata: unknown; locationIds: number[] }>> {
  const rows = await db
    .select({ id: challenges.id, name: challenges.name, sourceUrl: challenges.sourceUrl, metadata: challenges.metadata })
    .from(challenges)
    .innerJoin(modules, eq(challenges.moduleId, modules.id))
    .where(eq(modules.slug, moduleSlug));

  return Promise.all(rows.map(async (row) => {
    const locs = await db
      .select({ locationId: challengeLocations.locationId })
      .from(challengeLocations)
      .where(eq(challengeLocations.challengeId, row.id));
    return { ...row, locationIds: locs.map((l) => l.locationId) };
  }));
}
