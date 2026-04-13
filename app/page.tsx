"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useChat } from "ai/react";
import {
  ChevronDown,
  Compass,
  Gauge,
  Info,
  Loader2,
  Map as MapIcon,
  MapPinned,
  Mountain,
  Route,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target
} from "lucide-react";
import {
  CSSProperties,
  FormEvent,
  MutableRefObject,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Textarea } from "../components/ui/textarea";
import ReactMarkdown from "react-markdown";
import { cn } from "../lib/utils";

type CountryCode = "cz" | "si";

const COUNTRY_CONFIG: { code: CountryCode; name: string; label: string; url: string }[] = [
  { code: "cz", name: "ČR", label: "Česká republika", url: "https://cs.hory.app/country/czech-republic" },
  { code: "si", name: "SI", label: "Slovinsko", url: "https://cs.hory.app/country/slovenia" },
];

type RangeItem = {
  name: string;
  url: string;
};

type ScrapeResponse = {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  ranges: RangeItem[];
  count: number;
};

type AreaGeojsonResponse = {
  count: number;
  cached?: boolean;
  cacheKey?: string;
  features: Array<{
    name: string;
    url: string;
    feature: {
      type: "Feature";
      properties: {
        name: string;
        url: string;
      };
      geometry: {
        type: string;
        coordinates: unknown;
      };
    };
  }>;
};

type MapPoint = {
  lat: number;
  lon: number;
  name?: string;
  peakName?: string;
  altitude?: number | string;
  mountainLink?: string;
  source?: string;
};

type MapPointsResponse = {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  points: MapPoint[];
  count: number;
  sourceCount: number;
  selectedAreaCount?: number;
  scannedRangePages?: number;
  durationMs?: number;
  startsWithLetters?: string[];
  letterMode?: "strict" | "prefer";
  cached?: boolean;
  cacheUpdatedAt?: string;
  cacheTotalPoints?: number;
  cacheRefreshed?: boolean;
  sources: Array<{
    url: string;
    contentType: string;
  }>;
};

type ChallengeLevel = {
  level: number;
  total: number;
  peakIds: number[];
};

type ChallengeItem = {
  id?: string;
  name: string;
  url?: string;
  category?: string;
  activeFrom?: string;
  activeTo?: string;
  rulesText?: string;
  rulesHtml?: string;
  gpxUrl?: string;
  isSpecificList?: boolean;
  isCrossword?: boolean;
  challengeType?: "specific-list" | "property-based" | "crossword" | "unknown";
  peakIds?: number[];
  levels?: ChallengeLevel[];
  rawGpxData?: string;
  isEnded?: boolean;
};

type ChallengesResponse = {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  challenges: ChallengeItem[];
  count: number;
  cached?: boolean;
  cacheRefreshed?: boolean;
};

type PlannedRoute = {
  id: string;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  ascentMeters: number;
  peaks: Array<{
    name: string;
    lat: number;
    lon: number;
    altitude?: number | string;
  }>;
  mapyCzUrl: string;
  mapyApiUrl?: string;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
};

type PlanRouteResponse = {
  count: number;
  cached?: boolean;
  cacheKey?: string;
  apiCalls?: number;
  estimatedCredits?: number;
  creditsPerCall?: number;
  routes: PlannedRoute[];
};

type AiRouteIntent = {
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

type AiPlanRouteResponse = PlanRouteResponse & {
  parser?: "llm" | "heuristic";
  intent?: AiRouteIntent;
};

type SectionKey = "peaks" | "challenges";

const CZECH_ALPHABET = [
  "A",
  "Á",
  "B",
  "C",
  "Č",
  "D",
  "Ď",
  "E",
  "É",
  "Ě",
  "F",
  "G",
  "H",
  "I",
  "Í",
  "J",
  "K",
  "L",
  "M",
  "N",
  "Ň",
  "O",
  "Ó",
  "P",
  "Q",
  "R",
  "Ř",
  "S",
  "Š",
  "T",
  "Ť",
  "U",
  "Ú",
  "Ů",
  "V",
  "W",
  "X",
  "Y",
  "Ý",
  "Z",
  "Ž"
];

const CZECH_REPUBLIC_BOUNDS: [[number, number], [number, number]] = [
  [48.45, 12.05],
  [51.06, 18.9]
];

const SELECTED_LETTER_COLORS = [
  "#e53935",
  "#1e88e5",
  "#43a047",
  "#fb8c00",
  "#8e24aa",
  "#00897b",
  "#f4511e",
  "#3949ab"
];

const CZECH_SUBSTITUTION_TABLE_CLIENT: Record<string, string> = {
  "A": "A", "Á": "A",
  "B": "B",
  "C": "C", "Č": "Č",
  "D": "D", "Ď": "Ď",
  "E": "E", "É": "E", "Ě": "E",
  "F": "F",
  "G": "G",
  "H": "H",
  "I": "I", "Í": "I",
  "J": "J",
  "K": "K",
  "L": "L",
  "M": "M",
  "N": "N", "Ň": "Ň",
  "O": "O", "Ó": "O",
  "P": "P",
  "Q": "Q",
  "R": "R", "Ř": "Ř",
  "S": "S", "Š": "Š",
  "T": "T", "Ť": "Ť",
  "U": "U", "Ú": "U", "Ů": "U",
  "V": "V",
  "W": "W",
  "X": "X",
  "Y": "Y", "Ý": "Y",
  "Z": "Z", "Ž": "Ž"
};

function normalizeLetterClient(value: string): string {
  const upper = value.toUpperCase().slice(0, 1);
  return CZECH_SUBSTITUTION_TABLE_CLIENT[upper] || upper;
}

function firstLetterFromNameClient(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  for (const ch of trimmed) {
    if (/[A-Za-zÁ-Žá-ž]/.test(ch)) {
      return ch.toUpperCase();
    }
  }

  return null;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function loadLeaflet() {
  // Load maplibre-gl first, then the Leaflet plugin which requires both
  await import("maplibre-gl");
  await import("@maplibre/maplibre-gl-leaflet");
  // Use the canonical "leaflet" specifier so the plugin's internal require('leaflet')
  // resolves to the same module instance (both hit dist/leaflet-src.js via package.json "main")
  const leafletModule = await import("leaflet");
  const globalLeaflet =
    typeof window !== "undefined"
      ? ((window as typeof window & { L?: unknown; leaflet?: unknown }).L ??
          (window as typeof window & { L?: unknown; leaflet?: unknown }).leaflet)
      : undefined;

  const candidates = [
    leafletModule,
    (leafletModule as { default?: unknown }).default,
    globalLeaflet
  ] as Array<unknown>;

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof (candidate as { map?: unknown }).map === "function" &&
      typeof (candidate as { tileLayer?: unknown }).tileLayer === "function" &&
      typeof (candidate as { layerGroup?: unknown }).layerGroup === "function" &&
      typeof (candidate as { circleMarker?: unknown }).circleMarker === "function"
    ) {
      return candidate as any;
    }
  }

  throw new Error(
    `Leaflet module has unexpected shape: ${candidates
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return String(candidate);
        }
        return Object.getOwnPropertyNames(candidate).slice(0, 12).join(", ");
      })
      .join(" | ")}`
  );
}

function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="rounded-3xl border-zinc-200/80 bg-white/90">
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</p>
          {hint ? <HelpHint text={hint} /> : null}
        </div>
        <p className="mt-3 text-2xl font-semibold text-zinc-950">{value}</p>
      </CardContent>
    </Card>
  );
}

function HelpHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 transition group-hover:border-zinc-300 group-hover:text-zinc-700">
        <Info className="h-3.5 w-3.5" />
      </span>
      <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden w-64 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium leading-5 text-zinc-600 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

function SectionTitle({
  icon,
  title,
  description,
  extra
}: {
  icon: ReactNode;
  title: string;
  description: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 text-white shadow-lg shadow-zinc-950/10">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{title}</h1>
            <HelpHint text={description} />
          </div>
        </div>
      </div>
      {extra}
    </div>
  );
}

function FilterSection({
  id, label, hint, children, isOpen, onToggle,
}: {
  id: string; label: string; hint?: string; children: React.ReactNode; isOpen: boolean; onToggle: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-950">{label}</span>
          {hint && <HelpHint text={hint} />}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && <div className="border-t border-zinc-200 px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

const BIRD_KEYWORDS = /sov[ai]|vrán[ay]?|sokol|havran|krkavec|orl[ií]?|holub|ptač/i;

// Czech osmisměrka (word search) 20×20 grid
const CESKA_OSMISMERKA_GRID: string[][] = [
  ["E","H","Ř","E","B","E","N","E","C","I","N","I","V","H","O","R","K","A","J","V"],
  ["L","C","E","D","A","R","H","A","B","Á","B","A","S","C","E","N","E","M","A","K"],
  ["Á","V","Ě","T","R","N","Í","K","S","J","C","P","V","B","R","D","O","R","V","V"],
  ["K","O","I","S","H","O","M","O","L","K","A","H","A","R","W","J","T","V","O","H"],
  ["S","D","Á","V","O","L","D","E","J","C","A","H","L","H","C","A","X","H","R","R"],
  ["A","R","O","H","Í","V","A","R","K","T","E","L","M","U","O","H","C","M","N","Á"],
  ["N","Ž","Á","R","T","S","K","N","A","K","O","P","C","I","M","R","U","E","Í","D"],
  ["S","K","A","L","K","A","Á","U","A","K","R","Ů","H","E","V","H","E","C","K","E"],
  ["H","C","R","V","Í","N","Č","I","N","E","B","I","Š","Í","O","C","E","K","X","K"],
  ["M","T","Y","N","U","Č","I","K","S","Ě","H","L","Č","M","F","P","G","O","F","L"],
  ["K","K","H","N","H","I","P","A","T","Ů","H","Š","O","K","O","Z","I","N","E","C"],
  ["T","O","C","P","E","H","Š","Š","R","V","I","L","K","K","U","K","H","U","Z","Q"],
  ["Č","S","R","K","H","A","I","A","S","L","E","B","S","K","K","Í","O","N","Q","Č"],
  ["E","T","V","A","K","D","Í","L","H","Y","V","V","I","V","Š","L","L","A","K","Á"],
  ["R","E","S","K","A","L","K","Y","Q","R","Z","Y","D","Y","R","H","Ý","V","L","N"],
  ["N","L","Q","R","W","O","N","P","E","K","L","O","A","S","V","U","V","R","Ů","E"],
  ["Ý","Í","H","E","Z","N","V","J","W","X","B","N","R","O","A","O","R","Š","Č","M"],
  ["L","K","K","A","L","V","Á","R","I","E","H","Q","H","K","N","R","C","Í","E","A"],
  ["E","I","U","W","X","H","C","E","V","O","K","U","B","Á","H","K","H","C","K","K"],
  ["S","V","L","Y","K","Í","N","E","B","I","Š","V","J","O","L","O","Q","H","D","I"],
];

function wordSearchCheck(grid: string[][], word: string): boolean {
  const rows = grid.length, cols = grid[0].length, len = word.length;
  if (len < 3 || len > Math.max(rows, cols)) return false;
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] as const;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== word[0]) continue;
      for (const [dr, dc] of DIRS) {
        let ok = true;
        for (let i = 1; i < len; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] !== word[i]) { ok = false; break; }
        }
        if (ok) return true;
      }
    }
  }
  return false;
}

function isPalindromeAltitude(altitude: number): boolean {
  const s = String(Math.round(altitude));
  return s === s.split("").reverse().join("");
}

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authBootstrapLoading, setAuthBootstrapLoading] = useState(true);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("peaks");
  const [rangesLoading, setRangesLoading] = useState(false);
  const [areasLoading, setAreasLoading] = useState(false);
  const [cacheDownloadLoading, setCacheDownloadLoading] = useState(false);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState<CountryCode[]>(["cz"]);
  const [countryDownloadLoading, setCountryDownloadLoading] = useState<Partial<Record<CountryCode, boolean>>>({});

  const [selectedLetters, setSelectedLetters] = useState<string[]>([]);
  const [letterMode, setLetterMode] = useState<"strict" | "prefer">("strict");
  const [showOtherLetters, setShowOtherLetters] = useState(false);
  const [rangeOptions, setRangeOptions] = useState<RangeItem[]>([]);
  const [selectedRangeUrls, setSelectedRangeUrls] = useState<string[]>([]);
  const [peakSort, setPeakSort] = useState<"alpha" | "challenges">("alpha");
  const [mapReady, setMapReady] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [result, setResult] = useState<MapPointsResponse | null>(null);
  const [challengesResult, setChallengesResult] = useState<ChallengesResponse | null>(null);
  const [userAscents, setUserAscents] = useState<Map<number, { count: number; dates: string[] }>>(new Map());
  const [ascentsLoading, setAscentsLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<"hory" | "routes">("hory");
  const [isModulePanelOpen, setIsModulePanelOpen] = useState(true);
  const [expandedChallengeId, setExpandedChallengeId] = useState<string | null>(null);

  const [maxDistance, setMaxDistance] = useState("18");
  const [routeMode, setRouteMode] = useState<"linear" | "roundtrip">("roundtrip");
  const [routePlanningLoading, setRoutePlanningLoading] = useState(false);
  const [routePlans, setRoutePlans] = useState<PlannedRoute[]>([]);
  const [routeInfo, setRouteInfo] = useState("");
  const [routeError, setRouteError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiIntent, setAiIntent] = useState<AiRouteIntent | null>(null);
  const [aiParser, setAiParser] = useState<"llm" | "heuristic" | null>(null);
  const [peakSearchQuery, setPeakSearchQuery] = useState("");
  const [selectedPeak, setSelectedPeak] = useState<MapPoint | null>(null);
  const [filterByMapBounds, setFilterByMapBounds] = useState(true);
  const [mapBounds, setMapBounds] = useState<{ south: number; west: number; north: number; east: number } | null>(null);
  const [baseMap, setBaseMap] = useState<"osm" | "mapycz-basic" | "mapycz-outdoor" | "mapycz-warm">("mapycz-outdoor");
  const [openFilters, setOpenFilters] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [challengeSort, setChallengeSort] = useState<"default" | "alpha" | "completion">("default");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const { messages, input, handleInputChange, handleSubmit, isLoading: chatLoading } = useChat({ api: "/api/chat" });

  const areaSelectMapContainerRef = useRef<HTMLDivElement | null>(null);
  const areaSelectMapRef = useRef<any>(null);
  const areaPeaksLayerGroupRef = useRef<any>(null);
  const peakMarkersRef = useRef<Map<string, any>>(new Map());
  const areaBaseLayerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const aiLayerGroupRef = useRef<any>(null);
  const challengePeakIdsRef = useRef<Set<number>>(new Set());
  const aiRouteLayerRef = useRef<any>(null);

  const mapBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const allPoints = ensureArray<MapPoint>(result?.points);
  const allChallenges = ensureArray<ChallengeItem>(challengesResult?.challenges);

  const points = useMemo(() => {
    const normalizedSelectedLetters = new Set(ensureArray<string>(selectedLetters).map((item) => normalizeLetterClient(item)));
    const query = peakSearchQuery.trim().toLocaleLowerCase("cs");

    return allPoints.filter((point) => {
      const title = (point.peakName ?? point.name ?? "").trim();
      if (!title) {
        return false;
      }

      if (selectedRangeUrls.length > 0) {
        const src = point.source ?? "";
        const inSelectedArea = selectedRangeUrls.some((url) => src.startsWith(url));
        if (!inSelectedArea) {
          return false;
        }
      }

      if (normalizedSelectedLetters.size > 0 && letterMode === "strict" && !showOtherLetters) {
        const first = normalizeLetterClient(title);
        if (!normalizedSelectedLetters.has(first)) {
          return false;
        }
      }

      if (query) {
        return title.toLocaleLowerCase("cs").includes(query);
      }

      return true;
    });
  }, [allPoints, selectedRangeUrls, selectedLetters, letterMode, showOtherLetters, peakSearchQuery]);

  // Simple peakId→challenge-count map used for sorting (computed before sortedPoints)
  const peakChallengeCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const challenge of allChallenges) {
      const ids = computePeakIds(challenge);
      for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChallenges, allPoints]);

  const sortedPoints = useMemo(() => {
    const extractId = (link?: string) => { const m = /\/mountain\/(\d+)-/.exec(link ?? ""); return m ? Number(m[1]) : null; };
    return [...points].sort((a, b) => {
      if (peakSort === "challenges") {
        const aC = peakChallengeCountMap.get(extractId(a.mountainLink) ?? -1) ?? 0;
        const bC = peakChallengeCountMap.get(extractId(b.mountainLink) ?? -1) ?? 0;
        if (bC !== aC) return bC - aC;
      }
      const aName = (a.peakName ?? a.name ?? "").toLocaleLowerCase("cs");
      const bName = (b.peakName ?? b.name ?? "").toLocaleLowerCase("cs");
      return aName.localeCompare(bName, "cs");
    });
  }, [points, peakSort, peakChallengeCountMap]);

  const visiblePoints = useMemo(() => {
    if (!filterByMapBounds || !mapBounds) return sortedPoints;
    return sortedPoints.filter((p) => {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      return lat >= mapBounds.south && lat <= mapBounds.north && lon >= mapBounds.west && lon <= mapBounds.east;
    });
  }, [sortedPoints, filterByMapBounds, mapBounds]);

  const modulePoints = visiblePoints;

  function computePeakIds(challenge: ChallengeItem): number[] {
    // Horské palindromy: scraper extracted example peaks from rules text — override with computed rule
    if (challenge.id?.includes("horske-palindromy")) {
      return allPoints
        .filter((p) => typeof p.altitude === "number" && isPalindromeAltitude(p.altitude))
        .map((p) => getPeakId(p.mountainLink))
        .filter((id): id is number => id !== null);
    }
    // Nížinář: scraper extracted examples — override with computed rule (altitude ≤ 400 m)
    if (challenge.id?.includes("nizinar")) {
      return allPoints
        .filter((p) => typeof p.altitude === "number" && p.altitude <= 400)
        .map((p) => getPeakId(p.mountainLink))
        .filter((id): id is number => id !== null);
    }
    if (Array.isArray(challenge.peakIds) && challenge.peakIds.length > 0) return challenge.peakIds;
    // Výšinář: peaks with altitude >= 1000 m
    if (challenge.id?.includes("vysinar")) {
      return allPoints
        .filter((p) => typeof p.altitude === "number" && p.altitude >= 1000)
        .map((p) => getPeakId(p.mountainLink))
        .filter((id): id is number => id !== null);
    }
    // Ptačí výzva: peaks whose name contains a bird keyword
    if (challenge.id?.includes("ptaci-vyzva")) {
      return allPoints
        .filter((p) => BIRD_KEYWORDS.test(p.name ?? ""))
        .map((p) => getPeakId(p.mountainLink))
        .filter((id): id is number => id !== null);
    }
    // Česká osmisměrka: peaks whose name appears in the 20×20 word search grid
    if (challenge.id?.includes("ceska-osmismerka")) {
      return allPoints
        .filter((p) => {
          const name = (p.peakName ?? p.name ?? "").toUpperCase().replace(/\s+/g, "");
          return name.length >= 3 && wordSearchCheck(CESKA_OSMISMERKA_GRID, name);
        })
        .map((p) => getPeakId(p.mountainLink))
        .filter((id): id is number => id !== null);
    }
    return [];
  }

  const areaAscentStats = useMemo(() => {
    const map = new Map<string, { visited: number; total: number }>();
    for (const point of allPoints) {
      const src = point.source ?? "";
      // source looks like https://cs.hory.app/area/57-prazska-plosina#...
      const areaUrl = src.split("#")[0];
      if (!areaUrl) continue;
      const peakId = getPeakId(point.mountainLink);
      const visited = peakId !== null && userAscents.has(peakId);
      const existing = map.get(areaUrl);
      if (existing) {
        existing.total++;
        if (visited) existing.visited++;
      } else {
        map.set(areaUrl, { total: 1, visited: visited ? 1 : 0 });
      }
    }
    return map;
  }, [allPoints, userAscents]);

  const peakById = useMemo(() => {
    const map = new Map<number, MapPoint>();
    for (const p of allPoints) {
      const id = getPeakId(p.mountainLink);
      if (id !== null) map.set(id, p);
    }
    return map;
  }, [allPoints]);

  type AiMapPoint = { lat: number; lon: number; name: string; description?: string; type?: string };

  const aiMapPoints = useMemo((): AiMapPoint[] => {
    const pts: AiMapPoint[] = [];
    for (const msg of messages) {
      if (!msg.toolInvocations) continue;
      for (const inv of msg.toolInvocations) {
        if (inv.toolName === "showPointsOnMap" && "result" in inv) {
          pts.push(...((inv.result as { points: AiMapPoint[] }).points ?? []));
        }
      }
    }
    return pts;
  }, [messages]);

  const aiRoute = useMemo((): { lat: number; lon: number }[] => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const invocations = messages[i].toolInvocations ?? [];
      for (const inv of invocations) {
        if (inv.toolName === "planRoute" && "result" in inv) {
          const res = inv.result as { coordinates?: { lat: number; lon: number }[] };
          if (res.coordinates && res.coordinates.length > 0) return res.coordinates;
        }
      }
    }
    return [];
  }, [messages]);

  const peakChallengesMap = useMemo(() => {
    const map = new Map<number, ChallengeItem[]>();
    for (const challenge of allChallenges) {
      const ids = computePeakIds(challenge);
      for (const peakId of ids) {
        const existing = map.get(peakId);
        if (existing) {
          existing.push(challenge);
        } else {
          map.set(peakId, [challenge]);
        }
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChallenges, allPoints]);

  function getChallengeYear(challenge: ChallengeItem): string | null {
    // Prefer explicit active period dates scraped from the page
    if (challenge.activeFrom) {
      const from = new Date(challenge.activeFrom);
      const to = challenge.activeTo ? new Date(challenge.activeTo) : null;
      const days = to ? (to.getTime() - from.getTime()) / 86_400_000 : Infinity;
      // Annual = active period ≤ ~400 days
      if (days <= 400) return String(from.getFullYear());
      return null;
    }
    // Fallback: year in challenge name (e.g. "Vytrvalec 2026")
    const match = challenge.name?.match(/\b(20\d{2})\b/);
    return match?.[1] ?? null;
  }

  const challengeCompletionMap = useMemo(() => {
    const map = new Map<string, {
      visited: number;
      total: number;
      levels?: { level: number; visited: number; total: number }[];
    }>();

    function countVisited(ids: number[], year: string | null): number {
      let n = 0;
      for (const peakId of ids) {
        const ascent = userAscents.get(peakId);
        if (!ascent) continue;
        if (year) {
          if (ascent.dates.some((d) => d.startsWith(year))) n++;
        } else {
          n++;
        }
      }
      return n;
    }

    for (const challenge of allChallenges) {
      const ids = computePeakIds(challenge);
      if (ids.length === 0 && !challenge.levels?.length) continue;
      const year = getChallengeYear(challenge);
      const visited = countVisited(ids, year);

      let levelStats: { level: number; visited: number; total: number }[] | undefined;
      if (challenge.levels && challenge.levels.length > 0) {
        levelStats = challenge.levels.map((lv) => {
          // If the level has its own peaks, count from those; otherwise use the shared pool
          const pool = lv.peakIds.length > 0 ? lv.peakIds : ids;
          const lvVisited = lv.peakIds.length > 0 ? countVisited(pool, year) : visited;
          return { level: lv.level, visited: lvVisited, total: lv.total };
        });
      }

      if (challenge.id) {
        const total = challenge.levels?.length
          ? Math.max(...challenge.levels.map((l) => l.total))
          : ids.length;
        map.set(challenge.id, { visited, total, levels: levelStats });
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChallenges, allPoints, userAscents]);

  function getPeakId(mountainLink?: string): number | null {
    if (!mountainLink) return null;
    const match = /\/mountain\/(\d+)-/.exec(mountainLink);
    return match ? Number(match[1]) : null;
  }

  const selectedLetterColorMap = useMemo(() => {
    const map = new Map<string, string>();
    ensureArray<string>(selectedLetters).forEach((letter, index) => {
      map.set(normalizeLetterClient(letter), SELECTED_LETTER_COLORS[index % SELECTED_LETTER_COLORS.length]);
    });
    return map;
  }, [selectedLetters]);

  const activeSectionMeta = useMemo(
    () => ({
      peaks: {
        title: "Vrcholy",
        description: "Výběr pohoří, filtrace názvů a mapový přehled všech načtených vrcholů.",
        icon: <Mountain className="h-5 w-5" />
      },
      challenges: {
        title: "Výzvy",
        description: "Přehled sledovaných a dostupných výzev z hory.app v samostatné sekci.",
        icon: <Target className="h-5 w-5" />
      },
    }),
    []
  );

  function pointColorByName(name: string): string {
    const first = firstLetterFromNameClient(name);
    if (!first) {
      return "#6f7f89";
    }
    return selectedLetterColorMap.get(normalizeLetterClient(first)) ?? "#6f7f89";
  }

  function addOrSwapBaseLayer(map: any, L: any, baseLayerRef: MutableRefObject<any>) {
    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = null;
    }

    if (baseMap === "mapycz-outdoor" || baseMap === "mapycz-warm") {
      // Vector tiles via OpenFreeMap (free, no API key, crisp at any zoom)
      const gl = (L as any).maplibreGL({
        style: "https://tiles.openfreemap.org/styles/liberty",
        attribution: '&copy; <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>',
      });
      if (baseMap === "mapycz-warm") {
        gl.on("add", () => {
          const container = gl.getMaplibreMap?.()?.getContainer?.();
          if (container) container.style.filter = "sepia(0.4) saturate(0.75) brightness(1.04) contrast(0.95)";
        });
      }
      gl.addTo(map);
      baseLayerRef.current = gl;
      return;
    }

    if (baseMap === "mapycz-basic") {
      // Mapy.cz raster @2x (sharper, Czech hiking trails)
      baseLayerRef.current = L.tileLayer("/api/mapy-tiles?layer=basic&z={z}&x={x}&y={y}&retina=1", {
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1,
        attribution: '&copy; <a href="https://mapy.com/" target="_blank" rel="noreferrer">Mapy.com</a>',
        className: "map-attribution",
      }).addTo(map);
      return;
    }

    baseLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
      className: "map-attribution",
    }).addTo(map);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedDistance = window.localStorage.getItem("routeMaxDistanceKm") ?? "";
      if (storedDistance) {
        setMaxDistance(storedDistance);
      }
    } catch {
      // Ignore localStorage failures.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      try {
        const response = await fetch("/api/auth-state", { cache: "no-store" });
        const payload = (await response.json()) as { hasStoredCredentials?: boolean };
        const stored = payload.hasStoredCredentials === true;

        if (cancelled) {
          return;
        }

        setHasStoredCredentials(stored);

        if (stored) {
          await loadRangesAndAreas(false, true);
        }
      } catch {
        if (!cancelled) {
          setError("Nepodařilo se ověřit automatické přihlášení.");
        }
      } finally {
        if (!cancelled) {
          setAuthBootstrapLoading(false);
        }
      }
    }

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  // Effect 1: initialize the map once, swap base layer when baseMap changes
  useEffect(() => {
    if (!areaSelectMapContainerRef.current || !isAuthenticated) return;

    let cancelled = false;

    async function initMap() {
      try {
        const L = await loadLeaflet();
        if (cancelled || !areaSelectMapContainerRef.current) return;

        leafletRef.current = L;

        if (!areaSelectMapRef.current) {
          areaSelectMapRef.current = L.map(areaSelectMapContainerRef.current, {
            renderer: L.svg({ padding: 0.5 }),
          });
          areaSelectMapRef.current.fitBounds(CZECH_REPUBLIC_BOUNDS, { padding: [12, 12] });
        }

        addOrSwapBaseLayer(areaSelectMapRef.current, L, areaBaseLayerRef);

        if (!areaPeaksLayerGroupRef.current) {
          areaPeaksLayerGroupRef.current = L.layerGroup().addTo(areaSelectMapRef.current);
        }

        areaSelectMapRef.current.invalidateSize();

        areaSelectMapRef.current.off("moveend");
        areaSelectMapRef.current.on("moveend", () => {
          if (mapBoundsTimerRef.current) clearTimeout(mapBoundsTimerRef.current);
          mapBoundsTimerRef.current = setTimeout(() => {
            const b = areaSelectMapRef.current?.getBounds();
            if (b) setMapBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
          }, 250);
        });

        const b = areaSelectMapRef.current.getBounds();
        setMapBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });

        if (!cancelled) setMapReady(true);
      } catch (err) {
        console.error("Map init failed", err);
        if (!cancelled) setError("Nepodařilo se inicializovat mapu.");
      }
    }

    initMap();
    return () => { cancelled = true; };
  }, [isAuthenticated, baseMap]);

  // Notify Leaflet when the map container visibility changes (section switch)
  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(() => {
      areaSelectMapRef.current?.invalidateSize();
    }, 50);
    return () => clearTimeout(t);
  }, [mapReady, activeSection, activeModule]);

  // Effect 2: render peak markers whenever points or colors change
  useEffect(() => {
    const L = leafletRef.current;
    const group = areaPeaksLayerGroupRef.current;
    if (!mapReady || !L || !group) return;

    function radiusForZoom(zoom: number) {
      return zoom >= 13 ? 7 : 5;
    }

    peakMarkersRef.current.clear();
    group.clearLayers();

    const zoom = areaSelectMapRef.current?.getZoom() ?? 10;
    const radius = radiusForZoom(zoom);

    for (const point of modulePoints) {
      const lat = Number(point.lat);
      const lon = Number(point.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const peakId = getPeakId(point.mountainLink);
      const ascended = peakId !== null && userAscents.has(peakId);
      const title = point.peakName || point.name || "Bez názvu";
      const marker = L.circleMarker([lat, lon], {
        radius,
        color: ascended ? "#78350f" : "#0f172a",
        weight: ascended ? 1.5 : 1,
        fillColor: ascended ? "#fbbf24" : pointColorByName(title),
        fillOpacity: 0.92,
      });
      marker.on("click", () => setSelectedPeak(point));
      marker.addTo(group);
      if (point.mountainLink) peakMarkersRef.current.set(point.mountainLink, marker);
    }

    areaSelectMapRef.current?.off("zoomend");
    areaSelectMapRef.current?.on("zoomend", () => {
      const r = radiusForZoom(areaSelectMapRef.current?.getZoom() ?? 10);
      peakMarkersRef.current.forEach((marker, link) => {
        const peakId = getPeakId(link);
        const inChallenge = peakId !== null && challengePeakIdsRef.current.has(peakId);
        marker.setRadius(inChallenge ? r + 3 : r);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, modulePoints, selectedLetterColorMap, userAscents]);

  useEffect(() => {
    if (!areaSelectMapRef.current) return;
    // Reset all markers to default style
    const z = areaSelectMapRef.current?.getZoom() ?? 10;
    const r = z >= 13 ? 7 : 5;
    peakMarkersRef.current.forEach((marker) => {
      marker.setStyle({ color: "#0f172a", weight: 1, radius: r });
    });
    if (!selectedPeak) return;
    areaSelectMapRef.current.setView([Number(selectedPeak.lat), Number(selectedPeak.lon)], 14);
    // Highlight selected marker
    const marker = selectedPeak.mountainLink ? peakMarkersRef.current.get(selectedPeak.mountainLink) : null;
    if (marker) {
      marker.setStyle({ color: "#10b981", weight: 3, radius: 9 });
      marker.bringToFront();
    }
  }, [selectedPeak]);

  // Challenge highlight — tints peaks belonging to the selected challenge
  useEffect(() => {
    if (!mapReady || !areaSelectMapRef.current) return;

    // Compute the new set of highlighted peak IDs
    const newIds = new Set<number>();
    if (selectedChallengeId) {
      const challenge = allChallenges.find((c) => c.id === selectedChallengeId);
      if (challenge) computePeakIds(challenge).forEach((id) => newIds.add(id));
    }
    challengePeakIdsRef.current = newIds;

    // Apply styles to all markers
    peakMarkersRef.current.forEach((marker, link) => {
      const peakId = getPeakId(link);
      const inChallenge = peakId !== null && newIds.has(peakId);
      const ascended = peakId !== null && userAscents.has(peakId);
      const point = peakId !== null ? peakById.get(peakId) : undefined;
      const title = point?.peakName || point?.name || "";

      const cz = areaSelectMapRef.current?.getZoom() ?? 10;
      const cr = cz >= 13 ? 7 : 5;
      if (inChallenge) {
        marker.setStyle({
          radius: cr + 3,
          color: "#059669",
          weight: 2.5,
          fillColor: ascended ? "#fbbf24" : "#10b981",
          fillOpacity: 1,
        });
        marker.bringToFront();
      } else {
        marker.setStyle({
          radius: cr,
          color: ascended ? "#78350f" : "#0f172a",
          weight: ascended ? 1.5 : 1,
          fillColor: ascended ? "#fbbf24" : pointColorByName(title),
          fillOpacity: 0.92,
        });
      }
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, selectedChallengeId, allChallenges, allPoints, userAscents]);

  // AI map overlay — points and route from chat tool calls
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !areaSelectMapRef.current) return;
    const L = leafletRef.current;
    const map = areaSelectMapRef.current;

    // AI points layer — use DivIcon markers (no canvas → no zoom drift)
    if (!aiLayerGroupRef.current) {
      aiLayerGroupRef.current = L.layerGroup().addTo(map);
    }
    aiLayerGroupRef.current.clearLayers();
    for (const pt of aiMapPoints) {
      const color = pt.type === "peak" ? "#10b981" : pt.type === "cafe" ? "#f59e0b" : pt.type === "castle" ? "#8b5cf6" : "#6366f1";
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.35)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupAnchor: [0, -9],
      });
      L.marker([pt.lat, pt.lon], { icon })
        .bindPopup(`<strong>${pt.name}</strong>${pt.description ? `<br/><span style="font-size:12px">${pt.description}</span>` : ""}`)
        .addTo(aiLayerGroupRef.current);
    }

    // AI route polyline
    if (aiRouteLayerRef.current) {
      aiRouteLayerRef.current.remove();
      aiRouteLayerRef.current = null;
    }
    if (aiRoute.length >= 2) {
      aiRouteLayerRef.current = L.polyline(aiRoute.map((p) => [p.lat, p.lon]), { color: "#6366f1", weight: 4, opacity: 0.85 }).addTo(map);
      map.fitBounds(aiRouteLayerRef.current.getBounds().pad(0.1), { maxZoom: 14 });
    } else if (aiMapPoints.length > 0) {
      const bounds = L.latLngBounds(aiMapPoints.map((p) => [p.lat, p.lon]));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, aiMapPoints, aiRoute]);



  async function loadAreaFeatures(ranges: RangeItem[], forceRefresh = false): Promise<boolean> {
    setAreasLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch("/api/area-geojson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          username,
          password,
          areaItems: ranges,
          maxAreas: 120,
          forceRefresh
        })
      });

      const payload = (await response.json()) as AreaGeojsonResponse & { error?: string };
      if (!response.ok) {
        setError(payload?.error ?? "Nepodařilo se načíst mapové hranice oblastí.");
        return false;
      }

      if (payload.features.length === 0) {
        setError("Nepodařilo se načíst hranice oblastí (0 prvků). Zkus obnovit oblasti.");
        return false;
      }

      setInfo(
        payload.cached
          ? `Hranice oblastí načteny z cache (${payload.features.length}).`
          : `Hranice oblastí čerstvě staženy (${payload.features.length}).`
      );
      return true;
    } catch {
      setError("Nepodařilo se načíst mapové hranice oblastí.");
      return false;
    } finally {
      clearTimeout(timeoutId);
      setAreasLoading(false);
    }
  }

  async function loadCachedPeaksForCountries(countries: CountryCode[]): Promise<MapPointsResponse | null> {
    const responses = await Promise.all(
      countries.map(async (countryCode) => {
        const country = COUNTRY_CONFIG.find((c) => c.code === countryCode)!;
        try {
          const response = await fetch("/api/map-points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              password,
              countryCode,
              targetUrl: country.url,
              startsWithLetters: [],
              letterMode: "prefer",
              selectedAreaUrls: [],
              useCache: true,
              cacheOnly: true
            })
          });
          if (!response.ok) return null;
          const payload = (await response.json()) as MapPointsResponse & { error?: string };
          if (!payload.cached || !Array.isArray(payload.points)) return null;
          return payload;
        } catch {
          return null;
        }
      })
    );

    const valid = responses.filter((r): r is MapPointsResponse => r !== null);
    if (valid.length === 0) return null;

    const merged: MapPointsResponse = {
      ...valid[0],
      points: valid.flatMap((r) => r.points),
      count: valid.reduce((sum, r) => sum + r.count, 0),
      sources: valid.flatMap((r) => r.sources)
    };

    setResult(merged);
    setActiveSection("peaks");
    return merged;
  }

  async function loadCachedPeaksIfAvailable(): Promise<MapPointsResponse | null> {
    return loadCachedPeaksForCountries(selectedCountries);
  }

  async function loadCachedChallengesIfAvailable(): Promise<ChallengesResponse | null> {
    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          useCache: true,
          cacheOnly: true
        })
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as ChallengesResponse & { error?: string };
      if (!payload.cached || !Array.isArray(payload.challenges)) {
        return null;
      }

      setChallengesResult(payload);
      return payload;
    } catch {
      return null;
    }
  }

  async function loadUserAscents(refresh = false): Promise<void> {
    setAscentsLoading(true);
    try {
      const response = await fetch("/api/user-ascents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, refreshCache: refresh }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        ascents?: { peakId: number; count: number; dates: string[] }[];
      };
      if (!Array.isArray(payload.ascents)) return;
      const map = new Map<number, { count: number; dates: string[] }>();
      for (const a of payload.ascents) {
        map.set(a.peakId, { count: a.count, dates: a.dates });
      }
      setUserAscents(map);
    } catch {
      // silently skip — ascents are non-critical
    } finally {
      setAscentsLoading(false);
    }
  }

  async function loadRangesAndAreas(forceRefreshAreas = false, allowStoredCredentials = false): Promise<boolean> {
    if (!allowStoredCredentials && (!username.trim() || !password.trim())) {
      setError("Vyplň login a heslo.");
      return false;
    }

    setRangesLoading(true);
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const payload = (await response.json()) as ScrapeResponse & { error?: string };
      if (!response.ok) {
        setError(payload?.error ?? "Nepodařilo se načíst seznam oblastí.");
        return false;
      }

      const sorted = ensureArray<RangeItem>(payload.ranges).sort((a, b) => a.name.localeCompare(b.name, "cs"));
      setRangeOptions(sorted);
      setSelectedRangeUrls([]);
      setIsAuthenticated(true);
      setActiveSection("peaks");

      setInfo(`Načteno ${sorted.length} oblastí. Načítám mapové hranice...`);
      const areaOk = await loadAreaFeatures(sorted, forceRefreshAreas);
      const cachedPeaks = await loadCachedPeaksIfAvailable();
      const cachedChallenges = await loadCachedChallengesIfAvailable();
      void loadUserAscents();

      if (areaOk) {
        setInfo(
          cachedPeaks
            ? `Načteno ${sorted.length} oblastí. Z cache vrcholů načteno ${cachedPeaks.count} bodů${cachedChallenges ? ` a ${cachedChallenges.count} výzev` : ""}.`
            : `Načteno ${sorted.length} oblastí. Vrcholy zatím nejsou v cache, načti je v submenu.`
        );
      }

      return true;
    } catch {
      setError("Nepodařilo se načíst seznam oblastí.");
      return false;
    } finally {
      setRangesLoading(false);
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setChallengesResult(null);
    await loadRangesAndAreas(false, false);
  }

  async function handleDownloadAllPeaks() {
    setCacheDownloadLoading(true);
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/map-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          startsWithLetters: [],
          letterMode: "prefer",
          selectedAreaUrls: [],
          useCache: false,
          refreshAllCache: true,
          crawlRanges: true,
          maxRanges: 300
        })
      });

      const payload = (await response.json()) as MapPointsResponse & { error?: string };
      if (!response.ok) {
        setError(payload?.error ?? "Stažení všech vrcholů selhalo.");
        return;
      }

      setInfo(`Cache vrcholů aktualizována: ${payload.count} vrcholů, projito oblastí: ${payload.scannedRangePages ?? 0}.`);
      setResult(payload);
      setActiveSection("peaks");
    } catch {
      setError("Nepodařilo se stáhnout vrcholy do cache.");
    } finally {
      setCacheDownloadLoading(false);
    }
  }

  async function handleDownloadPeaksForCountry(countryCode: CountryCode) {
    const country = COUNTRY_CONFIG.find((c) => c.code === countryCode)!;
    setCountryDownloadLoading((prev) => ({ ...prev, [countryCode]: true }));
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/map-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          countryCode,
          targetUrl: country.url,
          startsWithLetters: [],
          letterMode: "prefer",
          selectedAreaUrls: [],
          useCache: false,
          refreshAllCache: true,
          crawlRanges: true,
          maxRanges: 300
        })
      });

      const payload = (await response.json()) as MapPointsResponse & { error?: string };
      if (!response.ok) {
        setError(payload?.error ?? `Stažení vrcholů (${country.name}) selhalo.`);
        return;
      }

      setInfo(`Cache vrcholů (${country.name}) aktualizována: ${payload.count} vrcholů, projito oblastí: ${payload.scannedRangePages ?? 0}.`);
      await loadCachedPeaksForCountries(selectedCountries);
    } catch {
      setError(`Nepodařilo se stáhnout vrcholy (${country.name}) do cache.`);
    } finally {
      setCountryDownloadLoading((prev) => ({ ...prev, [countryCode]: false }));
    }
  }

  async function handleDownloadChallenges() {
    setChallengesLoading(true);
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          useCache: false,
          refreshCache: true
        })
      });

      const payload = (await response.json()) as ChallengesResponse & { error?: string };
      if (!response.ok) {
        setError(payload?.error ?? "Stažení výzev selhalo.");
        return;
      }

      setChallengesResult(payload);
      setInfo(`Cache výzev aktualizována: ${payload.count} výzev.`);
      setActiveSection("challenges");
    } catch {
      setError("Nepodařilo se stáhnout výzvy do cache.");
    } finally {
      setChallengesLoading(false);
    }
  }

  function toggleLetter(letter: string) {
    setSelectedLetters((prev) =>
      prev.includes(letter) ? prev.filter((item) => item !== letter) : [...prev, letter].sort((a, b) => a.localeCompare(b))
    );
  }

  function toggleRangeSelection(rangeUrl: string) {
    setSelectedRangeUrls((prev) => (prev.includes(rangeUrl) ? prev.filter((url) => url !== rangeUrl) : [...prev, rangeUrl]));
  }

  function selectAllRanges() {
    setSelectedRangeUrls(rangeOptions.map((item) => item.url));
  }

  function clearRangeSelection() {
    setSelectedRangeUrls([]);
  }

  async function handleRoutePlanningSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRouteError("");
    setRouteInfo("");
    setRoutePlans([]);

    if (modulePoints.length < 2) {
      setRouteError("Pro plánování trasy potřebuješ alespoň 2 vrcholy.");
      return;
    }

    const parsedDistance = Number(maxDistance.replace(",", "."));
    if (!Number.isFinite(parsedDistance) || parsedDistance <= 0) {
      setRouteError("Zadej platnou cílovou délku trasy v km.");
      return;
    }

    try {
      window.localStorage.setItem("routeMaxDistanceKm", String(parsedDistance));
    } catch {
      // Ignore localStorage failures.
    }

    setRoutePlanningLoading(true);

    try {
      const response = await fetch("/api/plan-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: modulePoints,
          maxDistance: parsedDistance,
          startsWithLetters: selectedLetters,
          letterMode,
          routeMode
        })
      });

      const payload = (await response.json()) as PlanRouteResponse & { error?: string };
      if (!response.ok) {
        setRouteError(payload.error ?? "Plánování trasy selhalo.");
        return;
      }

      setRoutePlans(ensureArray<PlannedRoute>(payload.routes));
      const calls = payload.apiCalls ?? 0;
      const credits = payload.estimatedCredits ?? 0;
      setRouteInfo(
        payload.cached
          ? `Nalezeno ${payload.count} tras (cache hit, nové API volání: 0, kredity: 0).`
          : `Nalezeno ${payload.count} tras (API volání: ${calls}, odhad kreditů: ${credits}).`
      );
      setActiveModule("routes"); setIsModulePanelOpen(true);
    } catch {
      setRouteError("Nepodařilo se spojit s API pro plánování tras.");
    } finally {
      setRoutePlanningLoading(false);
    }
  }

  async function handleAiPlanningSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRouteError("");
    setRouteInfo("");
    setRoutePlans([]);

    if (!aiPrompt.trim()) {
      setRouteError("Napiš prompt pro AI plánování.");
      return;
    }

    if (modulePoints.length < 2) {
      setRouteError("Pro AI plánování potřebuješ alespoň 2 vrcholy.");
      return;
    }

    setAiLoading(true);
    setAiIntent(null);
    setAiParser(null);

    try {
      const response = await fetch("/api/ai-plan-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          points: modulePoints,
          fallback: {
            maxDistance: Number(maxDistance),
            startsWithLetters: selectedLetters,
            letterMode,
            routeMode
          }
        })
      });

      const payload = (await response.json()) as AiPlanRouteResponse & { error?: string };
      if (!response.ok) {
        setRouteError(payload.error ?? "AI plánování selhalo.");
        if (payload.intent) {
          setAiIntent(payload.intent);
          setAiParser(payload.parser ?? null);
        }
        return;
      }

      setRoutePlans(ensureArray<PlannedRoute>(payload.routes));
      setAiIntent(payload.intent ?? null);
      setAiParser(payload.parser ?? null);

      if (payload.intent) {
        setMaxDistance(String(payload.intent.distanceKmTarget));
        setRouteMode(payload.intent.routeMode);
        setLetterMode(payload.intent.letterMode);
        setSelectedLetters(ensureArray<string>(payload.intent.preferredLetters));
      }

      const calls = payload.apiCalls ?? 0;
      const credits = payload.estimatedCredits ?? 0;
      setRouteInfo(
        payload.cached
          ? `AI: nalezeno ${payload.count} tras (cache hit, nové API volání: 0, kredity: 0).`
          : `AI: nalezeno ${payload.count} tras (API volání: ${calls}, odhad kreditů: ${credits}).`
      );
      setActiveModule("routes"); setIsModulePanelOpen(true);
    } catch {
      setRouteError("Nepodařilo se spojit s AI plánovačem.");
    } finally {
      setAiLoading(false);
    }
  }

  const navItems: Array<{ key: SectionKey; label: string; icon: ReactNode }> = [
    { key: "peaks", label: "Vrcholy", icon: <Mountain className="h-5 w-5" /> },
    { key: "challenges", label: "Výzvy", icon: <Target className="h-5 w-5" /> }
  ];
  const moduleItems: Array<{ key: "hory"; label: string; icon: ReactNode }> = [
    { key: "hory", label: "Hory", icon: <Mountain className="h-5 w-5" /> }
  ];

  const statusMessage = error || routeError;
  const infoMessage = info || routeInfo;

  function renderLoginScreen() {
    return (
      <main className="min-h-screen bg-transparent p-4 lg:p-6">
        <div className="grid min-h-[calc(100vh-2rem)] overflow-hidden rounded-[2rem] border border-zinc-200 bg-white/75 shadow-[0_30px_120px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative flex flex-col justify-between overflow-hidden p-8 text-white lg:p-10" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1582723312969-a00e6e48017f?w=1400&q=80&fit=crop')", backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/80 via-zinc-900/60 to-emerald-950/70" />
            <div className="relative z-10">
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-white">Křížem krážem</Badge>
              <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight">Mapový workspace pro vrcholy, trasy a výzvy.</h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-300">
                Samostatná přihlašovací obrazovka načte po přihlášení celý workspace. Když jsou údaje v `.env`, proběhne vše automaticky na pozadí.
              </p>
            </div>
            <div className="relative z-10 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <Mountain className="h-5 w-5" />
                <p className="mt-3 text-sm font-medium">Vrcholy</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <Route className="h-5 w-5" />
                <p className="mt-3 text-sm font-medium">Trasy</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <Target className="h-5 w-5" />
                <p className="mt-3 text-sm font-medium">Výzvy</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 lg:p-10">
            <Card className="w-full max-w-md rounded-[2rem] border-zinc-200/80 bg-white/95 shadow-none">
              <CardHeader className="space-y-4 pb-6">
                <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em]">
                  Přihlášení do hory.app
                </Badge>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-3xl tracking-tight">Login</CardTitle>
                    <HelpHint
                      text={
                        authBootstrapLoading && hasStoredCredentials
                          ? "Probíhá automatické přihlášení z uložených údajů v .env."
                          : "Přihlas se ručně, pokud nechceš nebo nemůžeš použít uložené credentials."
                      }
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {authBootstrapLoading ? (
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-500" />
                    <p className="mt-4 text-sm text-zinc-600">
                      {hasStoredCredentials
                        ? "Automatické přihlášení běží na pozadí..."
                        : "Kontroluji, jestli jsou v .env k dispozici uložené přihlašovací údaje..."}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">Login</label>
                      <Input
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">Heslo</label>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full justify-center rounded-2xl" disabled={rangesLoading || areasLoading}>
                      {rangesLoading || areasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
                      {rangesLoading || areasLoading ? "Přihlašuji..." : "Přihlásit se"}
                    </Button>
                  </form>
                )}

                {statusMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{statusMessage}</div>
                ) : null}

                {infoMessage && !statusMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    {infoMessage}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  function toggleFilter(key: string) {
    setOpenFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function renderPeaksSidebar() {
    return (
      <div className="space-y-4">
        <FilterSection id="countries" label={`Země (${selectedCountries.length})`} hint="Vyberte země, jejichž vrcholy chcete zobrazit." isOpen={openFilters.has("countries")} onToggle={toggleFilter}>
          <div className="flex flex-wrap gap-2">
            {COUNTRY_CONFIG.map((country) => {
              const active = selectedCountries.includes(country.code);
              return (
                <button
                  key={country.code}
                  type="button"
                  title={country.label}
                  onClick={() => {
                    setSelectedCountries((prev) => {
                      if (prev.includes(country.code)) {
                        if (prev.length <= 1) return prev;
                        const next = prev.filter((c) => c !== country.code);
                        void loadCachedPeaksForCountries(next);
                        return next;
                      }
                      const next = [...prev, country.code];
                      void loadCachedPeaksForCountries(next);
                      return next;
                    });
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-zinc-800 bg-zinc-800 text-white"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                  )}
                >
                  {country.name}
                </button>
              );
            })}
          </div>
        </FilterSection>
        <FilterSection id="letters" label={selectedLetters.length > 0 ? `Písmena (${selectedLetters.length})` : "Písmena"} hint="Striktní režim skryje ostatní vrcholy, preferovaný je jen obarví." isOpen={openFilters.has("letters")} onToggle={toggleFilter}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={letterMode === "strict" ? "default" : "outline"}
                className="w-full rounded-2xl"
                onClick={() => setLetterMode("strict")}
              >
                Striktní
              </Button>
              <Button
                type="button"
                variant={letterMode === "prefer" ? "default" : "outline"}
                className="w-full rounded-2xl"
                onClick={() => setLetterMode("prefer")}
              >
                Preferovat
              </Button>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={showOtherLetters}
                onChange={(e) => setShowOtherLetters(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span>Zobrazit ostatní písmena šedě</span>
            </label>
            <div className="grid grid-cols-6 gap-2">
              {CZECH_ALPHABET.map((letter) => (
                <label
                  key={letter}
                  className={selectedLetters.includes(letter) ? "letter-pill is-active" : "letter-pill"}
                  style={
                    selectedLetters.includes(letter)
                      ? ({ "--letter-color": selectedLetterColorMap.get(normalizeLetterClient(letter)) } as CSSProperties)
                      : undefined
                  }
                >
                  <input type="checkbox" checked={selectedLetters.includes(letter)} onChange={() => toggleLetter(letter)} />
                  <span>{letter}</span>
                </label>
              ))}
            </div>
          </div>
        </FilterSection>

        <FilterSection id="areas" label={selectedRangeUrls.length > 0 ? `Oblasti (${selectedRangeUrls.length})` : "Oblasti"} hint="Klikání v mapě a ruční výběr drží stejný stav." isOpen={openFilters.has("areas")} onToggle={toggleFilter}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={selectAllRanges}>
                Vybrat vše
              </Button>
              <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={clearRangeSelection}>
                Zrušit
              </Button>
            </div>
            <ScrollArea className="max-h-64 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="space-y-2">
                {rangeOptions.map((range) => {
                  const stats = areaAscentStats.get(range.url);
                  const pct = stats && stats.total > 0 ? Math.round((stats.visited / stats.total) * 100) : null;
                  return (
                    <label key={range.url} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-zinc-700 hover:bg-white">
                      <input
                        type="checkbox"
                        checked={selectedRangeUrls.includes(range.url)}
                        onChange={() => toggleRangeSelection(range.url)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
                      />
                      <span className="flex-1">{range.name}</span>
                      {pct !== null && (
                        <span className={cn("shrink-0 text-xs font-medium tabular-nums", pct === 100 ? "text-amber-500" : "text-zinc-400")}>
                          {pct} %
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </FilterSection>

        <div className="flex min-h-0 flex-col" style={{minHeight: 0}}>
          <div className="mb-2 px-1 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                type="search"
                value={peakSearchQuery}
                onChange={(e) => setPeakSearchQuery(e.target.value)}
                placeholder="Hledat vrchol..."
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPeakSort("alpha")}
                className={cn("flex-1 rounded-xl border px-3 py-1.5 text-xs font-medium transition", peakSort === "alpha" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100")}
              >
                A–Z
              </button>
              <button
                type="button"
                onClick={() => setPeakSort("challenges")}
                className={cn("flex-1 rounded-xl border px-3 py-1.5 text-xs font-medium transition", peakSort === "challenges" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100")}
              >
                Podle výzev
              </button>
            </div>
          </div>
          <div className="overflow-y-auto pr-1">
            <div className="space-y-1">
              {visiblePoints.length === 0 ? (
                <p className="text-sm text-zinc-500">{sortedPoints.length > 0 ? "Žádný vrchol v aktuálním výřezu mapy." : "Žádný vrchol neodpovídá filtru."}</p>
              ) : (
                visiblePoints.map((point) => {
                  const title = point.peakName || point.name || "Bez názvu";
                  const isSelected = selectedPeak?.lat === point.lat && selectedPeak?.lon === point.lon;
                  return (
                    <button
                      key={`peak-${point.lat}-${point.lon}-${title}`}
                      type="button"
                      onClick={() => setSelectedPeak(isSelected ? null : point)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors",
                        isSelected
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                      )}
                    >
                      {(() => {
                        const pid = getPeakId(point.mountainLink);
                        const ascended = pid !== null && userAscents.has(pid);
                        return (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: ascended ? "#fbbf24" : pointColorByName(title) }}
                            title={ascended ? `Navštíveno ${userAscents.get(pid!)!.count}×` : undefined}
                          />
                        );
                      })()}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                      {(() => {
                        const pid = getPeakId(point.mountainLink);
                        const challenges = pid ? (peakChallengesMap.get(pid) ?? []) : [];
                        if (challenges.length === 0) return null;
                        return (
                          <span className="flex shrink-0 items-center gap-0.5">
                            {challenges.map((c) => (
                              <span
                                key={c.name}
                                className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-emerald-300" : "bg-emerald-500")}
                                title={c.name}
                              />
                            ))}
                          </span>
                        );
                      })()}
                      <span className={cn("shrink-0 text-xs", isSelected ? "text-zinc-300" : "text-zinc-400")}>
                        {point.altitude ? `${point.altitude} m` : "—"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderRoutesSidebar() {
    return (
      <div className="space-y-6">
        <Card className="rounded-3xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">AI prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Např. chci okruh kolem 16 km, hlavně vrcholy na B a R..."
            />
            <Button type="button" className="w-full justify-center rounded-2xl" onClick={(e) => void handleAiPlanningSubmit(e as any)}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI navrhni trasu
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Parametry trasy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={routeMode === "roundtrip" ? "default" : "outline"}
                className="w-full rounded-2xl"
                onClick={() => setRouteMode("roundtrip")}
              >
                Okružní
              </Button>
              <Button
                type="button"
                variant={routeMode === "linear" ? "default" : "outline"}
                className="w-full rounded-2xl"
                onClick={() => setRouteMode("linear")}
              >
                Lineární
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Cílová délka</label>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                <input
                  type="range"
                  min={3}
                  max={45}
                  step={1}
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(e.target.value)}
                  className="w-full"
                />
                <div className="mt-2 flex items-center justify-between text-sm text-zinc-500">
                  <span>3 km</span>
                  <strong className="text-zinc-950">{maxDistance} km</strong>
                  <span>45 km</span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              className="w-full justify-center rounded-2xl"
              onClick={(e) => void handleRoutePlanningSubmit(e as any)}
            >
              {routePlanningLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              Naplánovat trasy
            </Button>
          </CardContent>
        </Card>

        {aiIntent ? (
          <Card className="rounded-3xl border-emerald-200 bg-emerald-50/70">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">AI interpretace{aiParser ? ` (${aiParser})` : ""}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-2xl bg-white p-4 text-xs text-zinc-700">
                {JSON.stringify(aiIntent, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  function renderChallengesSidebar() {
    return (
      <div className="space-y-6">
        <Card className="rounded-3xl">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Synchronizace</CardTitle>
              <HelpHint text="Aktualizuje lokální cache výzev a promítne ji do pravého panelu." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" className="w-full justify-center rounded-2xl" onClick={handleDownloadChallenges}>
              {challengesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              Načíst výzvy
            </Button>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              Načteno: <strong className="text-zinc-950">{allChallenges.length}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Rychlý náhled</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-72 space-y-2">
              <div className="space-y-2">
                {allChallenges.length === 0 ? (
                  <p className="text-sm text-zinc-500">Výzvy ještě nejsou načtené.</p>
                ) : (
                  allChallenges.slice(0, 12).map((challenge) => (
                    <div key={challenge.name} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                      {challenge.name}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderSidebarContent() {
    if (activeSection === "challenges") return renderChallengesSidebar();
    return renderPeaksSidebar();
  }

  function renderPeakDetail() {
    if (!selectedPeak) return null;
    return (
      <div className="rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={() => setSelectedPeak(null)}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-950"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Zpět na seznam
          </button>
        </div>
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
              {selectedPeak.peakName || selectedPeak.name || "Bez názvu"}
            </h3>
            {selectedPeak.altitude && (
              <p className="mt-0.5 text-sm text-zinc-500">{selectedPeak.altitude} m n. m.</p>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-zinc-100 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Souřadnice</span>
            <span className="font-mono text-xs text-zinc-700">{Number(selectedPeak.lat).toFixed(5)}, {Number(selectedPeak.lon).toFixed(5)}</span>
          </div>
          {selectedPeak.source && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Zdroj</span>
              <span className="text-zinc-700 text-xs truncate max-w-[60%]">{selectedPeak.source}</span>
            </div>
          )}
        </div>
        {(() => {
          const peakId = getPeakId(selectedPeak.mountainLink);
          const ascent = peakId !== null ? userAscents.get(peakId) : null;
          if (!ascent) return null;
          return (
            <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Moje výstupy</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  {ascent.count}× navštíveno
                </span>
                {ascent.dates[0] && (
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    Naposledy {ascent.dates[0]}
                  </span>
                )}
              </div>
            </div>
          );
        })()}
        {(() => {
          const peakId = getPeakId(selectedPeak.mountainLink);
          const challenges = peakId ? (peakChallengesMap.get(peakId) ?? []) : [];
          if (challenges.length === 0) return null;
          return (
            <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Výzvy</p>
              <div className="flex flex-wrap gap-1.5">
                {challenges.map((c) => (
                  <span key={c.name} className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        {selectedPeak.mountainLink && (
          <div className="px-4 pb-4 pt-2">
            <a
              href={selectedPeak.mountainLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
            >
              Otevřít na hory.app
            </a>
          </div>
        )}
      </div>
    );
  }

  function renderHoryContent() {
    if (activeSection === "challenges") {
      const availableCategories = Array.from(
        new Set(allChallenges.map((c) => c.category).filter(Boolean) as string[])
      ).sort((a, b) => a.localeCompare(b, "cs"));

      const filteredChallenges = categoryFilter
        ? allChallenges.filter((c) => c.category === categoryFilter)
        : allChallenges;

      const sortedChallenges = [...filteredChallenges].sort((a, b) => {
        if (challengeSort === "alpha") return (a.name ?? "").localeCompare(b.name ?? "", "cs");
        if (challengeSort === "completion") {
          const ca = a.id ? challengeCompletionMap.get(a.id) : null;
          const cb = b.id ? challengeCompletionMap.get(b.id) : null;
          const pa = ca && ca.total > 0 ? ca.visited / ca.total : 0;
          const pb = cb && cb.total > 0 ? cb.visited / cb.total : 0;
          return pb - pa;
        }
        return 0;
      });

      return (
        <div className="space-y-4">
          {allChallenges.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {(["default", "alpha", "completion"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setChallengeSort(s)}
                    className={cn(
                      "rounded-xl px-3 py-1.5 text-xs font-medium transition",
                      challengeSort === s ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    )}
                  >
                    {s === "default" ? "Výchozí" : s === "alpha" ? "A–Z" : "Plnění"}
                  </button>
                ))}
                <span className="ml-auto text-xs text-zinc-400">{sortedChallenges.length} výzev</span>
              </div>
              {availableCategories.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="">Všechny kategorie</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {allChallenges.length === 0 ? (
            <div className="grid place-items-center rounded-[1.5rem] border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center">
              <Target className="mx-auto h-8 w-8 text-zinc-400" />
              <p className="mt-4 text-sm text-zinc-500">Výzvy nejsou načtené. Spusť synchronizaci v Nastavení.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedChallenges.map((challenge, index) => (
                <Card
                  key={challenge.name}
                  className={cn(
                    "rounded-[1.75rem] bg-gradient-to-br from-white to-zinc-50 shadow-none cursor-pointer transition-all select-none",
                    selectedChallengeId === challenge.id
                      ? "border-emerald-400 ring-2 ring-emerald-400/40"
                      : "border-zinc-200 hover:border-zinc-300"
                  )}
                  onClick={() => challenge.id && setSelectedChallengeId(selectedChallengeId === challenge.id ? null : challenge.id)}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full px-3 py-1">Výzva {index + 1}</Badge>
                      {challenge.challengeType ? (
                        <Badge variant="secondary" className="rounded-full px-3 py-1">
                          {challenge.challengeType === "specific-list" ? "Seznamová" : challenge.challengeType === "property-based" ? "Vlastnostní" : challenge.challengeType === "crossword" ? "Tajenka" : "Neurčeno"}
                        </Badge>
                      ) : null}
                      {Array.isArray(challenge.peakIds) && challenge.peakIds.length > 0 ? (
                        <Badge variant="secondary" className="rounded-full px-3 py-1">{challenge.peakIds.length} vrcholů</Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-amber-600 border-amber-400 bg-amber-50">Bez vrcholů</Badge>
                      )}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold tracking-tight text-zinc-950">{challenge.name}</h3>
                    {challenge.rulesText ? (
                      <p className="mt-2 line-clamp-4 text-sm leading-6 text-zinc-500">{challenge.rulesText}</p>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-zinc-500">Název byl načten ze stránky výzev a uložen do lokální cache pro další použití.</p>
                    )}
                    {selectedChallengeId === challenge.id && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Vrcholy zobrazeny na mapě
                      </p>
                    )}
                    {(() => {
                      const completion = challenge.id ? challengeCompletionMap.get(challenge.id) : null;
                      if (!completion || completion.total === 0 || userAscents.size === 0) return null;
                      const yearLabel = getChallengeYear(challenge);
                      const label = yearLabel ? `Plnění ${yearLabel}` : "Plnění";

                      if (completion.levels && completion.levels.length > 0) {
                        return (
                          <div className="mt-3 space-y-1.5">
                            {completion.levels.map((lv) => {
                              if (lv.total === 0) return null;
                              const pct = Math.min(100, Math.round((lv.visited / lv.total) * 100));
                              return (
                                <div key={lv.level}>
                                  <div className="mb-0.5 flex items-center justify-between text-xs text-zinc-500">
                                    <span>{label} – {lv.level}. úroveň</span>
                                    <span className="font-medium tabular-nums text-zinc-700">{lv.visited} / {lv.total} ({pct} %)</span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                                    <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

                      const pct = Math.round((completion.visited / completion.total) * 100);
                      return (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                            <span>{label}</span>
                            <span className="font-medium tabular-nums text-zinc-700">{completion.visited} / {completion.total} ({pct} %)</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                            <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                    {(() => {
                      const completion = challenge.id ? challengeCompletionMap.get(challenge.id) : null;
                      if (!completion || completion.visited === 0 || userAscents.size === 0) return null;
                      const isExpanded = expandedChallengeId === challenge.id;
                      const year = getChallengeYear(challenge);
                      return (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedChallengeId(isExpanded ? null : (challenge.id ?? null)); }}
                            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition"
                          >
                            <span>Moje navštívené vrcholy ({completion.visited})</span>
                            <svg className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          {isExpanded && (() => {
                            const ids = computePeakIds(challenge);
                            const visited = ids.flatMap((id) => {
                              const ascent = userAscents.get(id);
                              if (!ascent) return [];
                              const dates = year ? ascent.dates.filter((d) => d.startsWith(year)) : ascent.dates;
                              if (dates.length === 0) return [];
                              const point = peakById.get(id);
                              const name = point?.peakName ?? point?.name ?? String(id);
                              return [{ id, name, date: dates[0] }];
                            });
                            return (
                              <ul className="mt-2 space-y-1">
                                {visited.map((v) => (
                                  <li key={v.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs bg-amber-50 border border-amber-100">
                                    <span className="font-medium text-zinc-800">{v.name}</span>
                                    <span className="text-zinc-400 tabular-nums">{v.date}</span>
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                        </div>
                      );
                    })()}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {challenge.gpxUrl ? <Badge variant="outline" className="rounded-full px-3 py-1">GPX</Badge> : null}
                      {challenge.isCrossword ? <Badge variant="outline" className="rounded-full px-3 py-1">Tajenka</Badge> : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Peaks (default) — detail nahrazuje seznam
    if (selectedPeak) return renderPeakDetail();
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-500">
            <input type="checkbox" checked={filterByMapBounds} onChange={(e) => setFilterByMapBounds(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
            Filtrovat podle mapy
          </label>
          <button
            type="button"
            onClick={() => void loadUserAscents(false)}
            disabled={ascentsLoading}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-950 disabled:opacity-50"
            title={userAscents.size > 0 ? `Načteno ${userAscents.size} výstupů` : "Načíst moje výstupy z hory.app"}
          >
            {ascentsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={cn("h-2 w-2 rounded-full", userAscents.size > 0 ? "bg-amber-400" : "bg-zinc-300")} />}
            {userAscents.size > 0 ? `${userAscents.size} výstupů` : "Výstupy"}
          </button>
        </div>
        {renderPeaksSidebar()}
      </div>
    );
  }

  if (!isAuthenticated) {
    return renderLoginScreen();
  }

  return (
    <main className="flex h-screen overflow-hidden bg-zinc-100 text-zinc-950">
      {/* LEFT: Collapsible nested sidebars */}
      <aside className="flex shrink-0 border-r border-zinc-200 bg-white shadow-[20px_0_60px_rgba(15,23,42,0.05)]">
        {/* Rail */}
        <div className="flex w-16 flex-col items-center border-r border-zinc-200 bg-white">
          <div className="flex h-16 w-full items-center justify-center border-b border-zinc-200">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Mountain className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center gap-2 py-3">
            {/* Route planning — global, above modules */}
            <button
              type="button"
              onClick={() => { setActiveModule("routes"); setIsModulePanelOpen(true); }}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl border transition",
                activeModule === "routes"
                  ? "border-zinc-900 bg-zinc-950 text-white"
                  : "border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
              )}
              title="Plánování tras"
            >
              <Route className="h-5 w-5" />
            </button>
            <div className="my-1 h-px w-6 bg-zinc-200" />
            {moduleItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActiveModule(item.key);
                  setIsModulePanelOpen(true);
                }}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl border transition",
                  activeModule === item.key
                    ? "border-zinc-900 bg-zinc-950 text-white"
                    : "border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                )}
                title={item.label}
              >
                {item.icon}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2 border-t border-zinc-200 py-3">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent text-zinc-400 transition hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
              title="Nastavení"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Panel */}
        <div
          className={cn(
            "flex h-full flex-col border-r border-transparent bg-white transition-[width] duration-200 ease-out",
            isModulePanelOpen ? "w-[300px]" : "w-0"
          )}
        >
          <div className={cn("flex h-full flex-col", !isModulePanelOpen && "invisible")}>
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">{activeModule === "routes" ? "Nástroj" : "Modul"}</p>
                <p className="text-sm font-semibold text-zinc-900">{activeModule === "routes" ? "Plánování tras" : "Hory"}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModulePanelOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-900"
                title="Skrýt panel"
              >
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col border-t border-zinc-200">
              {activeModule === "routes" && (
                <ScrollArea className="flex-1">
                  <div className="px-4 py-4">
                    {statusMessage && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-zinc-700">{statusMessage}</div>}
                    <div className="space-y-6">
                      {renderRoutesSidebar()}
                      {routePlans.length > 0 && (
                        <div className="space-y-4">
                          <MetricCard label="Nalezené trasy" value={routePlans.length} hint={routeInfo || undefined} />
                          {routePlans.map((route) => {
                            const routePeaks = ensureArray<{ name: string }>(route.peaks);
                            return (
                              <Card key={route.id} className="rounded-3xl border-zinc-200 bg-zinc-50/70 shadow-none">
                                <CardContent className="space-y-3 p-5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <h3 className="font-semibold text-zinc-950">{route.title}</h3>
                                      <p className="mt-1 text-sm text-zinc-500">
                                        {route.distanceKm.toFixed(1)} km • {Math.round(route.durationMinutes / 60)} h {route.durationMinutes % 60} min • {route.ascentMeters} m
                                      </p>
                                    </div>
                                    <Badge variant="secondary" className="rounded-full px-3 py-1">{routePeaks.length} vrcholů</Badge>
                                  </div>
                                  <p className="text-sm leading-6 text-zinc-600">{routePeaks.map((p) => p.name).join(", ")}</p>
                                  <a href={route.mapyCzUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100">
                                    Otevřít na Mapy.cz
                                  </a>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              )}
              {activeModule === "hory" && (
                <>
                  <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 px-3 py-2">
                    {navItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveSection(item.key)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                          activeSection === item.key ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-700"
                        )}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="px-4 py-4">
                      {statusMessage && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-zinc-700">{statusMessage}</div>}
                      {renderHoryContent()}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>

          </div>
        </div>
      </aside>

      {/* CENTER: Map panel */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div ref={areaSelectMapContainerRef} className="absolute inset-0 app-map" />
      </div>

      {/* RIGHT: AI assistant */}
      <aside className="flex w-[420px] shrink-0 flex-col border-l border-zinc-200 bg-white shadow-[-20px_0_60px_rgba(15,23,42,0.05)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">AI asistent</p>
            <p className="text-xs text-zinc-400">Plánování výletů a tras</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1 px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 pt-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
                  <Sparkles className="h-5 w-5 text-zinc-400" />
                </div>
                <p className="text-sm font-medium text-zinc-700">Plánuj výlet s AI asistentem</p>
                <p className="text-xs text-zinc-400">Např.: „Naplánuj okruh 10 km z Prahy do hodiny jízdy autem"</p>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  {(m.role === "user" || m.role === "assistant") && (
                    <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6", m.role === "user" ? "rounded-br-sm bg-zinc-950 text-white" : "rounded-bl-sm bg-zinc-100 text-zinc-800")}>
                      {typeof m.content === "string" ? (
                        m.role === "assistant" ? (
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              ul: ({ children }) => <ul className="my-1 space-y-0.5 pl-4 list-disc">{children}</ul>,
                              ol: ({ children }) => <ol className="my-1 space-y-0.5 pl-4 list-decimal">{children}</ol>,
                              li: ({ children }) => <li className="leading-6">{children}</li>,
                              a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 opacity-80 hover:opacity-100">{children}</a>,
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        ) : m.content
                      ) : null}
                      {m.toolInvocations?.map((inv) =>
                        "result" in inv && inv.toolName === "showPointsOnMap" ? (
                          <p key={inv.toolCallId} className="mt-1 text-xs opacity-70">
                            📍 Zobrazeno {((inv.result as { points: unknown[] }).points ?? []).length} bodů na mapě
                          </p>
                        ) : "result" in inv && inv.toolName === "planRoute" && !(inv.result as { error?: string }).error ? (
                          <p key={inv.toolCallId} className="mt-1 text-xs opacity-70">
                            🗺 {(inv.result as { summary?: string }).summary}
                          </p>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-zinc-200 p-4">
            <div className="flex gap-2">
              <Input value={input} onChange={handleInputChange} placeholder="Naplánuj výlet..." className="flex-1 rounded-2xl" disabled={chatLoading} />
              <Button type="submit" className="rounded-2xl" disabled={chatLoading || !input.trim()}>
                {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>
      </aside>

      {showSettings && (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="relative w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Nastavení</h2>
              <button type="button" onClick={() => setShowSettings(false)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="space-y-6">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Obecné</p>
                <div className="mt-3 space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700">Podklad mapy</label>
                  <select value={baseMap} onChange={(e) => setBaseMap(e.target.value as typeof baseMap)} className="flex h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none">
                    <option value="mapycz-outdoor">Vektory – Turistická (OpenFreeMap)</option>
                    <option value="mapycz-warm">Vektory – Zemité tóny (OpenFreeMap)</option>
                    <option value="mapycz-basic">Rastr – Mapy.cz Základní</option>
                    <option value="osm">Rastr – OpenStreetMap</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Modul Hory</p>
                <div className="mt-3 space-y-2">
                  <Button type="button" variant="outline" className="w-full justify-center rounded-2xl" onClick={() => loadRangesAndAreas(true, hasStoredCredentials)}>
                    {rangesLoading || areasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapIcon className="h-4 w-4" />}
                    Načíst oblasti
                  </Button>
                  {COUNTRY_CONFIG.map((country) => (
                    <Button key={country.code} type="button" variant="outline" className="w-full justify-center rounded-2xl" onClick={() => handleDownloadPeaksForCountry(country.code)}>
                      {countryDownloadLoading[country.code] ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}
                      Načíst vrcholy {country.name}
                    </Button>
                  ))}
                  <Button type="button" variant="outline" className="w-full justify-center rounded-2xl" onClick={handleDownloadChallenges}>
                    {challengesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                    Načíst výzvy
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
