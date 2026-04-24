import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../../../../lib/auth";
import { isAdmin } from "../../../../lib/db/admin";
import { db } from "../../../../lib/db/index";
import { dataSources, modules } from "../../../../lib/db/schema";
import { encrypt, decrypt } from "../../../../lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getMountainsDataSource() {
  const [mod] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, "mountains")).limit(1);
  if (!mod) return null;

  const [row] = await db
    .select({ id: dataSources.id, config: dataSources.config })
    .from(dataSources)
    .where(and(eq(dataSources.moduleId, mod.id), eq(dataSources.type, "scraper")))
    .limit(1);

  if (row) return row;

  // Záznam neexistuje — vytvoř ho
  const [created] = await db.insert(dataSources).values({ moduleId: mod.id, type: "scraper", config: {} }).returning();
  return created ?? null;
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !await isAdmin(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ds = await getMountainsDataSource();
  if (!ds) return NextResponse.json({ username: null, password: null });

  const config = ds.config as Record<string, string> | null;
  return NextResponse.json({
    username: config?.horyUsername ? decrypt(config.horyUsername) : null,
    password: config?.horyPassword ? decrypt(config.horyPassword) : null,
  });
}

const PostSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !await isAdmin(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = PostSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const ds = await getMountainsDataSource();
  if (!ds) return NextResponse.json({ error: "Data source nenalezen. Spusť seed." }, { status: 500 });

  const existingConfig = (ds.config ?? {}) as Record<string, unknown>;
  const newConfig = {
    ...existingConfig,
    horyUsername: encrypt(body.data.username),
    horyPassword: encrypt(body.data.password),
  };

  await db.update(dataSources).set({ config: newConfig }).where(eq(dataSources.id, ds.id));
  return NextResponse.json({ ok: true });
}
