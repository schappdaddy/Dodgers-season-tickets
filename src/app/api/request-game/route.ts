import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json();

  const gameId = body.gameId;
  const friendName = body.friendName;
  const friendContact = body.friendContact ?? body.friendEmail ?? body.contact ?? body.email ?? "";

  if (!gameId || !friendName || !String(friendContact).trim()) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }

  const { data: lockedRows, error: lockError } = await supabaseAdmin
    .from("games")
    .update({ status: "pending" })
    .eq("id", gameId)
    .eq("status", "available")
    .select("*");

  if (lockError) return NextResponse.json({ message: lockError.message }, { status: 500 });

  if (!lockedRows || lockedRows.length === 0) {
    return NextResponse.json({ message: "Sorry — this game was just taken." }, { status: 409 });
  }

  const game = lockedRows[0];
  const amountDue = game.friend_price ?? game.purchase_cost ?? game.price_total ?? null;

  const { data: reqRows, error: reqError } = await supabaseAdmin
    .from("requests")
    .insert({
      game_id: gameId,
      friend_name: friendName.trim(),
      friend_contact: friendContact.trim(),
      status: "requested",
      purpose: "recovery",
      amount_due: amountDue,
    })
    .select("id")
    .limit(1);

  if (reqError) {
    await supabaseAdmin.from("games").update({ status: "available" }).eq("id", gameId);
    return NextResponse.json({ message: reqError.message }, { status: 500 });
  }

  const requestId = reqRows?.[0]?.id;

  const { error: linkError } = await supabaseAdmin
    .from("games")
    .update({ active_request_id: requestId })
    .eq("id", gameId);

  if (linkError) {
    return NextResponse.json({ message: `Request created but failed to link: ${linkError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
