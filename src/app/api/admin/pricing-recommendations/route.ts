import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("pricing_recommendations")
    .select(`
      id,
      game_id,
      recommended_price,
      price_low,
      price_high,
      confidence,
      reasoning,
      action,
      factors,
      data_source,
      market_avg,
      market_listings,
      generated_at,
      games!pricing_recommendations_game_id_fkey (
        id,
        opponent,
        game_datetime,
        tier,
        disposition,
        purchase_cost,
        suggested_price,
        floor_price,
        seat_info
      )
    `)
    .order("generated_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ recommendations: data || [] });
}
