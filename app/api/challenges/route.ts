import { z } from "zod";
import { NextResponse } from "next/server";
import { getChallengesByModule } from "../../../lib/db/challenges-repository";
import {
  readChallengesCache,
  HoryChallengesService,
} from "../../../providers/hory/HoryChallengesService";
import {
  HoryAuthError,
  HoryCacheNotFoundError,
  HoryValidationError,
} from "../../../providers/hory/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const moduleSlug = "mountains";
  const rows = await getChallengesByModule(moduleSlug);
  if (!rows.length) {
    const cached = await readChallengesCache();
    if (!cached) return Response.json({ challenges: [], count: 0, source: "empty" });
    return Response.json({ challenges: cached.challenges, count: cached.challenges.length, source: "file-cache" });
  }
  return Response.json({ challenges: rows, count: rows.length, source: "db" });
}

const RequestPayloadSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  useCache: z.boolean().optional(),
  refreshCache: z.boolean().optional(),
  cacheOnly: z.boolean().optional(),
  maxChallenges: z.number().optional(),
  batchSize: z.number().optional(),
  throttleMs: z.number().optional(),
});

export async function POST(request: Request) {
  const parseResult = RequestPayloadSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const service = new HoryChallengesService();
  try {
    const result = await service.scrape(parseResult.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HoryCacheNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof HoryAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof HoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Neočekávaná chyba při načítání výzev.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
