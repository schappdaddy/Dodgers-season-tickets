import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { requestId, amountPaid } = await req.json();
  if (!requestId) return NextResponse.json({ message: "Missing requestId" }, { status: 400 });

  const { data: reqRow, error: fetchErr } = await supabaseAdmin
    .from("requests")
    .select("amount_due")
    .eq("id", requestId)
    .single();

  if (fetchErr) return NextResponse.json({ message: fetchErr.message }, { status: 500 });

  const finalPaid = amountPaid ?? reqRow?.amount_due ?? null;

  const { error } = await supabaseAdmin
    .from("requests")
    .update({
      status: "paid",
      amount_paid: finalPaid,
      paid_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
