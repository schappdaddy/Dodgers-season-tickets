import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json();

  const opponent = String(body.opponent ?? "").trim();
  const game_datetime = String(body.game_datetime ?? "").trim();
  const seat_info = String(body.seat_info ?? "2 seats").trim();
  const notes = String(body.notes ?? "").trim() || null;
  const promotion_title = String(body.promotion_title ?? "").trim() || null;
  const promotion_description = String(body.promotion_description ?? "").trim() || null;
  const tier = body.tier || "mid";
  const disposition = body.disposition || "sell";

  const purchase_cost =
    body.purchase_cost === "" || body.purchase_cost == null
      ? null
      : Number(body.purchase_cost);

  const friend_price =
    body.friend_price === "" || body.friend_price == null
      ? purchase_cost
      : Number(body.friend_price);

  const price_total =
    friend_price != null
      ? friend_price
      : purchase_cost != null
      ? purchase_cost
      : 0;

  const suggested_price =
    body.suggested_price == null || body.suggested_price === ""
      ? null
      : Number(body.suggested_price);

  const floor_price =
    body.floor_price == null || body.floor_price === ""
      ? null
      : Number(body.floor_price);

  const status = String(body.status ?? "available").trim();

  if (!opponent || !game_datetime) {
    return NextResponse.json({ message: "Missing opponent or game_datetime" }, { status: 400 });
  }

  if (!["available", "pending", "reserved"].includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("games").insert({
    opponent,
    game_datetime,
    seat_info,
    notes,
    purchase_cost,
    friend_price,
    price_total,
    status,
    tier,
    disposition,
    suggested_price,
    floor_price,
    promotion_title,
    promotion_description,
  });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
