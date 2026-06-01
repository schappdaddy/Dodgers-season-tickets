import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("games")
    .select(`
      id,
      opponent,
      game_datetime,
      status,
      seat_info,
      price_total,
      purchase_cost,
      friend_price,
      notes,
      disposition,
      tier,
      suggested_price,
      floor_price,
      active_request_id,
      promotion_title,
      promotion_description,
      listings (
        id,
        platform,
        status,
        listed_price,
        net_proceeds,
        listing_url,
        listed_at,
        ended_at,
        sold_at
      ),
      active_request:requests!games_active_request_fk (
        id,
        friend_name,
        friend_contact,
        status,
        purpose,
        amount_due,
        amount_paid
      )
    `)
    .order("game_datetime", { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const games = (data || []).map((g: any) => {
    const listings = Array.isArray(g.listings) ? g.listings : [];
    const activeListings = listings.filter((l: any) => l.status === "listed");
    return {
      ...g,
      is_listed_online: activeListings.length > 0,
      listed_platforms: activeListings.map((l: any) => l.platform),
      active_listings: activeListings,
    };
  });

  return NextResponse.json({ games });
}
