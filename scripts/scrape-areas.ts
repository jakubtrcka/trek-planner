import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { HoryScraperService } from "../providers/hory/HoryScraperService";

const username = process.env.HORY_USERNAME ?? "";
const password = process.env.HORY_PASSWORD ?? "";
const targetUrl = process.env.HORY_TARGET_URL ?? "https://cs.hory.app/country/czech-republic";
const outFile = path.join(process.cwd(), "data", "areas.json");

if (!username || !password) {
  console.error("Chybí HORY_USERNAME nebo HORY_PASSWORD v .env.local");
  process.exit(1);
}

function slugFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.replace(/^\/area\//, "").replace(/\/$/, "") || url;
  } catch { return url; }
}

async function main() {
  console.log(`Scraping areas: ${targetUrl}`);
  const service = new HoryScraperService({ username, password });
  const { ranges } = await service.scrapeRanges(targetUrl);

  const areas = ranges.map((r) => ({
    name: r.name,
    url: r.url,
    slug: slugFromUrl(r.url),
  }));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ scrapedAt: new Date().toISOString(), areas }, null, 2));
  console.log(`Hotovo: ${areas.length} oblastí → ${outFile}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
