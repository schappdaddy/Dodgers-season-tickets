"use client";

import React, { useEffect, useState } from "react";
import { Request } from "@/lib/types";
import { formatLA, money } from "@/lib/utils";

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

export default function AdminRequestsPage() {
  const [rows, setRows] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState("");

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

  if (loading) return <div className="py-20 text-center text-zinc-400 text-sm">Loading requests…</div>;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Requests</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{rows.length} total friend requests</p>
      </div>

      {rows.length === 0 && (
        <div className="text-center py-12 text-zinc-400 text-sm">No requests yet</div>
      )}

      <div className="grid gap-4">
        {rows.map(r => {
          const game = r.games;
          return (
            <div key={r.id} className="bg-white rounded-2xl border shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-zinc-900">
                    {game ? `Dodgers vs ${game.opponent}` : "Game"}
                  </div>
                  {game?.game_datetime && (
                    <div className="text-sm text-zinc-500">
                      {formatLA(game.game_datetime)}{game.seat_info ? ` · ${game.seat_info}` : ""}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`text-xs px-2.5 py-1 rounded-full ${statusColor(r.status)}`}>
                    {r.status}
                  </span>
                  <span className="text-xs text-zinc-400 border border-zinc-200 px-2 py-0.5 rounded-full">
                    {r.purpose}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-50 rounded-xl p-3 mb-3 text-sm grid gap-1">
                <div>
                  <span className="text-zinc-500">Friend:</span>{" "}
                  <span className="font-medium">{r.friend_name}</span>
                  {r.friend_contact && <span className="text-zinc-400"> · {r.friend_contact}</span>}
                </div>
                <div>
                  <span className="text-zinc-500">Amount due:</span>{" "}
                  <span className="font-medium">{r.amount_due ? money(r.amount_due) : "—"}</span>
                  {r.amount_paid && (
                    <span className="text-emerald-600 ml-2">Paid: {money(r.amount_paid)}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
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
          );
        })}
      </div>

      {markPaidId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-1">Mark Request Paid</h3>
            <p className="text-sm text-zinc-500 mb-4">Enter amount received via Venmo</p>
            <label className="text-sm font-medium text-zinc-700">Amount paid</label>
            <input
              type="number" step="0.01"
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
    </div>
  );
}
