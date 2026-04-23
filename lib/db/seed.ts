import { db } from "./index";
import { modules, locationTypes, dataSources } from "./schema";

export async function seedModules() {
  const [mountainModule] = await db.insert(modules).values({
    slug: "mountains",
    name: "Hory",
    icon: "Mountain",
    description: "Horské vrcholy z hory.app",
  }).onConflictDoUpdate({ target: modules.slug, set: { name: "Hory" } }).returning();

  await db.insert(locationTypes).values({
    moduleId: mountainModule.id,
    slug: "mountain",
    name: "Vrchol",
  }).onConflictDoNothing();

  await db.insert(dataSources).values({
    moduleId: mountainModule.id,
    type: "scraper",
    config: {
      targetUrl: "https://cs.hory.app/country/czech-republic",
      countryCode: "cz",
    },
  }).onConflictDoNothing();

  const [castlesModule] = await db.insert(modules).values({
    slug: "castles",
    name: "Zámky",
    icon: "castle",
    description: "Hrady a zámky z OSM Overpass (ODbL).",
  }).onConflictDoUpdate({ target: modules.slug, set: { name: "Zámky" } }).returning();

  await db.insert(locationTypes).values({
    moduleId: castlesModule.id,
    slug: "castle",
    name: "Hrad / Zámek",
  }).onConflictDoNothing();
}

if (require.main === module) {
  seedModules()
    .then(() => { console.log("Seed dokončen."); process.exit(0); })
    .catch((err) => { console.error("Seed selhal:", err); process.exit(1); });
}
