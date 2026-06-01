import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PAID_STATUSES = new Set(["paid", "sent", "tickets_sent"]);

export async function GET() {
  const { data: availableGames, error: gErr } = await supabaseAdmin
    .from("games")
    .select("price_total")
    .eq("status", "available");

  if (gErr) return NextResponse.json({ message: gErr.message }, { status: 500 });

  const moneyStillAvailable = (availableGames || []).reduce(
    (sum, g: any) => sum + (Number(g.price_total) || 0), 0
  );

  const { data: pendingGames, error: pendingErr } = await supabaseAdmin
    .from("games")
    .select("price_total")
    .eq("status", "pending");

  if (pendingErr) return NextResponse.json({ message: pendingErr.message }, { status: 500 });

  const moneyPending = (pendingGames || []).reduce((sum, g: any) => {
    const v = Number(g.price_total);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  const { data: reqs, error: rErr } = await supabaseAdmin
    .from("requests")
    .select("friend_name, purpose, status, amount_paid");

  if (rErr) return NextResponse.json({ message: rErr.message }, { status: 500 });

  const paidRows = (reqs || []).filter((r: any) => {
    const status = String(r.status || "").toLowerCase();
    return PAID_STATUSES.has(status) && r.amount_paid != null;
  });

  // Recovery = sold online or to a friend — counts toward 60% goal
  const recoveryRows = paidRows.filter((r: any) =>
    String(r.purpose || "").toLowerCase() === "recovery"
  );
  const recoveryTotal = recoveryRows.reduce(
    (sum: number, r: any) => sum + (Number(r.amount_paid) || 0), 0
  );

  // Personal = games you attended yourself — does NOT count toward goal
  const personalRows = paidRows.filter((r: any) =>
    String(r.purpose || "").toLowerCase() === "personal"
  );
  const personalTotal = personalRows.reduce(
    (sum: number, r: any) => sum + (Number(r.amount_paid) || 0), 0
  );

// Personal games — requests marked as personal purpose
  const { data: personalGames, error: pgErr } = await supabaseAdmin
    .from("requests")
    .select(`
      id,
      friend_name,
      amount_paid,
      amount_due,
      games!requests_game_id_fkey (
        id,
        opponent,
        game_datetime,
        purchase_cost
      )
    `)
    .eq("purpose", "personal")
    .in("status", ["paid", "tickets_sent", "requested", "confirmed"]);

  if (pgErr) return NextResponse.json({ message: pgErr.message }, { status: 500 });

  const keptCost = (personalGames || []).reduce(
    (sum, g: any) => sum + (Number(g.amount_due) || Number(g.games?.purchase_cost) || 0), 0
  );

  // By friend breakdown — ALL paid requests (recovery + personal)
  const byFriend: Record<string, number> = {};
  for (const r of paidRows) {
    const name = String(r.friend_name || "").trim() || "(unknown)";
    byFriend[name] = (byFriend[name] || 0) + (Number(r.amount_paid) || 0);
  }

  const byFriendSorted = Object.entries(byFriend)
    .map(([friend_name, total_paid]) => ({ friend_name, total_paid }))
    .sort((a, b) => b.total_paid - a.total_paid);

  return NextResponse.json({
    ok: true,
    moneyStillAvailable,
    moneyPending,
    recoveryTotal,      // counts toward goal
    personalTotal,      // does NOT count toward goal
    keptGames: personalGames || [],
    keptCount: (personalGames || []).length,
    keptCost,
    byFriend: byFriendSorted,
  });
}
