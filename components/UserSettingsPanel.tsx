"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { useHoryCredentials } from "../hooks/useHoryCredentials";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { BaseMapType } from "../lib/page-config";

const BASE_MAP_KEY = "hory-basemap";

export function UserSettingsPanel() {
  const { data: session } = authClient.useSession();
  const isLoggedIn = Boolean(session?.user);
  const { credentials, hasStoredCredentials, status, validationError, saveCredentials, setField } = useHoryCredentials(isLoggedIn);

  const [baseMap, setBaseMap] = useState<BaseMapType>("mapycz-outdoor");
  useEffect(() => {
    const stored = localStorage.getItem(BASE_MAP_KEY) as BaseMapType | null;
    if (stored) setBaseMap(stored);
  }, []);

  function handleBaseMapChange(val: BaseMapType) {
    setBaseMap(val);
    localStorage.setItem(BASE_MAP_KEY, val);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Obecné</p>
        <div className="mt-3 space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">Podklad mapy</label>
          <select
            value={baseMap}
            onChange={(e) => handleBaseMapChange(e.target.value as BaseMapType)}
            className="flex h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none"
          >
            <option value="mapycz-outdoor">Vektory – Turistická (OpenFreeMap)</option>
            <option value="mapycz-warm">Vektory – Zemité tóny (OpenFreeMap)</option>
            <option value="mapycz-basic">Rastr – Mapy.cz Základní</option>
            <option value="osm">Rastr – OpenStreetMap</option>
          </select>
        </div>
      </div>

      {isLoggedIn && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Hory.app přihlášení</p>
            {hasStoredCredentials && <span className="text-xs text-emerald-600 font-medium">Uloženo</span>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hory-username">Uživatelské jméno</Label>
            <Input id="hory-username" value={credentials.horyUsername} onChange={setField("horyUsername")} placeholder="vas@email.cz" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hory-password">Heslo</Label>
            <Input id="hory-password" type="password" value={credentials.horyPassword} onChange={setField("horyPassword")} placeholder="••••••••" />
          </div>
          {validationError && <p className="text-sm text-red-500">{validationError}</p>}
          {status === "error" && <p className="text-sm text-red-500">Uložení selhalo, zkus to znovu.</p>}
          <Button type="button" variant="outline" className="w-full justify-center rounded-2xl" onClick={() => void saveCredentials()} disabled={status === "saving"}>
            {status === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === "saved" ? "Uloženo" : "Uložit přihlašovací údaje"}
          </Button>
        </div>
      )}
    </div>
  );
}
