import { db } from "./index";
import { users } from "./schema";
import { eq } from "drizzle-orm";

export async function isAdmin(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.role === "admin";
}
