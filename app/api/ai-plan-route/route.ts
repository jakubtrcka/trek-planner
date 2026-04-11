import { NextResponse } from "next/server";

type MapPoint = {
  lat: number;
  lon: number;
  name?: string;
  peakName?: string;
  altitude?: number | string;
  mountainLink?: string;
};

type RequestPayload = {
  prompt?: string;
  points?: MapPoint[];
  fallback?: {
    maxDistance?: number;
    startsWithLetters?: string[];
    letterMode?: "strict" | "prefer";
    routeMode?: "linear" | "roundtrip";
  };
};

type RouteIntent = {
  distanceKmTarget: number;
  distanceTolerancePercent: number;
  routeMode: "linear" | "roundtrip";
  preferredLetters: string[];
  letterMode: "strict" | "prefer";
  maxAscentMeters: number | null;
  mustInclude: string[];
  avoid: string[];
  notes: string;
  clarificationQuestion: string | null;
  confidence: number;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeLetter(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .slice(0, 1);
}

function normalizeIntent(raw: Partial<RouteIntent>, fallback: NonNullable<RequestPayload["fallback"]>): RouteIntent {
  const target = typeof raw.distanceKmTarget === "number" && Number.isFinite(raw.distanceKmTarget) ? raw.distanceKmTarget : fallback.maxDistance ?? 18;
  const tolerance =
    typeof raw.distanceTolerancePercent === "number" && Number.isFinite(raw.distanceTolerancePercent)
      ? raw.distanceTolerancePercent
      : 20;

  const preferredLetters = Array.isArray(raw.preferredLetters)
    ? raw.preferredLetters.map(normalizeLetter).filter(Boolean)
    : Array.isArray(fallback.startsWithLetters)
      ? fallback.startsWithLetters.map(normalizeLetter).filter(Boolean)
      : [];

  return {
    distanceKmTarget: Number(Math.min(Math.max(target, 1), 120).toFixed(1)),
    distanceTolerancePercent: Number(Math.min(Math.max(tolerance, 5), 60).toFixed(1)),
    routeMode: raw.routeMode === "linear" || raw.routeMode === "roundtrip" ? raw.routeMode : fallback.routeMode === "linear" ? "linear" : "roundtrip",
    preferredLetters,
    letterMode: raw.letterMode === "strict" || raw.letterMode === "prefer" ? raw.letterMode : fallback.letterMode === "prefer" ? "prefer" : "strict",
    maxAscentMeters: typeof raw.maxAscentMeters === "number" && Number.isFinite(raw.maxAscentMeters) ? Math.max(0, Math.round(raw.maxAscentMeters)) : null,
    mustInclude: Array.isArray(raw.mustInclude) ? raw.mustInclude.filter((item) => typeof item === "string").slice(0, 12) : [],
    avoid: Array.isArray(raw.avoid) ? raw.avoid.filter((item) => typeof item === "string").slice(0, 12) : [],
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 300) : "",
    clarificationQuestion: typeof raw.clarificationQuestion === "string" ? raw.clarificationQuestion.slice(0, 180) : null,
    confidence:
      typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Number(Math.min(Math.max(raw.confidence, 0), 1).toFixed(2)) : 0.55
  };
}

function parsePromptHeuristic(prompt: string, fallback: NonNullable<RequestPayload["fallback"]>): RouteIntent {
  const text = prompt.toLowerCase();
  const distanceMatch = text.match(/(\d+(?:[.,]\d+)?)\s*km/);
  const distanceKmTarget = distanceMatch ? Number(distanceMatch[1].replace(",", ".")) : fallback.maxDistance ?? 18;

  const ascentMatch = text.match(/(?:max|do|nejvy[sš]|strop)\s*(\d{2,5})\s*m/);
  const maxAscentMeters = ascentMatch ? Number(ascentMatch[1]) : null;

  const roundtripHints = /(okruh|okru[zž]n|kruh|zp[aá]tky|vr[aá]tit se|start.*c[ií]l|auto)/.test(text);
  const linearHints = /(line[aá]rn|z bodu|a\s*->\s*b|tam a zp[aá]tky ne)/.test(text);
  const routeMode: "linear" | "roundtrip" = linearHints && !roundtripHints ? "linear" : "roundtrip";

  const strictHints = /(jen|pouze|v[yý]hradn[eě]|striktn)/.test(text);
  const preferHints = /(prefer|hlavn[eě]|ide[aá]ln[eě]|p[řr]ednostn)/.test(text);
  const letterMode: "strict" | "prefer" = strictHints && !preferHints ? "strict" : "prefer";

  const preferredLetters = new Set<string>();
  for (const match of text.matchAll(/p[ií]smen[aá]\s*([a-zá-ž,\s]+)/gi)) {
    for (const raw of match[1].split(/[,\s]+/)) {
      const letter = normalizeLetter(raw);
      if (letter) {
        preferredLetters.add(letter);
      }
    }
  }

  const directLetters = text.match(/\b[a-zá-ž]\b/gi) ?? [];
  if (preferredLetters.size === 0 && directLetters.length > 0 && /(p[ií]smen|za[cč][ií]n)/.test(text)) {
    for (const raw of directLetters) {
      const letter = normalizeLetter(raw);
      if (letter) {
        preferredLetters.add(letter);
      }
    }
  }

  return normalizeIntent(
    {
      distanceKmTarget,
      distanceTolerancePercent: 20,
      routeMode,
      preferredLetters: Array.from(preferredLetters),
      letterMode,
      maxAscentMeters,
      mustInclude: [],
      avoid: [],
      notes: "Intent parsed by heuristic fallback.",
      clarificationQuestion: null,
      confidence: preferredLetters.size > 0 || distanceMatch ? 0.72 : 0.5
    },
    fallback
  );
}

async function parsePromptWithGemini(prompt: string, fallback: NonNullable<RequestPayload["fallback"]>): Promise<RouteIntent | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.2
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You are a route-intent parser.",
                "Convert Czech/English hiking request into JSON with fields:",
                "distanceKmTarget(number), distanceTolerancePercent(number), routeMode(linear|roundtrip), preferredLetters(string[]), letterMode(strict|prefer), maxAscentMeters(number|null), mustInclude(string[]), avoid(string[]), notes(string), clarificationQuestion(string|null), confidence(number 0..1).",
                "Return only valid JSON object, no markdown.",
                `Prompt: ${prompt}`
              ].join(" ")
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GeminiResponse;
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
  if (!content) {
    return null;
  }

  try {
    const clean = content.replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(clean) as Partial<RouteIntent>;
    return normalizeIntent(parsed, fallback);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestPayload;
  const prompt = body.prompt?.trim();
  const points = Array.isArray(body.points) ? body.points : [];
  const fallback = {
    maxDistance: body.fallback?.maxDistance ?? 18,
    startsWithLetters: body.fallback?.startsWithLetters ?? [],
    letterMode: body.fallback?.letterMode ?? "strict",
    routeMode: body.fallback?.routeMode ?? "roundtrip"
  };

  if (!prompt) {
    return NextResponse.json({ error: "Chybí textový prompt." }, { status: 400 });
  }

  if (points.length < 2) {
    return NextResponse.json({ error: "Pro AI plánování jsou potřeba alespoň 2 vrcholy." }, { status: 400 });
  }

  const llmIntent = await parsePromptWithGemini(prompt, fallback);
  const intent = llmIntent ?? parsePromptHeuristic(prompt, fallback);
  const parser = llmIntent ? "llm" : "heuristic";

  const planRouteUrl = new URL("/api/plan-route", request.url);
  const planResponse = await fetch(planRouteUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      points,
      maxDistance: intent.distanceKmTarget,
      startsWithLetters: intent.preferredLetters,
      letterMode: intent.letterMode,
      routeMode: intent.routeMode
    })
  });

  const planPayload = (await planResponse.json()) as {
    error?: string;
    count?: number;
    routes?: unknown[];
    cached?: boolean;
    cacheKey?: string;
    apiCalls?: number;
    estimatedCredits?: number;
    creditsPerCall?: number;
  };

  if (!planResponse.ok) {
    return NextResponse.json(
      {
        error: planPayload.error ?? "AI plánování selhalo při routingu.",
        intent,
        parser
      },
      { status: planResponse.status }
    );
  }

  return NextResponse.json({
    parser,
    intent,
    count: planPayload.count ?? 0,
    routes: planPayload.routes ?? [],
    cached: planPayload.cached ?? false,
    cacheKey: planPayload.cacheKey,
    apiCalls: planPayload.apiCalls ?? 0,
    estimatedCredits: planPayload.estimatedCredits ?? 0,
    creditsPerCall: planPayload.creditsPerCall ?? 4
  });
}
