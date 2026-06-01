"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Request } from "@/lib/types";
import { formatLA, money } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

function statusColor(s: string) {
  switch (s) {
    case "requested": return "bg-amber-100 text-amber-700";
    case "confirmed": return "bg-sky-100 text-sky-700";
    case "paid": return "bg-violet-100 text-violet-700";
    case "tickets_sent": return "bg-emerald-100 text-emerald-700";
    case "cancelled": return "bg-zinc-100 text-zinc-500";
    default: return "bg-zinc-100 text-zinc-500";
  }
}

function purposeColor(p: string) {
  return p === "recovery" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700";
}

export default function AdminRequestsPage() {
  const [rows, setRows] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [editPaidId, setEditPaidId] = useState<string | null>(null);
  const [editPaidAmount, setEditPaidAmount] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/requests", { cache: "no-store" });
    const body = await res.json();
    setRows(Array.isArray(body?.requests) ? body.requests : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function post(url: string, payload: any) {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await load();
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => statusFilter === "all" || r.status === statusFilter);
  }, [rows, statusFilter]);

  if (loading) return <div className="py-20 text-center text-zinc-400 text-sm">Loading requests…</div>;

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Requests</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{rows.length} total friend requests</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "requested", label: "Requested", color: "bg-amber-50 border-amber-200 text-amber-700" },
          { key: "paid", label: "Paid", color: "bg-violet-50 border-violet-200 text-violet-700" },
          { key: "tickets_sent", label: "Tickets Sent", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
          { key: "all", label: "Total", color: "bg-zinc-50 border-zinc-200 text-zinc-700" },
        ].map(s => (
          <button key={s.key} onClick={() => setStatusFilter(s.key)}
            className={`rounded-2xl border p-3 text-left transition-all ${s.color} ${statusFilter === s.key ? "ring-2 ring-offset-1 ring-[#005A9C]" : ""}`}>
            <div className="text-2xl font-bold">{counts[s.key] || 0}</div>
            <div className="text-xs mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {["all", "requested", "confirmed", "paid", "tickets_sent", "cancelled"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-[#005A9C] text-white border-[#005A9C]" : "text-zinc-500 border-zinc-200 hover:border-zinc-300"}`}>
            {s === "all" ? "All" : s === "tickets_sent" ? "Tickets Sent" : s.charAt(0).toUpperCase() + s.slice(1)}
            {counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-400 text-sm">No requests match this filter</div>
      )}

      {/* Request rows */}
      <div className="grid gap-3">
        {filtered.map(r => {
          const game = r.games;
          const isExpanded = expanded.has(r.id);

          return (
            <div key={r.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              {/* Collapsed row - always visible */}
              <button onClick={() => toggleExpanded(r.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-900 text-sm">
                      {game ? `vs ${game.opponent}` : "Game"}
                    </span>
                    {game?.game_datetime && (
                      <span className="text-xs text-zinc-400">{formatLA(game.game_datetime)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm text-zinc-600 font-medium">{r.friend_name}</span>
                    {r.friend_contact && <span className="text-xs text-zinc-400">{r.friend_contact}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.amount_paid && (
                    <span className="text-sm font-semibold text-emerald-600">{money(r.amount_paid)}</span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-full ${statusColor(r.status)}`}>
                    {r.status === "tickets_sent" ? "Sent" : r.status}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t px-4 pb-4">
                  {/* Details */}
                  <div className="grid sm:grid-cols-3 gap-3 py-3 text-sm">
                    <div className="bg-zinc-50 rounded-xl p-3">
                      <div className="text-xs text-zinc-400 mb-0.5">Purpose</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${purposeColor(r.purpose)}`}>{r.purpose}</span>
                    </div>
                    <div className="bg-zinc-50 rounded-xl p-3">
                      <div className="text-xs text-zinc-400 mb-0.5">Amount Due</div>
                      <div className="font-medium">{r.amount_due ? money(r.amount_due) : "—"}</div>
                    </div>
                    <div className="bg-zinc-50 rounded-xl p-3">
                      <div className="text-xs text-zinc-400 mb-0.5">Amount Paid</div>
                      <div className={`font-medium ${r.amount_paid ? "text-emerald-600" : "text-zinc-400"}`}>
                        {r.amount_paid ? money(r.amount_paid) : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => post("/api/admin/requests/confirm", { gameId: r.game_id })}
                      disabled={!game || game.status !== "pending"}
                      className="text-xs px-3 py-2 bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340] disabled:opacity-40 disabled:cursor-not-allowed">
                      Confirm → Reserved
                    </button>
                    <button
                      onClick={() => { setMarkPaidId(r.id); setMarkPaidAmount(r.amount_due ? String(r.amount_due) : ""); }}
                      disabled={r.status === "paid" || r.status === "tickets_sent" || r.status === "cancelled"}
                      className="text-xs px-3 py-2 border rounded-xl text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      Mark Paid
                    </button>
                    <button
                      onClick={() => { setEditPaidId(r.id); setEditPaidAmount(r.amount_paid ? String(r.amount_paid) : ""); }}
                      disabled={r.status !== "paid" && r.status !== "tickets_sent"}
                      className="text-xs px-3 py-2 border rounded-xl text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      Edit Payment
                    </button>
                    <button
                      onClick={() => post("/api/admin/requests/mark-sent", { requestId: r.id })}
                      disabled={r.status !== "paid"}
                      className="text-xs px-3 py-2 border rounded-xl text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      Mark Tickets Sent
                    </button>
                    <button
                      onClick={() => post("/api/admin/requests/cancel-release", { requestId: r.id, gameId: r.game_id })}
                      disabled={!game || (game.status !== "pending" && game.status !== "reserved")}
                      className="text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-xl hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed">
                      Cancel & Release
                    </button>
                    <select
                      value={r.purpose}
                      onChange={e => post("/api/admin/requests/set-purpose", { requestId: r.id, purpose: e.target.value })}
                      className="text-xs px-3 py-2 border rounded-xl text-zinc-600 bg-white">
                      <option value="recovery">recovery</option>
                      <option value="personal">personal</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mark Paid Modal */}
      {markPaidId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-1">Mark Request Paid</h3>
            <p className="text-sm text-zinc-500 mb-4">Enter amount received via Venmo</p>
            <label className="text-sm font-medium text-zinc-700">Amount paid</label>
            <input type="number" step="0.01"
              className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={markPaidAmount} onChange={e => setMarkPaidAmount(e.target.value)} />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setMarkPaidId(null)} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
              <button onClick={async () => {
                await post("/api/admin/requests/mark-paid", {
                  requestId: markPaidId,
                  amountPaid: markPaidAmount ? Number(markPaidAmount) : null,
                });
                setMarkPaidId(null);
              }} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700">
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editPaidId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-1">Edit Payment Amount</h3>
            <p className="text-sm text-zinc-500 mb-4">Correct the amount received via Venmo</p>
            <label className="text-sm font-medium text-zinc-700">Amount paid</label>
            <input type="number" step="0.01"
              className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={editPaidAmount} onChange={e => setEditPaidAmount(e.target.value)} />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setEditPaidId(null)} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
              <button onClick={async () => {
                await post("/api/admin/requests/mark-paid", {
                  requestId: editPaidId,
                  amountPaid: editPaidAmount ? Number(editPaidAmount) : null,
                });
                setEditPaidId(null);
              }} className="px-4 py-2 text-sm bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340]">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
