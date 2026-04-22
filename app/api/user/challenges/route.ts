import { headers } from "next/headers";
import { auth } from "../../../../lib/auth";
import { getUserChallenges } from "../../../../lib/db/user-challenges-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const challenges = await getUserChallenges(session.user.id);
  return Response.json({ challenges });
}
