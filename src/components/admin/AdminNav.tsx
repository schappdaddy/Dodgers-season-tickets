"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Upload, LogOut, Users, BarChart2, Ticket, LayoutDashboard, X } from "lucide-react";

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  return (
    <Link href={href} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors ${
      active ? "bg-white/20 text-white font-medium" : "text-blue-200 hover:text-white hover:bg-white/10"
    }`}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export default function AdminNav() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"manual" | "csv">("manual");

  const [opponent, setOpponent] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [seatInfo, setSeatInfo] = useState("Section 128LG Row L Seats 5-6");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [friendPrice, setFriendPrice] = useState("");
  const [tier, setTier] = useState("mid");
  const [disposition, setDisposition] = useState("sell");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<any>(null);

  async function postJson(url: string, payload: any) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b?.message || `Request failed (${res.status})`);
    }
  }

  async function createGame() {
    if (!opponent || !dateTime) return;
    setSaving(true);
    setError("");
    try {
      await postJson("/api/admin/games/create", {
        opponent: opponent.trim(),
        game_datetime: new Date(dateTime).toISOString(),
        seat_info: seatInfo.trim(),
        purchase_cost: purchaseCost || null,
        friend_price: friendPrice || null,
        tier,
        disposition,
        notes: notes.trim() || null,
        status: "available",
      });
      setOpponent(""); setDateTime(""); setPurchaseCost("");
      setFriendPrice(""); setNotes(""); setTier("mid"); setDisposition("sell");
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadCsv() {
    if (!csvFile) return;
    setCsvUploading(true);
    setCsvResult(null);
    const form = new FormData();
    form.append("file", csvFile);
    const res = await fetch("/api/admin/games/upload-csv", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setCsvResult(body);
    if (res.ok && body?.ok) { setOpen(false); router.refresh(); }
    setCsvUploading(false);
  }

  async function logout() {
    await fetch("/api/auth/admin-logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <>
      <nav className="bg-[#0C2340] sticky top-0 z-50 border-b border-[#005A9C]/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[#0C2340] font-bold text-xs">LA</span>
                </div>
                <span className="text-white font-semibold text-sm hidden sm:block">Ticket Manager</span>
              </div>
              <div className="flex items-center gap-1">
                <NavLink href="/admin/dashboard" label="Dashboard" icon={LayoutDashboard} />
                <NavLink href="/admin/games" label="Games" icon={Ticket} />
                <NavLink href="/admin/requests" label="Requests" icon={Users} />
                <NavLink href="/admin/reporting" label="Reporting" icon={BarChart2} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 text-sm bg-white text-[#0C2340] px-3 py-1.5 rounded-lg font-medium hover:bg-blue-50 transition-colors">
                <Plus className="h-4 w-4" /> Add Game
              </button>
              <Link href="/" className="text-sm text-blue-200 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors hidden sm:block">
                Friends view
              </Link>
              <button onClick={logout} className="text-blue-200 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Add Game</h2>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex border-b">
              {[{ key: "manual", label: "Manual" }, { key: "csv", label: "CSV Upload" }].map(t => (
                <button key={t.key} onClick={() => setTab(t.key as any)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t.key ? "border-b-2 border-[#005A9C] text-[#005A9C]" : "text-zinc-500 hover:text-zinc-700"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "manual" && (
              <div className="p-6 grid gap-4">
                {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-zinc-700">Opponent *</label>
                    <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="e.g. Giants" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-zinc-700">Date & Time *</label>
                    <input type="datetime-local" className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={dateTime} onChange={e => setDateTime(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-zinc-700">Seat Info</label>
                    <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={seatInfo} onChange={e => setSeatInfo(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-700">Purchase Cost</label>
                    <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} placeholder="e.g. 366.22" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-700">Friend Price</label>
                    <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={friendPrice} onChange={e => setFriendPrice(e.target.value)} placeholder="e.g. 175" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-700">Tier</label>
                    <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={tier} onChange={e => setTier(e.target.value)}>
                      <option value="premium">Premium</option>
                      <option value="mid">Mid</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-700">Disposition</label>
                    <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={disposition} onChange={e => setDisposition(e.target.value)}>
                      <option value="sell">Sell</option>
                      <option value="keep">Keep</option>
                      <option value="friends">Friends</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-zinc-700">Notes</label>
                    <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50">Cancel</button>
                  <button onClick={createGame} disabled={!opponent || !dateTime || saving}
                    className="px-4 py-2 text-sm bg-[#005A9C] text-white rounded-xl hover:bg-[#0C2340] disabled:opacity-50">
                    {saving ? "Saving…" : "Save Game"}
                  </button>
                </div>
              </div>
            )}
            {tab === "csv" && (
              <div className="p-6">
                <p className="text-sm text-zinc-500 mb-4">Upload a CSV with columns: opponent, game_datetime, seat_info, purchase_cost, friend_price, notes</p>
                <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] || null)} className="text-sm" />
                <button onClick={uploadCsv} disabled={!csvFile || csvUploading}
                  className="mt-3 flex items-center gap-2 px-4 py-2 text-sm border rounded-xl hover:bg-zinc-50 disabled:opacity-50">
                  <Upload className="h-4 w-4" />
                  {csvUploading ? "Uploading…" : "Upload CSV"}
                </button>
                {csvResult && <pre className="mt-3 text-xs bg-zinc-50 border p-3 rounded-xl overflow-auto">{JSON.stringify(csvResult, null, 2)}</pre>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
