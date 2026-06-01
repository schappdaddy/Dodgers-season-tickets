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
  const [requestGame, setRequestGame] = useState<Game | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/games", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const body = await res.json();
      setGames(Array.isArray(body?.games) ? body.games : []);
    } catch (e: any) { setError(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of games) c[g.status] = (c[g.status] || 0) + 1;
    return c;
  }, [games]);

  const friendGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .slice()
      .sort((a, b) => new Date(a.game_datetime).getTime() - new Date(b.game_datetime).getTime())
      .filter(g => {
        const matchQ = !q || `${g.opponent} ${formatLA(g.game_datetime)}`.toLowerCase().includes(q);
        const matchStatus = statusFilter === "all" || g.status === statusFilter;
        const matchPromo = !promoOnly || !!g.promotion_title;
        const show = g.disposition !== "keep";
        return matchQ && matchStatus && matchPromo && show;
      });
  }, [games, query, statusFilter, promoOnly]);

  async function handleRequest(game: Game, requester: { name: string; contact: string; message: string }) {
    const res = await fetch("/api/request-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id, friendName: requester.name, friendContact: requester.contact }),
    });
    if (res.status === 409) { alert("Sorry — this game was just taken."); return; }
    if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b?.message || "Request failed"); return; }
    alert("Request sent! I'll follow up for Venmo + ticket transfer.");
    setRequestGame(null);
    await load();
  }

  function handleICS(game: Game) {
    const start = new Date(game.game_datetime);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const ics = makeICS({
      title: `Dodgers vs ${game.opponent}`,
      description: `Dodgers season tickets\nSeats: ${game.seat_info || "2"}${game.price_total ? `\nPrice: $${game.price_total}` : ""}`,
      location: "Dodger Stadium, Los Angeles, CA",
      start, end,
      uid: `${game.id}-${Math.random().toString(16).slice(2)}@dodgers-tickets`,
    });
    downloadFile(`dodgers-${game.opponent.toLowerCase().replace(/\s/g, "-")}-${new Date(game.game_datetime).toISOString().slice(0, 10)}.ics`, ics);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0C2340] to-[#005A9C]">
      {/* Discreet admin link */}
      <div className="flex justify-end px-4 pt-3">
        <a href="/login" className="text-xs text-white/30 hover:text-white/60 transition-colors">
          Admin
        </a>
      </div>
      <div className="px-4 pt-6 pb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
            <span className="text-[#0C2340] font-bold text-sm">LA</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Dodgers 2026</h1>
        </div>
        <p className="text-blue-200 text-sm">Season tickets available for friends · Section 128LG Row L</p>
        <div className="flex justify-center gap-3 mt-4 flex-wrap">
          {[
            { label: "Available", key: "available", color: "bg-emerald-500" },
            { label: "Pending", key: "pending", color: "bg-amber-500" },
            { label: "Reserved", key: "reserved", color: "bg-zinc-400" },
          ].map(s => (
            <div key={s.key} className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
              <div className={`w-2 h-2 rounded-full ${s.color}`} />
              <span className="text-white text-xs">{s.label}: {counts[s.key] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-50 rounded-t-3xl min-h-screen">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-12">
          <div className="bg-white rounded-2xl border p-4 mb-4 shadow-sm">
            <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              placeholder="Search by opponent or date…" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="flex gap-2 flex-wrap items-center">
              {["all", "available", "pending", "reserved"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-[#005A9C] text-white border-[#005A9C]" : "text-zinc-500 border-zinc-200 hover:border-zinc-300"}`}>
                  {s === "all" ? "All games" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-xs text-zinc-500 ml-1 cursor-pointer">
                <input type="checkbox" checked={promoOnly} onChange={e => setPromoOnly(e.target.checked)} className="rounded" />
                🎁 Promo nights
              </label>
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-4 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold mb-2">How it works</h3>
            <div className="grid gap-1.5 text-xs text-zinc-500">
              <div className="flex gap-2"><span>1.</span><span>Find a game you want and click "Request this game"</span></div>
              <div className="flex gap-2"><span>2.</span><span>I'll confirm and send you a Venmo request</span></div>
              <div className="flex gap-2"><span>3.</span><span>Once paid, I'll transfer the tickets via SeatGeek</span></div>
              <div className="flex gap-2"><span className="text-red-500">⚡</span><span className="text-red-500">Games marked "Listed Online" may sell at any time — act fast!</span></div>
            </div>
          </div>

          {loading && <div className="text-center py-12 text-zinc-400 text-sm">Loading games…</div>}
          {!loading && error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />{error}
            </div>
          )}
          {!loading && !error && (
            <div className="grid gap-3">
              {friendGames.map(g => {
                const isAvailable = g.status === "available";
                const isListed = g.is_listed_online;
                const cfg = statusConfig(g.status, isListed);
                return (
                  <div key={g.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${!isAvailable ? "opacity-75" : ""}`}>
                    {isListed && (
                      <div className="bg-red-500 text-white text-xs font-medium px-4 py-1.5 flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" />
                        Listed on {g.listed_platforms.join(", ")} — could sell any time
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="font-semibold text-zinc-900">Dodgers vs {g.opponent}</div>
                          <div className="text-sm text-zinc-500 flex items-center gap-1.5 mt-0.5">
                            <Calendar className="h-3.5 w-3.5" />{formatLA(g.game_datetime)}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {g.seat_info || "2 seats"}{g.price_total ? ` · ${money(g.price_total)} for 2` : ""}
                          </div>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${cfg.cls}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1.5`} />
                          {cfg.label}
                        </span>
                      </div>
                      {g.promotion_title && (
                        <div className="flex items-center gap-1.5 mb-3">
                          <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5">
                            🎁 {g.promotion_title}
                          </span>
                          {g.promotion_description && <span className="text-xs text-zinc-400">{g.promotion_description}</span>}
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => isAvailable && setRequestGame(g)} disabled={!isAvailable}
                          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-medium transition-colors ${
                            isAvailable ? isListed ? "bg-red-500 hover:bg-red-600 text-white" : "bg-[#005A9C] hover:bg-[#0C2340] text-white"
                            : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
                          <Lock className="h-3.5 w-3.5" />
                          {isAvailable ? (isListed ? "Request now — act fast!" : "Request this game") : "Unavailable"}
                        </button>
                        <button onClick={() => handleICS(g)}
                          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border text-zinc-500 hover:bg-zinc-50 transition-colors">
                          <Download className="h-3.5 w-3.5" />Add to calendar
                        </button>
                      </div>
                      {!isAvailable && (
                        <p className="text-xs text-zinc-400 mt-2">This game is currently <b>{g.status}</b>. Requesting is disabled.</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {friendGames.length === 0 && <div className="text-center py-12 text-zinc-400 text-sm">No games match your filters.</div>}
            </div>
          )}
        </div>
      </div>
      {requestGame && <RequestForm game={requestGame} onSubmit={handleRequest} onClose={() => setRequestGame(null)} />}
    </div>
  );
}
