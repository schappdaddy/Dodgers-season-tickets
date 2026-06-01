import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json();

  const gameId = String(body.gameId ?? "").trim();
  if (!gameId) return NextResponse.json({ message: "Missing gameId" }, { status: 400 });

  const update: Record<string, any> = {
    promotion_title: String(body.promotion_title ?? "").trim() || null,
    promotion_description: String(body.promotion_description ?? "").trim() || null,
  };

  const { error } = await supabaseAdmin.from("games").update(update).eq("id", gameId);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
