"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "../../../lib/auth-client";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.signUp.email({ name, email, password, callbackURL: "/" });
    if (err) setError(err.message ?? "Registrace se nezdařila.");
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader><CardTitle>Registrace</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Jméno</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Heslo</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>Registrovat se</Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">Už máš účet?{" "}<Link href="/sign-in" className="text-zinc-900 underline">Přihlas se</Link></p>
      </CardContent>
    </Card>
  );
}
