import { headers } from "next/headers";
import { auth } from "../../../../../lib/auth";
import { getTripById, getWaypointsByTrip } from "../../../../../lib/db/trips-repository";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (isNaN(tripId)) return Response.json({ error: "Neplatné ID" }, { status: 400 });

  const trip = await getTripById(tripId, session.user.id);
  if (!trip) return Response.json({ error: "Výlet nenalezen" }, { status: 404 });

  const waypoints = await getWaypointsByTrip(tripId);
  const sorted = [...waypoints].sort((a, b) => a.order - b.order);

  const trkpts = sorted
    .map((w) => `      <trkpt lat="${w.lat}" lon="${w.lon}">${w.name ? `<name>${escapeXml(w.name)}</name>` : ""}</trkpt>`)
    .join("\n");

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Hory" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(trip.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

  const filename = trip.name.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "_") + ".gpx";
  return new Response(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
