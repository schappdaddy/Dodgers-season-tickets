import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { requestId } = await req.json();
  if (!requestId) return NextResponse.json({ message: "Missing requestId" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("requests")
    .update({
      status: "tickets_sent",
      tickets_sent_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
