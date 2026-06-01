import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { requestId, purpose } = await req.json();

  if (!requestId || !purpose) {
    return NextResponse.json({ message: "Missing requestId or purpose" }, { status: 400 });
  }

  if (!["recovery", "personal"].includes(purpose)) {
    return NextResponse.json({ message: "Invalid purpose" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("requests")
    .update({ purpose })
    .eq("id", requestId);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
