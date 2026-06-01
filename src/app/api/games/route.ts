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
      promotion_title,
      promotion_description,
      listings (
        platform,
        status
      )
    `)
    .order("game_datetime", { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const games = (data || []).map((g: any) => {
    const listings = Array.isArray(g.listings) ? g.listings : [];
    const active = listings.filter((l: any) => l.status === "listed");
    return {
      ...g,
      is_listed_online: active.length > 0,
      listed_platforms: active.map((l: any) => l.platform),
    };
  });

  return NextResponse.json({ games });
}
