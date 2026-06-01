import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json();
  const { gameId, tier, disposition, suggested_price, floor_price } = body;

  if (!gameId) return NextResponse.json({ message: "Missing gameId" }, { status: 400 });

  const update: Record<string, any> = {};
  if (tier) update.tier = tier;
  if (disposition) update.disposition = disposition;
  if (suggested_price !== undefined) update.suggested_price = suggested_price;
  if (floor_price !== undefined) update.floor_price = floor_price;

  const { error } = await supabaseAdmin.from("games").update(update).eq("id", gameId);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
