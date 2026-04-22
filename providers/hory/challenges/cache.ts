import fs from "node:fs/promises";
import path from "node:path";
import { ChallengesCacheSchema, type ChallengesCache } from "../schemas";

const CACHE_DIR = path.join(process.cwd(), "data", "points-cache");
export const CHALLENGES_CACHE_PATH = path.join(CACHE_DIR, "all-challenges.json");

export async function readChallengesCache(): Promise<ChallengesCache | null> {
  try {
    const raw = await fs.readFile(CHALLENGES_CACHE_PATH, "utf8");
    const result = ChallengesCacheSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeChallengesCache(payload: ChallengesCache): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CHALLENGES_CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
}
