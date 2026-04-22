"use client";

import { useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const emailPasswordSchema = z.object({
  email: z.string().email("Zadej platný e-mail."),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků."),
});

const registerSchema = emailPasswordSchema.extend({
  name: z.string().min(1, "Jméno je povinné."),
});

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoginSuccess?: () => void;
}

type Mode = "login" | "register";

export function AuthModal({ open, onOpenChange, onLoginSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setName(""); setEmail(""); setPassword(""); setError(null);
  }

  function switchMode(next: Mode) {
    resetForm(); setMode(next);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = emailPasswordSchema.safeParse({ email, password });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setLoading(true);
    const { error: err } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (err) { setError(err.message ?? "Přihlášení se nezdařilo."); return; }
    onOpenChange(false);
    onLoginSuccess?.();
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = registerSchema.safeParse({ name, email, password });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setLoading(true);
    const { error: err } = await authClient.signUp.email({ name, email, password });
    setLoading(false);
    if (err) { setError(err.message ?? "Registrace se nezdařila."); return; }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) resetForm(); onOpenChange(next); }}>
      <DialogContent className="max-w-sm rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-950">
            {mode === "login" ? "Přihlášení" : "Registrace"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1 flex gap-2 border-b border-zinc-100 pb-4">
          <button type="button" onClick={() => switchMode("login")} className={`text-sm font-medium px-3 py-1 rounded-xl transition ${mode === "login" ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}`}>Přihlásit se</button>
          <button type="button" onClick={() => switchMode("register")} className={`text-sm font-medium px-3 py-1 rounded-xl transition ${mode === "register" ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}`}>Registrovat se</button>
        </div>
        <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4 pt-2">
          {mode === "register" && (
            <div className="space-y-1">
              <Label htmlFor="auth-name">Jméno</Label>
              <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="auth-email">E-mail</Label>
            <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="auth-password">Heslo</Label>
            <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Přihlásit se" : "Registrovat se"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
