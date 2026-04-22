import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../../../../lib/auth";
import { db } from "../../../../lib/db/index";
import { modules, userModuleSettings } from "../../../../lib/db/schema";
import { encrypt, decrypt } from "../../../../lib/crypto";

const SettingsJsonSchema = z.object({
  horyUsername: z.string().optional(),
  horyPassword: z.string().optional(),
  mapyCzApiKey: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const moduleSlug = searchParams.get("moduleSlug") ?? "mountains";
  const rows = await db.select().from(userModuleSettings)
    .innerJoin(modules, eq(modules.id, userModuleSettings.moduleId))
    .where(and(eq(userModuleSettings.userId, session.user.id), eq(modules.slug, moduleSlug)));
  if (!rows.length) return Response.json({ horyUsername: null, horyPassword: null, mapyCzApiKey: null });
  const parsed = SettingsJsonSchema.safeParse(rows[0].user_module_settings.settings);
  if (!parsed.success) return Response.json({ horyUsername: null, horyPassword: null, mapyCzApiKey: null });
  const s = parsed.data;
  return Response.json({
    horyUsername: s.horyUsername ? decrypt(s.horyUsername) : null,
    horyPassword: s.horyPassword ? decrypt(s.horyPassword) : null,
    mapyCzApiKey: s.mapyCzApiKey ? decrypt(s.mapyCzApiKey) : null,
  });
}

const PostSchema = z.object({
  moduleSlug: z.string().min(1),
  horyUsername: z.string().optional().default(""),
  horyPassword: z.string().optional().default(""),
  mapyCzApiKey: z.string().optional().default(""),
});

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = PostSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Neplatná data" }, { status: 400 });
  const { moduleSlug, horyUsername, horyPassword, mapyCzApiKey } = parsed.data;
  const mod = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, moduleSlug));
  if (!mod.length) return Response.json({ error: "Modul nenalezen" }, { status: 404 });
  const settings: z.infer<typeof SettingsJsonSchema> = {
    ...(horyUsername ? { horyUsername: encrypt(horyUsername) } : {}),
    ...(horyPassword ? { horyPassword: encrypt(horyPassword) } : {}),
    ...(mapyCzApiKey ? { mapyCzApiKey: encrypt(mapyCzApiKey) } : {}),
  };
  await db.insert(userModuleSettings).values({ userId: session.user.id, moduleId: mod[0].id, settings })
    .onConflictDoUpdate({ target: [userModuleSettings.userId, userModuleSettings.moduleId], set: { settings, updatedAt: new Date() } });
  return Response.json({ ok: true });
}
