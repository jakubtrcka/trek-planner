import { headers } from "next/headers";
import { auth } from "../../../lib/auth";
import { HoryScraperService } from "../../../providers/hory/HoryScraperService";
import { resolveHoryCredentials } from "../../../lib/hory-auth";
import { db } from "../../../lib/db/index";
import { modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { upsertArea } from "../../../lib/db/areas-repository";
import { isAdmin } from "../../../lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.replace(/^\/area\//, "").replace(/\/$/, "") || url;
  } catch {
    return url;
  }
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdmin(session.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [mod] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, "mountains")).limit(1);
  if (!mod) return Response.json({ error: "Modul 'mountains' nenalezen. Spusť seed." }, { status: 500 });

  const credentials = resolveHoryCredentials();
  const service = new HoryScraperService(credentials);

  try {
    const { ranges } = await service.scrapeRanges(
      process.env.HORY_TARGET_URL ?? "https://cs.hory.app/country/czech-republic"
    );

    let synced = 0;
    for (const range of ranges) {
      const slug = slugFromUrl(range.url);
      await upsertArea(mod.id, slug, range.name, range.url);
      synced += 1;
    }

    return Response.json({ ok: true, synced, total: ranges.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neočekávaná chyba.";
    return Response.json({ error: message }, { status: 503 });
  }
}
