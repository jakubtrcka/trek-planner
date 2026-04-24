"use client";

import { useState } from "react";
import { Loader2, Mountain, Trophy, MapPinned, Castle } from "lucide-react";
import { Button } from "./ui/button";

type ButtonState = "idle" | "loading" | "success" | "background" | "error";
type ActionKey = "peaks" | "challenges" | "areas" | "castles";

type ActionStates = Record<ActionKey, ButtonState>;
type ActionErrors = Partial<Record<ActionKey, string>>;

async function callEndpoint(url: string): Promise<"done" | "background"> {
  const res = await fetch(url, { method: "POST" });
  if (res.status === 202) return "background";
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return "done";
}

export function AdminPanel() {
  const [states, setStates] = useState<ActionStates>({ peaks: "idle", challenges: "idle", areas: "idle", castles: "idle" });
  const [errors, setErrors] = useState<ActionErrors>({});

  async function handleSync(key: ActionKey, url: string) {
    setStates((prev) => ({ ...prev, [key]: "loading" }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    try {
      const result = await callEndpoint(url);
      setStates((prev) => ({ ...prev, [key]: result === "background" ? "background" : "success" }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : "Neočekávaná chyba" }));
      setStates((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  const actions: Array<{ key: ActionKey; label: string; icon: React.ReactNode; url?: string }> = [
    { key: "peaks", label: "Sync Vrcholy", icon: <Mountain className="h-4 w-4" />, url: "/api/sync-peaks" },
    { key: "challenges", label: "Sync Výzvy", icon: <Trophy className="h-4 w-4" />, url: "/api/sync-challenges" },
    { key: "areas", label: "Sync Oblasti", icon: <MapPinned className="h-4 w-4" />, url: "/api/sync-areas" },
    { key: "castles", label: "Sync Zámky", icon: <Castle className="h-4 w-4" />, url: "/api/sync-castles" },
  ];

  return (
    <div className="space-y-3">
      {actions.map(({ key, label, icon, url }) => {
        const s = states[key];
        const isDisabled = !url || s === "loading";
        return (
          <div key={key} className="space-y-1">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center rounded-2xl"
              onClick={url ? () => void handleSync(key, url) : undefined}
              disabled={isDisabled}
              title={!url ? "Není implementováno" : undefined}
            >
              {s === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
              {label}
              {s === "success" && <span className="ml-auto text-xs text-emerald-600">OK</span>}
              {s === "background" && <span className="ml-auto text-xs text-blue-500">Běží…</span>}
              {s === "error" && <span className="ml-auto text-xs text-red-500">Chyba</span>}
              {!url && <span className="ml-auto text-xs text-zinc-400">Není implementováno</span>}
            </Button>
            {errors[key] && <p className="text-xs text-red-500 px-1">{errors[key]}</p>}
          </div>
        );
      })}
    </div>
  );
}
