import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { listingId, status, netProceeds } = await req.json();

  if (!listingId || !status) {
    return NextResponse.json({ message: "Missing listingId or status" }, { status: 400 });
  }

  if (!["listed", "ended", "sold", "cancelled"].includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const { data: listing, error: fetchErr } = await supabaseAdmin
    .from("listings")
    .select("id, game_id, platform")
    .eq("id", listingId)
    .single();

  if (fetchErr || !listing) {
    return NextResponse.json({ message: fetchErr?.message || "Listing not found" }, { status: 500 });
  }

  const patch: any = { status };
  if (status === "ended") patch.ended_at = new Date().toISOString();
  if (status === "sold") {
    patch.sold_at = new Date().toISOString();
    patch.net_proceeds = netProceeds ?? null;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("listings")
    .update(patch)
    .eq("id", listingId);

  if (updateErr) return NextResponse.json({ message: updateErr.message }, { status: 500 });

  if (status === "sold") {
    const { error: gameErr } = await supabaseAdmin
      .from("games")
      .update({ status: "reserved" })
      .eq("id", listing.game_id);

    if (gameErr) return NextResponse.json({ message: gameErr.message }, { status: 500 });

    const amountPaid = netProceeds ?? null;

    const { data: existingReq } = await supabaseAdmin
      .from("requests")
      .select("id")
      .eq("listing_id", listingId)
      .maybeSingle();

    if (existingReq?.id) {
      await supabaseAdmin.from("requests").update({
        status: "paid",
        purpose: "recovery",
        amount_paid: amountPaid,
        friend_name: "Marketplace",
        friend_contact: listing.platform ?? null,
      }).eq("id", existingReq.id);
    } else {
      await supabaseAdmin.from("requests").insert({
        game_id: listing.game_id,
        listing_id: listingId,
        status: "paid",
        purpose: "recovery",
        amount_due: null,
        amount_paid: amountPaid,
        friend_name: "Marketplace",
        friend_contact: listing.platform ?? null,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
