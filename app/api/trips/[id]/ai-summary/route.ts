import { headers } from "next/headers";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { auth } from "../../../../../lib/auth";
import { getWaypointsByTrip, updateTripAiSummary } from "../../../../../lib/db/trips-repository";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (isNaN(tripId)) return Response.json({ error: "Neplatné ID" }, { status: 400 });

  const waypoints = await getWaypointsByTrip(tripId);
  if (!waypoints.length) {
    return Response.json({ error: "Trasa nemá žádné waypointy" }, { status: 422 });
  }

  const waypointList = waypoints
    .sort((a, b) => a.order - b.order)
    .map((w, i) => `${i + 1}. ${w.name ?? "Bod"} (${w.lat.toFixed(4)}, ${w.lon.toFixed(4)})`)
    .join("\n");

  const { text } = await generateText({
    model: google("gemini-2.0-flash"),
    prompt: `Jsi turistický průvodce. Vygeneruj stručný český souhrn plánované horské trasy (max 3 odstavce). Waypointy trasy:\n${waypointList}`,
  });

  await updateTripAiSummary(tripId, text);
  return Response.json({ summary: text });
}
