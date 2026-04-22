import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "../../../lib/auth";
import { upsertVisit, findLocationIdByExternalId } from "../../../lib/db/visits-checkin-repository";
import { getUserVisits } from "../../../lib/db/visits-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const visits = await getUserVisits(session.user.id);
  return Response.json({ visits });
}

const BodySchema = z.object({
  locationId: z.string().min(1),
  visitedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  const { locationId: externalId, visitedAt } = parsed.data;
  const locationId = await findLocationIdByExternalId(externalId);
  if (!locationId) return Response.json({ error: "Lokalita nenalezena" }, { status: 404 });

  const result = await upsertVisit(session.user.id, locationId, visitedAt ? new Date(visitedAt) : undefined);
  if (!result) return Response.json({ error: "Uložení se nezdařilo" }, { status: 500 });

  return Response.json({ ok: true, visit: result });
}
