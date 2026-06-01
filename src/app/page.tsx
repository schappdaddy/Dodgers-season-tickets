"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Download, Lock, AlertCircle } from "lucide-react";
import { Game } from "@/lib/types";
import { formatLA, makeICS, downloadFile, money } from "@/lib/utils";

function statusConfig(status: string, isListed: boolean) {
  if (isListed) return { label: "Listed Online — Act Fast", cls: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" };
  switch (status) {
    case "available": return { label: "Available", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
    case "pending":   return { label: "Pending", cls: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" };
    case "reserved":  return { label: "Taken", cls: "bg-zinc-100 text-zinc-600 border-zinc-200", dot: "bg-zinc-400" };
    default:          return { label: status, cls: "bg-zinc-100 text-zinc-600 border-zinc-200", dot: "bg-zinc-400" };
  }
}

function RequestForm({ game, onSubmit, onClose }: {
  game: Game;
  onSubmit: (g: Game, r: { name: string; contact: string; message: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !contact.trim()) return;
    setLoading(true);
    await onSubmit(game, { name: name.trim(), contact: contact.trim(), message: message.trim() });
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Request tickets</h2>
          <p className="text-sm text-zinc-500 mt-1">Dodgers vs {game.opponent} · {formatLA(game.game_datetime)}</p>
        </div>
        <div className="p-6 grid gap-4">
          <div>
            <label className="text-sm font-medium text-zinc-700">Your name *</label>
            <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex" />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Contact (email or phone) *</label>
            <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={contact} onChange={e => setContact(e.target.value)} placeholder="alex@email.com or (555) 555-5555" />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Message (optional)</label>
            <textarea className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Anything I should know?" />
          </div>
        </div>
        <div className="p-6 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
          <button onClick={handleSubmit} disabled={!name.trim() || !contact.trim() || loading}
            className="px-4 py-2 text-sm bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340] disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Sending…" : "Submit request"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [promoOnly, setPromoOnly] = useState(false);
  const
