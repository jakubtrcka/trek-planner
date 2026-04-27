import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { HoryScraperService } from "../providers/hory/HoryScraperService";

const username = process.env.HORY_USERNAME ?? "";
const password = process.env.HORY_PASSWORD ?? "";
const targetUrl = process.env.HORY_TARGET_URL ?? "https://cs.hory.app/country/czech-republic";
const countryCode = process.env.HORY_COUNTRY_CODE ?? "cz";
const outFile = path.join(process.cwd(), "data", "peaks.json");

if (!username || !password) {
  console.error("Chybí HORY_USERNAME nebo HORY_PASSWORD v .env.local");
  process.exit(1);
}

function peakIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/mountain\/(\d+)-/);
  return m ? m[1] : null;
}

function areaSlugFromSource(source: string | undefined): string | null {
  if (!source) return null;
  try {
    const pathname = new URL(source).pathname;
    const match = pathname.match(/^\/area\/([^/]+)/);
    return match ? match[1] : null;
  } catch { return null; }
}

async function main() {
  console.log(`Scraping: ${targetUrl}`);
  const service = new HoryScraperService({ username, password });
  const { points, scannedRangePages } = await service.scrapeMapPoints({ targetUrl });

  const peaks = points.map((p) => ({
    name: p.peakName ?? p.name ?? "Neznámý vrchol",
    lat: p.lat,
    lon: p.lon,
    altitude: typeof p.altitude === "number" ? p.altitude : null,
    mountainLink: p.mountainLink ?? null,
    externalId: peakIdFromUrl(p.mountainLink ?? null),
    areaSlug: areaSlugFromSource(p.source),
  }));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ scrapedAt: new Date().toISOString(), countryCode, scannedRangePages, peaks }, null, 2));
  console.log(`Hotovo: ${peaks.length} vrcholů (${scannedRangePages} oblastí) → ${outFile}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
