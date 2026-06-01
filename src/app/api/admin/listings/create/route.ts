import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { gameId, platform, listedPrice, listingUrl, notes } = await req.json();

  if (!gameId || !platform) {
    return NextResponse.json({ message: "Missing gameId or platform" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("listings").insert({
    game_id: gameId,
    platform,
    status: "listed",
    listed_price: listedPrice ?? null,
    listing_url: listingUrl ?? null,
    notes: notes ?? null,
    listed_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
