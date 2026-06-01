"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Game, Tier, Disposition, PLATFORMS } from "@/lib/types";
import { formatDate, money, toNumberOrNull, daysUntil, calcNetProceeds } from "@/lib/utils";

type MarketRow = { gameId: string; avgPrice: number | null; lowestPrice: number | null; listingCount: number; error?: string };

const TIER_COLORS: Record<Tier, string> = {
  premium: "bg-red-100 text-red-700 border-red-200",
  mid: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-zinc-100 text-zinc-600 border-zinc-200",
};
const DISPOSITION_COLORS: Record<Disposition, string> = {
  sell: "bg-blue-100 text-blue-700",
  keep: "bg-emerald-100 text-emerald-700",
  friends: "bg-purple-100 text-purple-700",
};

function GameCard({ g, market, onReload }: { g: Game; market: MarketRow | null; onReload: () => void }) {
  const [platform, setPlatform] = useState("SeatGeek");
  const [listedPrice, setListedPrice] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [listingNotes, setListingNotes] = useState("");
  const [netProceeds, setNetProceeds] = useState("");
  const [soldListingId, setSoldListingId] = useState("");
  const [showAddListing, setShowAddListing] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [promoTitle, setPromoTitle] = useState(g.promotion_title || "");
  const [promoDesc, setPromoDesc] = useState(g.promotion_description || "");
  const [showEditDisp, setShowEditDisp] = useState(false);
  const [editTier, setEditTier] = useState<Tier>(g.tier || "mid");
  const [editDisp, setEditDisp] = useState<Disposition>(g.disposition || "sell");
  const [editSuggested, setEditSuggested] = useState(g.suggested_price?.toString() || "");
  const [editFloor, setEditFloor] = useState(g.floor_price?.toString() || "");

  const activeListings = g.active_listings || [];
  const historyListings = (g.listings || []).filter(l => l.status !== "listed");
  const heldBy = (g.status === "pending" || g.status === "reserved") && g.active_request
    ? `${g.active_request.friend_name}${g.active_request.friend_contact ? ` · ${g.active_request.friend_contact}` : ""}`
    : null;

  const days = daysUntil(g.game_datetime);
  const urgencyColor = days <= 3 ? "text-red-600" : days <= 7 ? "text-amber-600" : "text-zinc-400";
  const floorPrice = g.floor_price || (g.tier === "premium" ? 150 : g.tier === "mid" ? 130 : 110);

  async function post(url: string, payload: any) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b?.message || "Request failed"); return false; }
    return true;
  }

  async function addListing() {
    const price = toNumberOrNull(listedPrice);
    const ok = await post("/api/admin/listings/create", {
      gameId: g.id, platform,
      listedPrice: price, listingUrl: listingUrl.trim() || null, notes: listingNotes.trim() || null,
    });
    if (ok) { setShowAddListing(false); setListedPrice(""); setListingUrl(""); setListingNotes(""); onReload(); }
  }

  async function markEnded(listingId: string) {
    await post("/api/admin/listings/update", { listingId, status: "ended" });
    onReload();
  }

  async function markSold() {
    const net = toNumberOrNull(netProceeds);
    await post("/api/admin/listings/update", { listingId: soldListingId, status: "sold", netProceeds: net });
    setShowSoldModal(false); onReload();
  }

  async function undoSold(listingId: string) {
    await post("/api/admin/listings/undo-sold", { listingId });
    onReload();
  }

  async function savePromo() {
    await post("/api/admin/games/update", { gameId: g.id, promotion_title: promoTitle.trim() || null, promotion_description: promoDesc.trim() || null });
    setShowPromo(false); onReload();
  }

  async function saveDisposition() {
    await post("/api/admin/games/update-disposition", {
      gameId: g.id, tier: editTier, disposition: editDisp,
      suggested_price: toNumberOrNull(editSuggested),
      floor_price: toNumberOrNull(editFloor),
    });
    setShowEditDisp(false); onReload();
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-zinc-900">vs {g.opponent}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${TIER_COLORS[g.tier || "mid"]}`}>{g.tier || "mid"}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${DISPOSITION_COLORS[g.disposition || "sell"]}`}>{g.disposition || "sell"}</span>
              {g.promotion_title && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🎁 {g.promotion_title}</span>}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
              <span className={urgencyColor}>{days < 0 ? "Past" : `${days}d away`}</span>
              <span>{formatDate(g.game_datetime)}</span>
              {g.seat_info && <span>{g.seat_info}</span>}
              {g.purchase_cost && <span>Cost: {money(g.purchase_cost)}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              g.status === "available" ? "bg-emerald-100 text-emerald-700"
              : g.status === "pending" ? "bg-amber-100 text-amber-700"
              : "bg-sky-100 text-sky-700"}`}>
              {g.status}
            </span>
            {g.is_listed_online && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                Listed: {g.listed_platforms.join(", ")}
              </span>
            )}
          </div>
        </div>
        {heldBy && <div className="mt-2 text-xs text-zinc-500"><b>Held by:</b> {heldBy}</div>}
        <div className="mt-3 flex items-center gap-4 flex-wrap text-xs text-zinc-500">
          {g.suggested_price && <span>Suggested: <b className="text-zinc-700">${g.suggested_price}/ea</b></span>}
          {g.floor_price && <span>Floor: <b className="text-zinc-700">${g.floor_price}/ea</b></span>}
          {g.suggested_price && <span>Est. net: <b className="text-emerald-600">{money(calcNetProceeds(g.suggested_price))}</b></span>}
          {market?.avgPrice && <span className="text-blue-600">Market avg: <b>${market.avgPrice}/ea</b> · {market.listingCount} listings</span>}
        </div>
      </div>

      {activeListings.length > 0 && (
        <div className="p-4 border-b bg-emerald-50">
          <div className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Active Listings</div>
          <div className="grid gap-2">
            {activeListings.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-emerald-200 p-3">
                <div className="text-sm">
                  <span className="font-medium">{l.platform}</span>
                  {l.listed_price && <span className="text-zinc-500"> · ${l.listed_price / 2}/ea · {money(l.listed_price)} pair</span>}
                  {l.listing_url && (
                    <a href={l.listing_url} target="_blank" rel="noreferrer"
                      className="ml-2 text-blue-500 hover:underline inline-flex items-center gap-0.5 text-xs">
                      <ExternalLink className="h-3 w-3" /> View listing
                    </a>
                  )}
                  {market?.avgPrice && l.listed_price && (
                    <span className={`ml-2 text-xs ${l.listed_price / 2 > market.avgPrice * 1.15 ? "text-amber-600" : l.listed_price / 2 < floorPrice ? "text-red-500" : "text-emerald-600"}`}>
                      {l.listed_price / 2 > market.avgPrice * 1.15 ? "↑ above market" : l.listed_price / 2 < floorPrice ? "⚠ below floor" : "✓ good price"}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => markEnded(l.id)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-zinc-50 text-zinc-600">End</button>
                  <button onClick={() => { setSoldListingId(l.id); setNetProceeds(""); setShowSoldModal(true); }}
                    className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Mark Sold</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {historyListings.length > 0 && (
        <div className="p-4 border-b">
          <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">History</div>
          <div className="grid gap-2">
            {historyListings.map(l => (
              <div key={l.id} className="text-xs text-zinc-600 bg-zinc-50 rounded-xl border p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{l.platform}</span>
                  <span className="capitalize text-zinc-400">{l.status}</span>
                  {l.listed_price && <span>Listed: ${l.listed_price / 2}/ea</span>}
                  {l.net_proceeds && <span className="text-emerald-600 font-medium">Net: {money(l.net_proceeds)}</span>}
                  {l.listing_url && <a href={l.listing_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline"><ExternalLink className="h-3 w-3" /></a>}
                </div>
                {l.status === "sold" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => { setSoldListingId(l.id); setNetProceeds(String(l.net_proceeds || "")); setShowSoldModal(true); }}
                      className="px-2.5 py-1 border rounded-lg text-zinc-500 hover:bg-zinc-100">Edit amount</button>
                    <button onClick={() => undoSold(l.id)}
                      className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100">Undo sale</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 flex flex-wrap gap-2">
        <button onClick={() => setShowAddListing(true)} disabled={g.status !== "available"}
          className="flex items-center gap-1.5 text-xs px-3 py-2 bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340] disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="h-3.5 w-3.5" /> Add Listing
        </button>
        <button onClick={() => setShowEditDisp(true)}
          className="text-xs px-3 py-2 border rounded-xl text-zinc-600 hover:bg-zinc-50">Edit Tier / Plan</button>
        <button onClick={() => { setPromoTitle(g.promotion_title || ""); setPromoDesc(g.promotion_description || ""); setShowPromo(true); }}
          className="text-xs px-3 py-2 border rounded-xl text-zinc-600 hover:bg-zinc-50">🎁 Promotion</button>
      </div>

      {showAddListing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold mb-4">Add Listing · vs {g.opponent}</h3>
            <div className="grid gap-3">
              <div>
                <label className="text-sm font-medium text-zinc-700">Platform</label>
                <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm" value={platform} onChange={e => setPlatform(e.target.value)}>
                  {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Listed price (pair total)</label>
                <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={listedPrice} onChange={e => setListedPrice(e.target.value)} placeholder="e.g. 340" />
                {listedPrice && <div className="text-xs text-zinc-400 mt-0.5">${Number(listedPrice) / 2}/ea · Est. net {money(Number(listedPrice) * 0.9)} after 10% fee</div>}
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Listing URL (optional)</label>
                <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={listingUrl} onChange={e => setListingUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Notes (optional)</label>
                <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={listingNotes} onChange={e => setListingNotes(e.target.value)} placeholder="e.g. 15% above market" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowAddListing(false)} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
              <button onClick={addListing} className="px-4 py-2 text-sm bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340]">Save Listing</button>
            </div>
          </div>
        </div>
      )}

      {showSoldModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-1">Mark Sold</h3>
            <p className="text-sm text-zinc-500 mb-4">Enter net proceeds after SeatGeek's fee</p>
            <label className="text-sm font-medium text-zinc-700">Net proceeds (what you receive)</label>
            <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={netProceeds} onChange={e => setNetProceeds(e.target.value)} placeholder="e.g. 306.00" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowSoldModal(false)} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
              <button onClick={markSold} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700">Save Sale</button>
            </div>
          </div>
        </div>
      )}

      {showEditDisp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-4">Edit Tier & Plan · vs {g.opponent}</h3>
            <div className="grid gap-3">
              <div>
                <label className="text-sm font-medium text-zinc-700">Tier</label>
                <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm" value={editTier} onChange={e => setEditTier(e.target.value as Tier)}>
                  <option value="premium">Premium (Giants, Padres, Phillies)</option>
                  <option value="mid">Mid (Angels, Orioles, Red Sox)</option>
                  <option value="low">Low (Rockies, Rays, Brewers)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Plan</label>
                <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm" value={editDisp} onChange={e => setEditDisp(e.target.value as Disposition)}>
                  <option value="sell">Sell on SeatGeek</option>
                  <option value="keep">Keep for myself</option>
                  <option value="friends">Offer to friends</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Suggested list price (per ticket)</label>
                <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                  value={editSuggested} onChange={e => setEditSuggested(e.target.value)} placeholder="e.g. 170" />
                {editSuggested && <div className="text-xs text-zinc-400 mt-0.5">Est. net: {money(Number(editSuggested) * 2 * 0.9)}</div>}
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Floor price (per ticket)</label>
                <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                  value={editFloor} onChange={e => setEditFloor(e.target.value)} placeholder="e.g. 150" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowEditDisp(false)} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
              <button onClick={saveDisposition} className="px-4 py-2 text-sm bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340]">Save</button>
            </div>
          </div>
        </div>
      )}

      {showPromo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-4">Edit Promotion · vs {g.opponent}</h3>
            <div className="grid gap-3">
              <div>
                <label className="text-sm font-medium text-zinc-700">Promotion title</label>
                <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                  value={promoTitle} onChange={e => setPromoTitle(e.target.value)} placeholder="e.g. Bobblehead Night" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Description</label>
                <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                  value={promoDesc} onChange={e => setPromoDesc(e.target.value)} placeholder="e.g. First 40,000 fans" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowPromo(false)} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
              <button onClick={savePromo} className="px-4 py-2 text-sm bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340]">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketData, setMarketData] = useState<Record<string, MarketRow>>({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [dispFilter, setDispFilter] = useState("all");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/games", { cache: "no-store" });
    const body = await res.json();
    setGames(Array.isArray(body?.games) ? body.games : []);
    setLoading(false);
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

  useEffect(() => { load(); loadMarket(); }, []);

  const sorted = useMemo(() =>
    games.slice().sort((a, b) => new Date(a.game_datetime).getTime() - new Date(b.game_datetime).getTime()),
    [games]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter(g => {
      const matchQ = !q || g.opponent.toLowerCase().includes(q);
      const matchStatus = filter === "all" || g.status === filter;
      const matchDisp = dispFilter === "all" || g.disposition === dispFilter;
      return matchQ && matchStatus && matchDisp;
    });
  }, [sorted, query, filter, dispFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: games.length };
    for (const g of games) {
      c[g.status] = (c[g.status] || 0) + 1;
      c[`d_${g.disposition}`] = (c[`d_${g.disposition}`] || 0) + 1;
    }
    return c;
  }, [games]);

  if (loading) return <div className="py-20 text-center text-zinc-400 text-sm">Loading games…</div>;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Games</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{games.length} total · manage listings, tiers, and pricing</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadMarket} disabled={marketLoading}
            className="flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 hover:bg-zinc-50 text-zinc-600">
            <RefreshCw className={`h-4 w-4 ${marketLoading ? "animate-spin" : ""}`} />
            {marketLoading ? "Fetching market…" : "Refresh market"}
          </button>
          <button onClick={load} className="flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 hover:bg-zinc-50 text-zinc-600">
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-4 shadow-sm">
        <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          placeholder="Search opponent…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="flex gap-2 flex-wrap mb-2">
          <span className="text-xs text-zinc-400 self-center mr-1">Status:</span>
          {[["all", "All"], ["available", "Available"], ["pending", "Pending"], ["reserved", "Reserved"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === v ? "bg-[#005A9C] text-white border-[#005A9C]" : "text-zinc-500 border-zinc-200 hover:border-zinc-300"}`}>
              {l} {v !== "all" && counts[v] ? `(${counts[v]})` : ""}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-zinc-400 self-center mr-1">Plan:</span>
          {[["all", "All"], ["sell", "Sell"], ["keep", "Keep"], ["friends", "Friends"]].map(([v, l]) => (
            <button key={v} onClick={() => setDispFilter(v)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${dispFilter === v ? "bg-[#005A9C] text-white border-[#005A9C]" : "text-zinc-500 border-zinc-200 hover:border-zinc-300"}`}>
              {l} {v !== "all" && counts[`d_${v}`] ? `(${counts[`d_${v}`]})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {filtered.map(g => (
          <GameCard key={g.id} g={g} market={marketData[g.id] || null} onReload={load} />
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-zinc-400 text-sm">No games match your filters</div>}
      </div>
    </div>
  );
}
