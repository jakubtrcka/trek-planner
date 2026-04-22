import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "../../../lib/auth";
import { AdminPanel } from "../../../components/AdminPanel";
import { UserSettingsPanel } from "../../../components/UserSettingsPanel";

function isAdmin(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  return adminEmails.includes(email);
}

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  const admin = isAdmin(session.user.email);

  return (
    <main className="flex min-h-screen flex-col items-center justify-start bg-zinc-50 p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Nastavení</h1>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">← Zpět na mapu</Link>
        </div>
        <UserSettingsPanel />
        {admin && (
          <div className="mt-8">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Admin</p>
            <AdminPanel />
          </div>
        )}
      </div>
    </main>
  );
}
