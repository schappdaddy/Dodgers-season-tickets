import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { requestId, gameId } = await req.json();
  if (!requestId || !gameId) {
    return NextResponse.json({ message: "Missing requestId or gameId" }, { status: 400 });
  }

  const { error: reqError } = await supabaseAdmin
    .from("requests")
    .delete()
    .eq("id", requestId);

  if (reqError) return NextResponse.json({ message: reqError.message }, { status: 500 });

  const { error: gameError } = await supabaseAdmin
    .from("games")
    .update({ status: "available", active_request_id: null })
    .eq("id", gameId);

  if (gameError) return NextResponse.json({ message: gameError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
