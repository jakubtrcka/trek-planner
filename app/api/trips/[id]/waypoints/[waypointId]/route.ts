import { headers } from "next/headers";
import { auth } from "../../../../../../lib/auth";
import { deleteWaypoint } from "../../../../../../lib/db/trips-waypoints-repository";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; waypointId: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, waypointId } = await params;
  const tripId = parseInt(id, 10);
  const wpId = parseInt(waypointId, 10);
  if (isNaN(tripId) || isNaN(wpId)) {
    return Response.json({ error: "Neplatné ID" }, { status: 400 });
  }

  const deleted = await deleteWaypoint(tripId, session.user.id, wpId);
  if (!deleted) return Response.json({ error: "Waypoint nenalezen" }, { status: 404 });
  return Response.json({ ok: true });
}
