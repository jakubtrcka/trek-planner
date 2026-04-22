"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

type Fields = { horyUsername: string; horyPassword: string; mapyCzApiKey: string };

export default function SettingsPage() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [fields, setFields] = useState<Fields>({ horyUsername: "", horyPassword: "", mapyCzApiKey: "" });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!isPending && !session) router.push("/sign-in"); }, [session, isPending, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/user/settings?moduleSlug=mountains").then((r) => r.json())
      .then((d: { horyUsername: string | null; horyPassword: string | null; mapyCzApiKey: string | null }) => {
        setFields({ horyUsername: d.horyUsername ?? "", horyPassword: d.horyPassword ?? "", mapyCzApiKey: d.mapyCzApiKey ?? "" });
      });
  }, [session]);

  async function handleSave() {
    setLoading(true);
    setSaved(false);
    await fetch("/api/user/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleSlug: "mountains", ...fields }),
    });
    setSaved(true);
    setLoading(false);
  }

  function field(key: keyof Fields) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-xl font-semibold">Nastavení</h1>

      <section>
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Hory.app</h2>
        <div className="rounded-lg border divide-y">
          <div className="flex items-center gap-4 px-4 py-3">
            <label htmlFor="horyUsername" className="w-40 shrink-0 text-sm text-zinc-700">Uživatelské jméno</label>
            <Input id="horyUsername" value={fields.horyUsername} onChange={field("horyUsername")} placeholder="vas@email.cz" className="max-w-xs" />
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <label htmlFor="horyPassword" className="w-40 shrink-0 text-sm text-zinc-700">Heslo</label>
            <Input id="horyPassword" type="password" value={fields.horyPassword} onChange={field("horyPassword")} placeholder="••••••••" className="max-w-xs" />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Mapy.cz</h2>
        <div className="rounded-lg border divide-y">
          <div className="flex items-center gap-4 px-4 py-3">
            <label htmlFor="mapyCzApiKey" className="w-40 shrink-0 text-sm text-zinc-700">API klíč</label>
            <Input id="mapyCzApiKey" value={fields.mapyCzApiKey} onChange={field("mapyCzApiKey")} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="max-w-xs" />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={loading}>Uložit nastavení</Button>
        {saved && <span className="text-sm text-green-600">Uloženo.</span>}
      </div>
    </div>
  );
}
