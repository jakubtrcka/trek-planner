import { type Waypoint } from "./types";

// ── HTML entity decoder ────────────────────────────────────────────────────────

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

// ── GPX parsing ────────────────────────────────────────────────────────────────

export function parseGpxWaypoints(rawGpxData: string): Waypoint[] {
  const waypoints: Waypoint[] = [];
  const waypointRegex = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi;

  for (const match of rawGpxData.matchAll(waypointRegex)) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const latMatch = attrs.match(/\blat=["']([^"']+)["']/i);
    const lonMatch = attrs.match(/\blon=["']([^"']+)["']/i);
    const nameMatch = inner.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i);
    const cdataText = nameMatch?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") ?? "";
    const name = decodeHtmlEntities(
      cdataText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );

    waypoints.push({
      name,
      lat: latMatch ? Number(latMatch[1]) : null,
      lon: lonMatch ? Number(lonMatch[1]) : null,
    });
  }

  return waypoints.filter(
    (waypoint) =>
      waypoint.name.length > 0 ||
      (typeof waypoint.lat === "number" && Number.isFinite(waypoint.lat) &&
        typeof waypoint.lon === "number" && Number.isFinite(waypoint.lon))
  );
}
