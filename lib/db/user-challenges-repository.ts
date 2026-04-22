import { db } from "./index";
import { userChallenges } from "./schema";
import { eq, sql } from "drizzle-orm";

export type UserChallengeRow = {
  id: number;
  challengeId: number;
  startedAt: string;
  completedAt: string | null;
};

function toRow(row: {
  id: number;
  challengeId: number;
  startedAt: Date;
  completedAt: Date | null;
}): UserChallengeRow {
  return {
    id: row.id,
    challengeId: row.challengeId,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function getUserChallenges(userId: string): Promise<UserChallengeRow[]> {
  const rows = await db
    .select({
      id: userChallenges.id,
      challengeId: userChallenges.challengeId,
      startedAt: userChallenges.startedAt,
      completedAt: userChallenges.completedAt,
    })
    .from(userChallenges)
    .where(eq(userChallenges.userId, userId));
  return rows.map(toRow);
}

export async function upsertUserChallenge(
  userId: string,
  challengeId: number,
  completedAt?: Date
): Promise<UserChallengeRow | null> {
  const [row] = await db
    .insert(userChallenges)
    .values({ userId, challengeId, ...(completedAt ? { completedAt } : {}) })
    .onConflictDoUpdate({
      target: [userChallenges.userId, userChallenges.challengeId],
      set: { completedAt: completedAt ?? sql`${userChallenges.completedAt}` },
    })
    .returning();
  return row ? toRow(row) : null;
}
