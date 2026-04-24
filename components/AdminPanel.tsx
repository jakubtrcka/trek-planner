"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Mountain, Trophy, MapPinned, Castle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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

function HoryCredentialsForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/hory-credentials")
      .then((r) => r.json())
      .then((data: { username: string | null; password: string | null }) => {
        if (data.username) setUsername(data.username);
        if (data.password) setPassword(data.password);
      })
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState("loading");
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/hory-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSaveState("success");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Neočekávaná chyba");
      setSaveState("error");
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-2">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Hory.app přihlášení</p>
      <div className="space-y-1">
        <Label htmlFor="hory-username" className="text-xs">Uživatelské jméno</Label>
        <Input
          id="hory-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          className="h-8 text-sm rounded-xl"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="hory-password" className="text-xs">Heslo</Label>
        <Input
          id="hory-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="h-8 text-sm rounded-xl"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        className="w-full justify-center rounded-2xl"
        disabled={saveState === "loading" || !username || !password}
      >
        {saveState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Uložit přihlašovací údaje
        {saveState === "success" && <span className="ml-auto text-xs text-emerald-600">Uloženo</span>}
        {saveState === "error" && <span className="ml-auto text-xs text-red-500">Chyba</span>}
      </Button>
      {saveError && <p className="text-xs text-red-500 px-1">{saveError}</p>}
    </form>
  );
}

export function AdminPanel() {
  const [states, setStates] = useState<ActionStates>({ peaks: "idle", challenges: "idle", areas: "idle", castles: "idle" });
  const [errors, setErrors] = useState<ActionErrors>({});
  const peaksCountRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (states.peaks !== "background") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/peaks?country=cz");
        if (!res.ok) return;
        const data = await res.json() as { count: number };
        if (peaksCountRef.current === null) { peaksCountRef.current = data.count; return; }
        if (data.count > peaksCountRef.current) {
          setStates((prev) => ({ ...prev, peaks: "success" }));
          peaksCountRef.current = null;
        }
      } catch { /* ignore */ }
    }, 10_000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [states.peaks]);

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
      <HoryCredentialsForm />
      <hr className="border-zinc-200" />
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
