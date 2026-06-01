"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, DollarSign, Target, Activity, RefreshCw, Sparkles, Zap } from "lucide-react";
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

type Recommendation = {
  id: string;
  game_id: string;
  recommended_price: number;
  price_low: number;
  price_high: number;
  confidence: string;
  reasoning: string;
  action: string;
  factors: {
    team_form: string;
    opponent_demand: string;
    supply: string;
    timing: string;
    seat_premium: string;
  };
  data_source: string;
  market_avg: number | null;
  market_listings: number | null;
  generated_at: string;
  games: {
    opponent: string;
    game_datetime: string;
    tier: string;
    purchase_cost: number | null;
    suggested_price: number | null;
    floor_price: number | null;
  };
};

type Alert = {
  type: "danger" | "warning" | "info" | "ok";
  game: Game;
  message: string;
  action: string;
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors = {
    high: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-zinc-100 text-zinc-600",
  }[confidence] || "bg-zinc-100 text-zinc-600";
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors}`}>{confidence} confidence</span>;
}

function DataSourceBadge({ source }: { source: string }) {
  if (source === "seatgeek_ai") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
        <Zap className="h-3 w-3" /> SeatGeek + AI
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
      <Sparkles className="h-3 w-3" /> AI Only
    </span>
  );
}

export default function AdminDashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsRefreshing, setRecsRefreshing] = useState(false);
  const [recsError, setRecsError] = useState("");
  const [reporting, setReporting] = useState<any>(null);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);

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

  async function loadRecommendations() {
    setRecsLoading(true);
    try {
      const res = await fetch("/api/admin/pricing-recommendations", { cache: "no-store" });
      const body = await res.json();
      setRecommendations(Array.isArray(body?.recommendations) ? body.recommendations : []);
    } catch {}
    setRecsLoading(false);
  }

async function refreshRecommendations() {
    setRecsRefreshing(true);
    setRecsError("");
    try {
      // Step 1: get list of games to process
      const listRes = await fetch("/api/admin/pricing-recommendations/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const listBody = await listRes.json();
      const gamesList: { id: string; opponent: string }[] = listBody?.games || [];

      if (gamesList.length === 0) {
        setRecsError("No upcoming sell games found");
        setRecsRefreshing(false);
        return;
      }

      // Step 2: process each game individually
      for (let i = 0; i < gamesList.length; i++) {
        const game = gamesList[i];
        try {
          const res = await fetch("/api/admin/pricing-recommendations/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameId: game.id }),
          });
          const body = await res.json();
          if (!body.ok) {
            console.warn(`Failed for ${game.opponent}:`, body.error);
          }
        } catch (err) {
          console.warn(`Error processing ${game.opponent}:`, err);
        }
        // Reload after each game so recommendations appear progressively
        await loadRecommendations();
        // Wait 15 seconds between calls to avoid rate limits
        if (i < gamesList.length - 1) {
          await new Promise(r => setTimeout(r, 15000));
        }
      }
    } catch (e: any) {
      setRecsError(e?.message || "Failed to refresh recommendations");
    }
    setRecsRefreshing(false);
  }

  useEffect(() => {
    loadGames();
    loadReporting();
    loadRecommendations();
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
      const floorPrice = g.floor_price || (g.tier === "premium" ? 150 : g.tier === "mid" ? 130 : 110);

      if (days <= 3 && !hasActiveListing && g.status === "available") {
        result.push({ type: "danger", game: g, message: `${g.opponent} — ${days === 0 ? "TODAY" : `${days}d`} · unsold`, action: "Switch to smart pricing or drop price now" });
      } else if (days <= 7 && !hasActiveListing && g.status === "available") {
        result.push({ type: "warning", game: g, message: `${g.opponent} — ${days}d out, not listed`, action: `List now at suggested $${g.suggested_price || "—"}/ea` });
      }
    }
    return result.sort((a, b) => {
      const order = { danger: 0, warning: 1, info: 2, ok: 3 };
      return order[a.type] - order[b.type];
    }).slice(0, 8);
  }, [games]);

  const upcomingSell = useMemo(() => {
    return games
      .filter(g => g.disposition === "sell" && daysUntil(g.game_datetime) >= 0 && daysUntil(g.game_datetime) <= 45)
      .sort((a, b) => new Date(a.game_datetime).getTime() - new Date(b.game_datetime).getTime())
      .slice(0, 8);
  }, [games]);

  // Map recommendations by game_id for easy lookup
  const recsByGameId = useMemo(() => {
    const map: Record<string, Recommendation> = {};
    for (const r of recommendations) map[r.game_id] = r;
    return map;
  }, [recommendations]);

  const lastUpdated = useMemo(() => {
    if (recommendations.length === 0) return null;
    const latest = recommendations.reduce((a, b) =>
      new Date(a.generated_at) > new Date(b.generated_at) ? a : b
    );
    return new Date(latest.generated_at).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }, [recommendations]);

  if (loading) return <div className="py-20 text-center text-zinc-400 text-sm">Loading dashboard…</div>;

  const progressPct = Math.min(100, (metrics.soldNet / RECOVERY_GOAL) * 100);

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Season 2026 · Section 128LG Row L · 31 games</p>
        </div>
        <button onClick={() => { loadGames(); loadReporting(); loadRecommendations(); }}
          className="flex items-center gap-1.5 text-sm text-zinc-500 border rounded-xl px-3 py-2 hover:bg-zinc-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Financial metrics */}
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

      {/* Progress bar */}
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

      {/* Sunday checklist */}
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

      {/* SeatGeek + AI Pricing */}
      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-zinc-900">SeatGeek + AI Pricing</h2>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Section 128LG specific
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {lastUpdated ? `Last updated ${lastUpdated}` : "No recommendations yet — click refresh to generate"}
            </p>
          </div>
          <button
            onClick={refreshRecommendations}
            disabled={recsRefreshing}
            className="flex items-center gap-1.5 text-sm bg-[#005A9C] text-white px-3 py-2 rounded-xl hover:bg-[#0C2340] disabled:opacity-50 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${recsRefreshing ? "animate-spin" : ""}`} />
            {recsRefreshing ? "Analyzing…" : "Refresh AI Pricing"}
          </button>
        </div>

        {recsError && (
          <div className="p-4 bg-red-50 border-b text-sm text-red-600">{recsError}</div>
        )}

        {recsRefreshing && (
          <div className="p-6 text-center">
            <div className="text-sm text-zinc-500 mb-1">Researching current market conditions…</div>
            <div className="text-xs text-zinc-400">Web searching Loge seat prices, team form, and demand signals. This takes 30-60 seconds.</div>
          </div>
        )}

        {!recsRefreshing && (
          <div className="divide-y">
            {recsLoading && <div className="p-5 text-sm text-zinc-400 text-center">Loading recommendations…</div>}

            {!recsLoading && upcomingSell.length === 0 && (
              <div className="p-5 text-sm text-zinc-400 text-center">No upcoming sell games in next 45 days</div>
            )}

            {!recsLoading && upcomingSell.map(g => {
              const rec = recsByGameId[g.id];
              const days = daysUntil(g.game_datetime);
              const isExpanded = expandedRec === g.id;
              const tierColors: Record<string, string> = {
                premium: "bg-red-100 text-red-700",
                mid: "bg-amber-100 text-amber-700",
                low: "bg-zinc-100 text-zinc-600"
              };

              return (
                <div key={g.id}>
                  <button
                    onClick={() => setExpandedRec(isExpanded ? null : g.id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-zinc-50 transition-colors">
                    {/* Days */}
                    <div className="w-10 text-center flex-shrink-0">
                      <div className={`text-sm font-bold ${days <= 3 ? "text-red-600" : days <= 7 ? "text-amber-600" : "text-zinc-700"}`}>{days}d</div>
                    </div>

                    {/* Game info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-zinc-800">vs {g.opponent}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${tierColors[g.tier]}`}>{g.tier}</span>
                        {rec && <DataSourceBadge source={rec.data_source} />}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">{formatDate(g.game_datetime)}</div>
                    </div>

                    {/* Price recommendation */}
                    <div className="text-right flex-shrink-0">
                      {rec ? (
                        <>
                          <div className="text-sm font-bold text-[#005A9C]">${rec.recommended_price}/ea</div>
                          <div className="text-xs text-zinc-400">${rec.price_low}–${rec.price_high} range</div>
                          <ConfidenceBadge confidence={rec.confidence} />
                        </>
                      ) : (
                        <div className="text-xs text-zinc-300">No recommendation yet</div>
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && rec && (
                    <div className="px-4 pb-4 border-t bg-zinc-50">
                      <div className="pt-3 grid gap-3">
                        {/* Action */}
                        <div className="bg-[#005A9C]/10 border border-[#005A9C]/20 rounded-xl p-3">
                          <div className="text-xs font-semibold text-[#005A9C] uppercase tracking-wide mb-1">Recommended Action</div>
                          <div className="text-sm font-medium text-zinc-800">{rec.action}</div>
                        </div>

                        {/* Reasoning */}
                        <div className="bg-white rounded-xl border p-3">
                          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Analysis</div>
                          <div className="text-sm text-zinc-700">{rec.reasoning}</div>
                        </div>

                        {/* Factors grid */}
                        {rec.factors && (
                          <div className="grid sm:grid-cols-2 gap-2">
                            {Object.entries(rec.factors).map(([key, value]) => (
                              <div key={key} className="bg-white rounded-xl border p-3">
                                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                                  {key.replace(/_/g, " ")}
                                </div>
                                <div className="text-xs text-zinc-600">{value as string}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Market data if available */}
                        {rec.market_avg && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                            Live market: {rec.market_listings} listings · avg ${rec.market_avg}/ea for comparable Loge sections
                          </div>
                        )}

                        {/* Price breakdown */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-white rounded-xl border p-3">
                            <div className="text-xs text-zinc-400 mb-1">Conservative</div>
                            <div className="text-lg font-bold text-zinc-700">${rec.price_low}</div>
                            <div className="text-xs text-zinc-400">Est. net {money(rec.price_low * 2 * 0.9)}</div>
                          </div>
                          <div className="bg-[#005A9C] rounded-xl p-3">
                            <div className="text-xs text-blue-200 mb-1">Recommended</div>
                            <div className="text-lg font-bold text-white">${rec.recommended_price}</div>
                            <div className="text-xs text-blue-200">Est. net {money(rec.recommended_price * 2 * 0.9)}</div>
                          </div>
                          <div className="bg-white rounded-xl border p-3">
                            <div className="text-xs text-zinc-400 mb-1">Aggressive</div>
                            <div className="text-lg font-bold text-zinc-700">${rec.price_high}</div>
                            <div className="text-xs text-zinc-400">Est. net {money(rec.price_high * 2 * 0.9)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming sell games quick view */}
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
            const rec = recsByGameId[g.id];
            const tierColors: Record<string, string> = {
              premium: "bg-red-100 text-red-700",
              mid: "bg-amber-100 text-amber-700",
              low: "bg-zinc-100 text-zinc-600"
            };
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
                    <div className="text-sm font-medium text-emerald-600">
                      Listed ${activeListing.listed_price ? activeListing.listed_price / 2 : "—"}/ea
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-400">Not listed</div>
                  )}
                  {rec && <div className="text-xs text-[#005A9C]">AI: ${rec.recommended_price}/ea</div>}
                </div>
              </div>
            );
          })}
          {upcomingSell.length === 0 && (
            <div className="p-5 text-sm text-zinc-400 text-center">No upcoming sell games in next 45 days</div>
          )}
        </div>
      </div>
    </div>
  );
}
