"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SEASON_COST, RECOVERY_GOAL } from "@/lib/types";
import { money, formatDate } from "@/lib/utils";

export default function AdminReportingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reporting", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(body?.message || "Failed");
      setData(body);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-20 text-center text-zinc-400 text-sm">Loading reporting…</div>;

  const recoveryTotal = data?.recoveryTotal || 0;
  const personalTotal = data?.personalTotal || 0;
  const moneyPending = data?.moneyPending || 0;
  const moneyAvailable = data?.moneyStillAvailable || 0;
  const keptGames = data?.keptGames || [];
  const keptCost = data?.keptCost || 0;

  // Only recovery counts toward goal
  const pct = recoveryTotal / RECOVERY_GOAL;
  const progressPct = Math.min(100, pct * 100);
  const netCost = SEASON_COST - recoveryTotal;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Reporting</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Financial summary · Season 2026</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 hover:bg-zinc-50 text-zinc-600">
          <RefreshCw className="h-4 w-4" /> Reload
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Progress toward 60% goal — recovery only */}
      <div className="bg-white rounded-2xl border p-5 shadow-sm">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium">Progress to 60% recovery goal</span>
          <span className="text-zinc-500">{money(recoveryTotal)} / {money(RECOVERY_GOAL)}</span>
        </div>
        <div className="bg-zinc-100 rounded-full h-3 overflow-hidden mb-1.5">
          <div className="bg-gradient-to-r from-[#005A9C] to-[#0C2340] h-3 rounded-full transition-all"
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="text-xs text-zinc-400">
          {(pct * 100).toFixed(1)}% of goal · {money(Math.max(0, RECOVERY_GOAL - recoveryTotal))} remaining
        </div>
        <div className="text-xs text-zinc-400 mt-1">
          Recovery only (sales to friends + marketplace) · personal games excluded
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Season Cost</div>
          <div className="text-2xl font-bold text-zinc-900">{money(SEASON_COST)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">Total investment · 31 games</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Recovery Goal</div>
          <div className="text-2xl font-bold text-[#005A9C]">{money(RECOVERY_GOAL)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">60% of season cost</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Recovered</div>
          <div className="text-2xl font-bold text-emerald-600">{money(recoveryTotal)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">Sales + marketplace · counts toward goal</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Net Cost</div>
          <div className={`text-2xl font-bold ${netCost <= 0 ? "text-emerald-600" : "text-zinc-900"}`}>
            {money(netCost)}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">Season cost minus recovery</div>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Personal Games</div>
          <div className="text-2xl font-bold text-purple-600">{money(personalTotal)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">Games you attended · not counted toward goal</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Pending</div>
          <div className="text-2xl font-bold text-amber-600">{money(moneyPending)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">Friend requests not yet paid</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Still Available</div>
          <div className="text-2xl font-bold text-zinc-700">{money(moneyAvailable)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">Available games (friend price)</div>
        </div>
      </div>

      {/* Games you kept */}
      {keptGames.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm">
          <div className="p-5 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-zinc-900">Games You Kept</h2>
              <p className="text-xs text-zinc-500 mt-0.5">{keptGames.length} games · {money(keptCost)} total cost</p>
            </div>
            <span className="text-sm font-semibold text-purple-600">{money(keptCost / keptGames.length)}/game avg</span>
          </div>
          <div className="divide-y">
            {keptGames.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm font-medium text-zinc-800">vs {g.opponent}</div>
                  <div className="text-xs text-zinc-400">{formatDate(g.game_datetime)}</div>
                </div>
                <span className="text-sm text-zinc-600">{money(g.purchase_cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By friend — recovery only */}
      {data?.byFriend?.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm">
          <div className="p-5 border-b">
            <h2 className="font-semibold text-zinc-900">Recovery by Buyer</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Paid recovery requests grouped by name</p>
          </div>
          <div className="divide-y">
            {data.byFriend.map((r: any) => (
              <div key={r.friend_name} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-700">{r.friend_name}</span>
                <span className="text-sm font-semibold text-emerald-600">{money(r.total_paid)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
