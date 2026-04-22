import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "../../../../../lib/auth";
import { addWaypoint, getWaypointsByTrip } from "../../../../../lib/db/trips-repository";
import { reorderWaypoints } from "../../../../../lib/db/trips-waypoints-repository";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const AddWaypointSchema = z.object({
  locationId: z.number().int().positive(),
  order: z.number().int().min(0),
});

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (isNaN(tripId)) return Response.json({ error: "Neplatné ID" }, { status: 400 });

  const waypoints = await getWaypointsByTrip(tripId);
  return Response.json({ waypoints });
}

export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (isNaN(tripId)) return Response.json({ error: "Neplatné ID" }, { status: 400 });

  const parsed = AddWaypointSchema.safeParse(
    await req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return Response.json({ error: "Neplatná data", issues: parsed.error.issues }, { status: 400 });
  }

  await addWaypoint(tripId, parsed.data.locationId, parsed.data.order);
  return Response.json({ ok: true }, { status: 201 });
}

const ReorderSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
});

export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (isNaN(tripId)) return Response.json({ error: "Neplatné ID" }, { status: 400 });

  const parsed = ReorderSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Neplatná data" }, { status: 400 });

  const ok = await reorderWaypoints(tripId, session.user.id, parsed.data.orderedIds);
  if (!ok) return Response.json({ error: "Výlet nenalezen nebo neplatné waypointy" }, { status: 404 });
  return Response.json({ ok: true });
}
