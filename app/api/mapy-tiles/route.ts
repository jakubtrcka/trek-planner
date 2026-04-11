import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAPY_TILE_LAYERS = new Set(["basic", "outdoor", "aerial"]);

export async function GET(request: Request) {
  const apiKey = process.env.MAPY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "MAPY_API_KEY není nastaven." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const layer = searchParams.get("layer")?.trim().toLowerCase() || "basic";
  const z = searchParams.get("z")?.trim() || "";
  const x = searchParams.get("x")?.trim() || "";
  const y = searchParams.get("y")?.trim() || "";

  if (!MAPY_TILE_LAYERS.has(layer)) {
    return NextResponse.json({ error: "Neplatná vrstva mapy." }, { status: 400 });
  }

  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return NextResponse.json({ error: "Neplatné souřadnice dlaždice." }, { status: 400 });
  }

  const retina = searchParams.get("retina") === "1" ? "@2x" : "";
  const upstreamUrl = `https://api.mapy.com/v1/maptiles/${layer}/256/${z}/${x}/${y}${retina}?apikey=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      cache: "no-store"
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Mapy tiles chyba (${upstream.status}).` }, { status: upstream.status });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "image/png";
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400"
      }
    });
  } catch {
    return NextResponse.json({ error: "Nepodařilo se načíst dlaždici z Mapy.com." }, { status: 502 });
  }
}
