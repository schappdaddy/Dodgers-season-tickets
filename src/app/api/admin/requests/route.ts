import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("requests")
    .select(`
      id,
      status,
      purpose,
      amount_due,
      amount_paid,
      friend_name,
      friend_contact,
      created_at,
      game_id,
      games!requests_game_id_fkey (
        id,
        opponent,
        game_datetime,
        seat_info,
        status,
        active_request_id
      )
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ requests: data || [] });
}
