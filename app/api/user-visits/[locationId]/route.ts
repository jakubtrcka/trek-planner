import { headers } from "next/headers";
import { auth } from "../../../../lib/auth";
import { deleteVisit, findLocationIdByExternalId } from "../../../../lib/db/visits-checkin-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { locationId: externalId } = await params;
  if (!externalId) return Response.json({ error: "Missing locationId" }, { status: 400 });

  const locationId = await findLocationIdByExternalId(externalId);
  if (!locationId) return Response.json({ error: "Lokalita nenalezena" }, { status: 404 });

  const deleted = await deleteVisit(session.user.id, locationId);
  if (!deleted) return Response.json({ error: "Záznam nenalezen" }, { status: 404 });

  return Response.json({ ok: true });
}
