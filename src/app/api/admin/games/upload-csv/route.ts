import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { parse } from "csv-parse/sync";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ message: "No file uploaded" }, { status: 400 });

  const text = await file.text();

  let records: any[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    return NextResponse.json({ message: `CSV parse error: ${e.message}` }, { status: 400 });
  }

  if (!records.length) {
    return NextResponse.json({ message: "CSV is empty" }, { status: 400 });
  }

  const rows = records.map((r: any) => {
    const purchase_cost = r.purchase_cost ? Number(r.purchase_cost) : null;
    const friend_price = r.friend_price ? Number(r.friend_price) : purchase_cost;
    const price_total = friend_price ?? purchase_cost ?? 0;

    return {
      opponent: String(r.opponent ?? "").trim(),
      game_datetime: new Date(r.game_datetime).toISOString(),
      seat_info: String(r.seat_info ?? "2 seats").trim(),
      notes: r.notes ? String(r.notes).trim() : null,
      purchase_cost,
      friend_price,
      price_total,
      tier: r.tier || "mid",
      disposition: r.disposition || "sell",
      status: "available",
    };
  }).filter(r => r.opponent && r.game_datetime);

  if (!rows.length) {
    return NextResponse.json({ message: "No valid rows found in CSV" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("games").insert(rows);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, inserted: rows.length });
}
