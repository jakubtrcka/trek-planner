import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const apiKey = process.env.MAPY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "MAPY_API_KEY není nastaven." }, { status: 500 });
  }

  const { path } = await params;
  const upstreamPath = path.join("/");

  // Forward any query params from the original request except we add our apikey
  const { searchParams } = new URL(request.url);
  searchParams.set("apikey", apiKey);

  const upstreamUrl = `https://api.mapy.com/${upstreamPath}?${searchParams.toString()}`;

  try {
    const res = await fetch(upstreamUrl, {
      headers: { Accept: "*/*" },
      cache: "no-store",
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const data = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
