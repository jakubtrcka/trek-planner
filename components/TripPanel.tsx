"use client";
import { useState } from "react";
import { ChevronUp, ChevronDown, Trash2, X } from "lucide-react";
import { useTrips } from "../hooks/useTrips";
import { useTripWaypoints } from "../hooks/useTripWaypoints";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Props = {
  activeTripId: number | null;
  onActiveTripChange: (id: number | null) => void;
  onTripDelete: () => void;
  onWaypointDelete: (tripId: number, waypointId: number) => Promise<void>;
  onWaypointReorder: (tripId: number, orderedIds: number[]) => Promise<void>;
};

export function TripPanel({ activeTripId, onActiveTripChange, onTripDelete, onWaypointDelete, onWaypointReorder }: Props) {
  const { trips, loading, createTrip, renameTrip, deleteTrip, refetch } = useTrips();
  const { waypoints, refetch: refetchWaypoints } = useTripWaypoints(activeTripId);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmWpDeleteId, setConfirmWpDeleteId] = useState<number | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const trip = await createTrip(newName.trim());
    setCreating(false);
    if (trip) { setNewName(""); onActiveTripChange(trip.id); }
  }

  async function handleAiSummary() {
    if (!activeTripId) return;
    setAiLoading(true); setAiStatus(null);
    try {
      const res = await fetch(`/api/trips/${activeTripId}/ai-summary`, { method: "POST" });
      const data = (await res.json()) as { summary?: string; error?: string };
      setAiStatus(data.summary ?? data.error ?? "Chyba");
      await refetch();
    } catch (err) {
      console.error("ai-summary failed", err);
      setAiStatus("Nepodařilo se vygenerovat souhrn");
    }
    finally { setAiLoading(false); }
  }

  function startEdit(id: number, name: string) { setEditingId(id); setEditValue(name); }

  async function commitEdit() {
    if (editingId === null) return;
    const trimmed = editValue.trim();
    if (trimmed) await renameTrip(editingId, trimmed);
    setEditingId(null);
  }

  function handleEditKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") void commitEdit();
    if (e.key === "Escape") setEditingId(null);
  }

  async function handleDelete(id: number) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    const ok = await deleteTrip(id);
    if (ok) { onActiveTripChange(null); onTripDelete(); }
    setConfirmDeleteId(null);
  }

  async function handleWaypointDelete(waypointId: number) {
    if (!activeTripId) return;
    if (confirmWpDeleteId !== waypointId) { setConfirmWpDeleteId(waypointId); return; }
    setConfirmWpDeleteId(null);
    await onWaypointDelete(activeTripId, waypointId);
    await refetchWaypoints();
  }

  async function handleWaypointMove(waypointId: number, direction: "up" | "down") {
    if (!activeTripId) return;
    const sorted = [...waypoints].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((w) => w.id === waypointId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx]!, reordered[idx]!];
    const orderedIds = reordered.map((w) => w.id);
    await onWaypointReorder(activeTripId, orderedIds);
    await refetchWaypoints();
  }

  const activeTrip = trips.find((t) => t.id === activeTripId);
  const sortedWaypoints = [...waypoints].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Název výletu" className="rounded-xl" />
        <Button type="submit" disabled={creating || !newName.trim()} className="rounded-xl shrink-0">Přidat</Button>
      </form>
      {loading && <p className="text-xs text-zinc-400">Načítám...</p>}
      <div className="space-y-2">
        {trips.map((trip) => (
          <Card key={trip.id} className={`rounded-2xl border cursor-pointer transition ${activeTripId === trip.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"}`} onClick={() => onActiveTripChange(activeTripId === trip.id ? null : trip.id)}>
            <CardContent className="px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {editingId === trip.id ? (
                    <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => void commitEdit()} onKeyDown={handleEditKey} onClick={(e) => e.stopPropagation()} className="h-7 rounded-lg text-sm" />
                  ) : (
                    <p className="text-sm font-medium text-zinc-900 truncate" onDoubleClick={(e) => { e.stopPropagation(); startEdit(trip.id, trip.name); }} title="Dvojklik pro přejmenování">{trip.name}</p>
                  )}
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); void handleDelete(trip.id); }} className={`shrink-0 rounded-lg p-1 transition ${confirmDeleteId === trip.id ? "text-red-600 bg-red-50" : "text-zinc-400 hover:text-red-500 hover:bg-red-50"}`} title={confirmDeleteId === trip.id ? "Klikni znovu pro potvrzení smazání" : "Smazat výlet"}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {activeTripId !== null && sortedWaypoints.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Waypointy</p>
          {sortedWaypoints.map((wp, idx) => (
            <div key={wp.id} className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2">
              <span className="text-xs text-zinc-400 w-4 shrink-0">{idx + 1}.</span>
              <p className="flex-1 min-w-0 text-xs text-zinc-800 truncate">{wp.name ?? "—"}</p>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => void handleWaypointMove(wp.id, "up")} disabled={idx === 0} className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" title="Přesunout nahoru"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void handleWaypointMove(wp.id, "down")} disabled={idx === sortedWaypoints.length - 1} className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" title="Přesunout dolů"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void handleWaypointDelete(wp.id)} className={`rounded p-0.5 transition ${confirmWpDeleteId === wp.id ? "text-red-600 bg-red-50" : "text-zinc-400 hover:text-red-500"}`} title={confirmWpDeleteId === wp.id ? "Klikni znovu pro potvrzení" : "Odebrat waypoint"}><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {activeTrip && (
        <div className="space-y-2">
          <Button onClick={handleAiSummary} disabled={aiLoading} className="w-full rounded-xl" variant="outline">
            {aiLoading ? "Generuji..." : "Vygenerovat AI souhrn"}
          </Button>
          <a href={`/api/trips/${activeTrip.id}/export`} download className="block w-full">
            <Button type="button" className="w-full rounded-xl" variant="outline">Exportovat GPX</Button>
          </a>
          {(aiStatus ?? activeTrip.aiSummary) && (
            <p className="rounded-xl bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">{aiStatus ?? activeTrip.aiSummary}</p>
          )}
        </div>
      )}
    </div>
  );
}
