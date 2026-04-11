import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

const SYSTEM_PROMPT = `Jsi AI asistent pro plánování výletů v České republice a okolních zemích.
Pomáháš uživatelům plánovat výlety, turistické trasy, hledat zajímavá místa (hrady, kavárny, rozhledny, vrcholy hor, přírodní zajímavosti) a navrhovat optimální trasy.
Komunikuj vždy česky. Buď konkrétní, přátelský a nápomocný.

Máš k dispozici nástroje:
- geocodePlace: VŽDY použij jako první krok pro získání přesných souřadnic míst. Nikdy nepoužívej vlastní odhad souřadnic – vždy geokóduj.
- showPointsOnMap: zobrazí místa na mapě. Volej až POTÉ co máš přesné souřadnice z geocodePlace. Jedno volání s více body najednou.
- planRoute: naplánuje trasu. Souřadnice pro trasu vždy získej přes geocodePlace.

Postup při zobrazení/naplánování míst:
1. Zavolej geocodePlace pro každé místo (nebo hromadně více míst najednou)
2. Geocoding vrátí pole candidates – vyber toho kandidáta, jehož name/location nejlépe odpovídá dotazu
3. Z vybraného kandidáta vezmi lat a lon
4. Zavolej showPointsOnMap nebo planRoute s těmito přesnými souřadnicemi`;

async function fetchMapyCzRoute(
  waypoints: { lat: number; lon: number }[],
  mode: "foot_fast" | "car_fast" | "bike_road"
): Promise<{ coordinates: { lat: number; lon: number }[]; distanceM: number; durationS: number } | null> {
  const apiKey = process.env.MAPY_API_KEY;
  if (!apiKey || waypoints.length < 2) return null;

  try {
    const body = {
      apikey: apiKey,
      lang: "cs",
      routeType: mode,
      avoidToll: false,
      waypoints: waypoints.map((w) => ({ coords: { lon: w.lon, lat: w.lat } })),
    };

    const res = await fetch("https://api.mapy.com/v1/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      geometry?: { coordinates?: number[][] };
      legs?: { distance?: number; duration?: number }[];
    };

    const coords = (data.geometry?.coordinates ?? []).map(([lon, lat]) => ({ lat, lon }));
    const totalDist = (data.legs ?? []).reduce((s, l) => s + (l.distance ?? 0), 0);
    const totalDur = (data.legs ?? []).reduce((s, l) => s + (l.duration ?? 0), 0);

    return { coordinates: coords, distanceM: totalDist, durationS: totalDur };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: unknown[] };

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const result = streamText({
    model: google(model),
    system: SYSTEM_PROMPT,
    messages: messages as Parameters<typeof streamText>[0]["messages"],
    maxSteps: 10,
    tools: {
      geocodePlace: tool({
        description:
          "Geokóduje název místa na přesné GPS souřadnice pomocí Mapy.cz. Vždy volej před showPointsOnMap nebo planRoute aby byly souřadnice přesné.",
        parameters: z.object({
          queries: z
            .array(z.string())
            .min(1)
            .describe("Seznam názvů míst k geokódování, např. ['Hrad Trosky', 'Hrad Kost']"),
        }),
        execute: async ({ queries }) => {
          const apiKey = process.env.MAPY_API_KEY;
          if (!apiKey) return { error: "Geocoding není k dispozici." };

          const results = await Promise.all(
            queries.map(async (query) => {
              try {
                const url = `https://api.mapy.com/v1/geocode?query=${encodeURIComponent(query)}&lang=cs&limit=3&apikey=${apiKey}`;
                const res = await fetch(url);
                if (!res.ok) return { query, error: "Geocoding selhal." };
                const data = (await res.json()) as {
                  items?: { name: string; position: { lat: number; lon: number }; location?: string; type?: string }[];
                };
                const items = data.items ?? [];
                if (items.length === 0) return { query, error: "Místo nenalezeno." };
                // Return top candidates so the model can pick the best match
                return {
                  query,
                  candidates: items.map((item) => ({
                    name: item.name,
                    lat: item.position.lat,
                    lon: item.position.lon,
                    location: item.location ?? "",
                    type: item.type ?? "",
                  })),
                };
              } catch {
                return { query, error: "Chyba při geokódování." };
              }
            })
          );
          return { results };
        },
      }),

      showPointsOnMap: tool({
        description:
          "Zobrazí seznam míst jako body na mapě. Volej vždy když chceš ukázat konkrétní lokace – vrcholy, kavárny, hrady, rozhledny nebo libovolná zajímavá místa.",
        parameters: z.object({
          points: z
            .array(
              z.object({
                lat: z.number().describe("Zeměpisná šířka (WGS84)"),
                lon: z.number().describe("Zeměpisná délka (WGS84)"),
                name: z.string().describe("Název místa"),
                description: z.string().optional().describe("Krátký popis nebo poznámka"),
                type: z
                  .enum(["peak", "cafe", "castle", "viewpoint", "restaurant", "other"])
                  .optional()
                  .describe("Typ místa"),
              })
            )
            .min(1)
            .describe("Pole míst k zobrazení na mapě"),
        }),
        execute: async ({ points }) => ({ points }),
      }),

      planRoute: tool({
        description:
          "Naplánuje turistickou nebo automobilovou trasu přes zadané body pomocí mapy.cz. Vrátí souřadnice trasy, délku a odhadovaný čas.",
        parameters: z.object({
          waypoints: z
            .array(
              z.object({
                lat: z.number(),
                lon: z.number(),
                label: z.string().optional().describe("Název bodu (pro informaci)"),
              })
            )
            .min(2)
            .describe("Alespoň 2 body trasy (start a cíl, případně průjezdní body)"),
          mode: z
            .enum(["foot_fast", "car_fast", "bike_road"])
            .default("foot_fast")
            .describe("Způsob dopravy: pěšky, autem nebo na kole"),
        }),
        execute: async ({ waypoints, mode }) => {
          const route = await fetchMapyCzRoute(waypoints, mode);
          if (!route) {
            return { error: "Nepodařilo se naplánovat trasu. Zkus jiné body." };
          }
          const distKm = (route.distanceM / 1000).toFixed(1);
          const durMin = Math.round(route.durationS / 60);
          return {
            coordinates: route.coordinates,
            distanceKm: distKm,
            durationMinutes: durMin,
            summary: `Trasa: ${distKm} km, cca ${Math.floor(durMin / 60)} h ${durMin % 60} min`,
          };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
