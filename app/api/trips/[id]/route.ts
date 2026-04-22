import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "../../../../lib/auth";
import { updateTrip, deleteTrip } from "../../../../lib/db/trips-repository";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const PatchTripSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  notes: z.string().optional(),
}).refine((d) => d.name !== undefined || d.notes !== undefined, { message: "At least one field required" });

export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (isNaN(tripId)) return Response.json({ error: "Neplatné ID" }, { status: 400 });

  const parsed = PatchTripSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Neplatná data" }, { status: 400 });

  const trip = await updateTrip(tripId, session.user.id, parsed.data);
  if (!trip) return Response.json({ error: "Výlet nenalezen" }, { status: 404 });
  return Response.json({ trip });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (isNaN(tripId)) return Response.json({ error: "Neplatné ID" }, { status: 400 });

  const deleted = await deleteTrip(tripId, session.user.id);
  if (!deleted) return Response.json({ error: "Výlet nenalezen" }, { status: 404 });
  return Response.json({ ok: true });
}
