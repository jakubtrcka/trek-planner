"use client";

import { Loader2, Mountain, Route, Target } from "lucide-react";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { HelpHint } from "./HelpHint";

interface LoginScreenProps {
  rangesLoading: boolean;
  areasLoading: boolean;
  statusMessage: string;
  infoMessage: string;
}

export function LoginScreen({
  rangesLoading, areasLoading,
  statusMessage, infoMessage,
}: LoginScreenProps) {
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
                  <HelpHint text="Přihlas se pro načtení vlastních výstupů a výzev." />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {rangesLoading || areasLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Načítám...
                </div>
              ) : null}
              {statusMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{statusMessage}</div>
              ) : null}
              {infoMessage && !statusMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{infoMessage}</div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
