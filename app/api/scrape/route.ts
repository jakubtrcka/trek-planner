import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveHoryCredentials } from "../../../lib/hory-auth";
import { HoryScraperService } from "../../../providers/hory/HoryScraperService";
import { HoryAuthError, HoryValidationError } from "../../../providers/hory/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ScrapeRequestSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  targetUrl: z.string().url().optional(),
});

export async function POST(request: Request) {
  try {
    const body = ScrapeRequestSchema.parse(await request.json());
    const credentials = resolveHoryCredentials(body.username, body.password);

    if (!credentials.hasCredentials) {
      return NextResponse.json({ error: "Chybí login nebo heslo." }, { status: 400 });
    }

    const defaultTargetUrl =
      process.env.HORY_TARGET_URL?.trim() ||
      process.env.HORY_COUNTRY_URL?.trim() ||
      process.env.NEXT_PUBLIC_HORY_TARGET_URL?.trim() ||
      "https://cs.hory.app/country/czech-republic";

    const service = new HoryScraperService(credentials);
    const result = await service.scrapeRanges(body.targetUrl ?? defaultTargetUrl);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Neplatná data v požadavku.", details: error.issues }, { status: 400 });
    }
    if (error instanceof HoryAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof HoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Neočekávaná chyba při scrapování.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
