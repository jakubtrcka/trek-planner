import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "../../../lib/auth";
import { createTrip, getTripsByUser } from "../../../lib/db/trips-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const trips = await getTripsByUser(session.user.id);
  return Response.json({ trips, count: trips.length });
}

const CreateTripSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateTripSchema.safeParse(
    await req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return Response.json({ error: "Neplatná data", issues: parsed.error.issues }, { status: 400 });
  }

  const trip = await createTrip(session.user.id, parsed.data.name);
  return Response.json({ trip }, { status: 201 });
}
