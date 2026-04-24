import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "../../../lib/auth";
import { isAdmin } from "../../../lib/db/admin";
import { AdminPanel } from "../../../components/AdminPanel";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/");

  const admin = await isAdmin(session.user.id);
  if (!admin) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-start bg-zinc-50 p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Admin</h1>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">← Zpět na mapu</Link>
        </div>
        <AdminPanel />
      </div>
    </main>
  );
}
