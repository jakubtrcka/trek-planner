"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "../lib/auth-client";
import { Button } from "./ui/button";
import { AuthModal } from "./AuthModal";

interface AppHeaderProps {
  onLoginSuccess?: () => void;
}

export function AppHeader({ onLoginSuccess }: AppHeaderProps) {
  const { data: session } = authClient.useSession();
  const [authOpen, setAuthOpen] = useState(false);

  async function handleSignOut() {
    await authClient.signOut();
  }

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-white">
        <span className="font-semibold text-zinc-900">Hory</span>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <span className="text-sm text-zinc-500">{session.user.email}</span>
              <Link href="/settings"><Button variant="ghost" size="sm">Nastavení</Button></Link>
              <Button variant="outline" size="sm" onClick={handleSignOut}>Odhlásit</Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setAuthOpen(true)}>Přihlásit se</Button>
          )}
        </div>
      </header>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} onLoginSuccess={onLoginSuccess} />
    </>
  );
}
