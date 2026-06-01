import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { gameId } = await req.json();
  if (!gameId) return NextResponse.json({ message: "Missing gameId" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("games")
    .update({ status: "reserved" })
    .eq("id", gameId)
    .eq("status", "pending")
    .select("id");

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ message: "Game is not in pending state." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
