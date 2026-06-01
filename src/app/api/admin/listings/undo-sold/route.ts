import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { listingId } = await req.json();

  if (!listingId) {
    return NextResponse.json({ message: "Missing listingId" }, { status: 400 });
  }

  const { data: listing, error: fetchErr } = await supabaseAdmin
    .from("listings")
    .select("id, game_id")
    .eq("id", listingId)
    .single();

  if (fetchErr || !listing) {
    return NextResponse.json({ message: fetchErr?.message || "Listing not found" }, { status: 500 });
  }

  const { error: listingErr } = await supabaseAdmin
    .from("listings")
    .update({
      status: "ended",
      sold_at: null,
      net_proceeds: null,
      ended_at: new Date().toISOString(),
    })
    .eq("id", listingId);

  if (listingErr) return NextResponse.json({ message: listingErr.message }, { status: 500 });

  const { error: reqErr } = await supabaseAdmin
    .from("requests")
    .delete()
    .eq("listing_id", listingId);

  if (reqErr) return NextResponse.json({ message: reqErr.message }, { status: 500 });

  const { error: gameErr } = await supabaseAdmin
    .from("games")
    .update({ status: "available", active_request_id: null })
    .eq("id", listing.game_id);

  if (gameErr) return NextResponse.json({ message: gameErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
