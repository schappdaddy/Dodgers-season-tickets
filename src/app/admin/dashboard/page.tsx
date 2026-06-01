"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, DollarSign, Target, Activity, RefreshCw } from "lucide-react";
import { Game, SEASON_COST, RECOVERY_GOAL } from "@/lib/types";
import { money, formatDate, daysUntil, calcNetProceeds } from "@/lib/utils";
import Link from "next/link";

type MarketRow = {
  gameId: string;
  opponent: string;
  avgPrice: number | null;
  lowestPrice: number | null;
  listingCount: number;
  error?: string;
};

type Alert = {
  type: "danger" | "warning" | "info" | "ok";
  game: Game;
  message: string;
  action: string;
};

export default function AdminDashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketData, setMarketData] = useState<Record<string, MarketRow>>({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [reporting, setReporting] = useState<any>(null);

  async function loadGames() {
    setLoading(true);
    const res = await fetch("/api/admin/games", { cache: "no-store" });
    const body = await res.json();
    setGames(Array.isArray(body?.games) ? body.games : []);
    setLoading(false);
  }

  async function loadReporting() {
    const res = await fetch("/api/admin/reporting", { cache: "no-store" });
    const body = await res.json();
    if (body?.ok) setReporting(body);
  }

  async function loadMarket() {
    setMarketLoading(true);
    try {
      const res = await fetch("/api/admin/seatgeek", { cache: "no-store" });
      const body = await res.json();
      if (body?.market) {
        const map: Record<string, MarketRow> = {};
        for (const row of body.market) map[row.gameId] = row;
        setMarketData(map);
      }
    } catch {}
    setMarketLoading(false);
  }

  useEffect(() => {
    loadGames();
    loadReporting();
    loadMarket();
  }, []);

  const metrics = useMemo(() => {
    const soldNet = reporting?.recoveryTotal || 0;
    const pct = soldNet / RECOVERY_GOAL;
    const remaining = Math.max(0, RECOVERY_GOAL - soldNet);
    const sellGames = games.filter(g => g.disposition === "sell");
    const projectedNet = sellGames.reduce((sum, g) => {
      const activeListings = g.active_listings || [];
      const activeListing = activeListings.find(l => l.status === "listed");
      const pricePerTicket = activeListing?.listed_price
        ? activeListing.listed_price / 2
        : (g.suggested_price || (g.tier === "premium" ? 185 : g.tier === "mid" ? 155 : 125));
      return sum + calcNetProceeds(pricePerTicket);
    }, 0);
    return { soldNet, pct, remaining, projectedNet, projectedTotal: soldNet + projectedNet };
  }, [reporting, games]);

  const alerts = useMemo((): Alert[] => {
    const result: Alert[] = [];
    for (const g of games) {
      if (g.disposition !== "sell") continue;
      const days = daysUntil(g.game_datetime);
      if (days < 0) continue;
      const activeListings = g.active_listings || [];
      const hasActiveListing = activeListings.some(l => l.status === "listed");
      const market = marketData[g.id];
      const floorPrice = g.floor_price || (g.tier === "premium" ? 150 : g.tier === "mid" ? 130 : 110);

      if (days <= 3 && !hasActiveListing && g.status === "available") {
        result.push({ type: "danger", game: g, message: `${g.opponent} — ${days === 0 ? "TODAY" : `${days}d`} · unsold`, action: "Switch to smart pricing or drop price now" });
      } else if (days <= 7 && !hasActiveListing && g.status === "available") {
        result.push({ type: "warning", game: g, message: `${g.opponent} — ${days}d out, not listed`, action: `List now at suggested $${g.suggested_price || "—"}/ea` });
      } else if (market?.avgPrice && market.avgPrice < floorPrice && hasActiveListing) {
        result.push({ type: "warning", game: g, message: `${g.opponent} — market avg $${market.avgPrice} below floor $${floorPrice}`, action: "Override smart pricing manually" });
      } else if (market?.avgPrice && hasActiveListing) {
        const activeListing = activeListings.find(l => l.status === "listed");
        const myPricePerTicket = activeListing?.listed_price ? activeListing.listed_price / 2 : null;
        if (myPricePerTicket && myPricePerTicket > market.avgPrice * 1.15 && days <= 14) {
          result.push({ type: "info", game: g, message: `${g.opponent} — listed 15%+ above market`, action: `Market avg $${market.avgPrice}/ea · consider dropping` });
        } else {
          result.push({ type: "ok", game: g, message: `${g.opponent} — listed, looking good`, action: `Market avg $${market.avgPrice}/ea` });
        }
      }
    }
    return result.sort((a, b) => {
      const order = { danger: 0, warning: 1, info: 2, ok: 3 };
      return order[a.type] - order[b.type];
    }).slice(0, 8);
  }, [games, marketData]);

  const upcomingSell = useMemo(() => {
    return games
      .filter(g => g.disposition === "sell" && daysUntil(g.game_datetime) >= 0 && daysUntil(g.game_datetime) <= 45)
      .sort((a, b) => new Date(a.game_datetime).getTime() - new Date(b.game_datetime).getTime())
      .slice(0, 8);
  }, [games]);

  if (loading) return <div className="py-20 text-center text-zinc-400 text-sm">Loading dashboard…</div>;

  const progressPct = Math.min(100, (metrics.soldNet / RECOVERY_GOAL) * 100);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Season 2026 · Section 128LG Row L · 31 games</p>
        </div>
        <button onClick={() => { loadGames(); loadReporting(); loadMarket(); }}
          className="flex items-center gap-1.5 text-sm text-zinc-500 border rounded-xl px-3 py-2 hover:bg-zinc-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-zinc-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Season Cost</span>
          </div>
          <div className="text-2xl font-bold text-zinc-900">{money(SEASON_COST)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">31 games · 60% goal</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-zinc-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">60% Goal</span>
          </div>
          <div className="text-2xl font-bold text-zinc-900">{money(RECOVERY_GOAL)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{money(metrics.remaining)} remaining</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Recouped</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{money(metrics.soldNet)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{(metrics.pct * 100).toFixed(1)}% of goal</div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-zinc-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Projected Total</span>
          </div>
          <div className={`text-2xl font-bold ${metrics.projectedTotal >= RECOVERY_GOAL ? "text-emerald-600" : "text-amber-600"}`}>
            {money(metrics.projectedTotal)}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {metrics.projectedTotal >= RECOVERY_GOAL
              ? `+${money(metrics.projectedTotal - RECOVERY_GOAL)} above goal`
              : `${money(RECOVERY_GOAL - metrics.projectedTotal)} short of goal`}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-5 shadow-sm">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-zinc-700">Progress to 60% goal</span>
          <span className="text-zinc-500">{money(metrics.soldNet)} / {money(RECOVERY_GOAL)}</span>
        </div>
        <div className="bg-zinc-100 rounded-full h-3 overflow-hidden">
          <div className="bg-gradient-to-r from-[#005A9C] to-[#0C2340] h-3 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-zinc-400 mt-1.5">
          <span>$0</span>
          <span>30% · {money(RECOVERY_GOAL * 0.5)}</span>
          <span>Goal · {money(RECOVERY_GOAL)}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border shadow-sm">
          <div className="flex items-center justify-between p-5 border-b">
            <div>
              <h2 className="font-semibold text-zinc-900">Sunday Checklist</h2>
              <p className="text-xs text-zinc-500 mt-0.5">{alerts.filter(a => a.type !== "ok").length} items need attention</p>
            </div>
            <Clock className="h-5 w-5 text-zinc-300" />
          </div>
          <div className="divide-y">
            {alerts.length === 0 && <div className="p-5 text-sm text-zinc-400 text-center">All good — nothing needs attention</div>}
            {alerts.map((alert, i) => {
              const colors = {
                danger: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700", sub: "text-red-500" },
                warning: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", sub: "text-amber-500" },
                info: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", sub: "text-blue-500" },
                ok: { dot: "bg-emerald-500", bg: "", text: "text-zinc-700", sub: "text-zinc-400" },
              }[alert.type];
              return (
                <div key={i} className={`flex gap-3 p-4 ${colors.bg}`}>
                  <div className={`w-2 h-2 rounded-full ${colors.dot} mt-1.5 flex-shrink-0`} />
                  <div>
                    <div className={`text-sm font-medium ${colors.text}`}>{alert.message}</div>
                    <div className={`text-xs mt-0.5 ${colors.sub}`}>{alert.action}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm">
          <div className="flex items-center justify-between p-5 border-b">
            <div>
              <h2 className="font-semibold text-zinc-900">SeatGeek Market Prices</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Live · Loge section comparables</p>
            </div>
            <button onClick={loadMarket} disabled={marketLoading}
              className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
              <RefreshCw className={`h-3.5 w-3.5 ${marketLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          <div className="divide-y">
            {marketLoading && <div className="p-5 text-sm text-zinc-400 text-center">Fetching market data…</div>}
            {!marketLoading && upcomingSell.slice(0, 6).map(g => {
              const market = marketData[g.id];
              const activeListings = g.active_listings || [];
              const activeListing = activeListings.find(l => l.status === "listed");
              const myPrice = activeListing?.listed_price ? activeListing.listed_price / 2 : null;
              const floorPrice = g.floor_price || (g.tier === "premium" ? 150 : g.tier === "mid" ? 130 : 110);
              let priceSignal: "good" | "high" | "low" | "unknown" = "unknown";
              if (market?.avgPrice && myPrice) {
                if (myPrice > market.avgPrice * 1.15) priceSignal = "high";
                else if (myPrice < floorPrice) priceSignal = "low";
                else priceSignal = "good";
              }
              return (
                <div key={g.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-medium text-zinc-800">vs {g.opponent}</div>
                    <div className="text-xs text-zinc-400">{formatDate(g.game_datetime)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {market?.avgPrice ? (
                      <>
                        <div className="text-right">
                          <div className="text-xs text-zinc-400">{market.listingCount} listings</div>
                          <div className="text-sm font-semibold text-blue-600">${market.avgPrice}/ea avg</div>
                        </div>
                        {priceSignal === "good" && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                        {priceSignal === "high" && <TrendingDown className="h-4 w-4 text-amber-500" />}
                        {priceSignal === "low" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </>
                    ) : (
                      <div className="text-xs text-zinc-300">{market?.error || "No data"}</div>
                    )}
                  </div>
                </div>
              );
            })}
            {!marketLoading && upcomingSell.length === 0 && (
              <div className="p-5 text-sm text-zinc-400 text-center">No upcoming sell games</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-zinc-900">Upcoming Sell Games</h2>
          <Link href="/admin/games" className="text-sm text-[#005A9C] hover:underline">View all →</Link>
        </div>
        <div className="divide-y">
          {upcomingSell.map(g => {
            const days = daysUntil(g.game_datetime);
            const activeListings = g.active_listings || [];
            const activeListing = activeListings.find(l => l.status === "listed");
            const market = marketData[g.id];
            const tierColors = { premium: "bg-red-100 text-red-700", mid: "bg-amber-100 text-amber-700", low: "bg-zinc-100 text-zinc-600" };
            return (
              <div key={g.id} className="flex items-center gap-4 p-4">
                <div className="w-12 text-center">
                  <div className={`text-sm font-bold ${days <= 3 ? "text-red-600" : days <= 7 ? "text-amber-600" : "text-zinc-700"}`}>{days}d</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-800">vs {g.opponent}</div>
                  <div className="text-xs text-zinc-400">{formatDate(g.game_datetime)}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${tierColors[g.tier]}`}>{g.tier}</span>
                <div className="text-right">
                  {activeListing ? (
                    <div className="text-sm font-medium text-emerald-600">Listed ${activeListing.listed_price ? activeListing.listed_price / 2 : "—"}/ea</div>
                  ) : (
                    <div className="text-sm text-zinc-400">Not listed</div>
                  )}
                  {market?.avgPrice && <div className="text-xs text-blue-500">Mkt ${market.avgPrice}/ea</div>}
                </div>
              </div>
            );
          })}
          {upcomingSell.length === 0 && <div className="p-5 text-sm text-zinc-400 text-center">No upcoming sell games in next 45 days</div>}
        </div>
      </div>
    </div>
  );
}
