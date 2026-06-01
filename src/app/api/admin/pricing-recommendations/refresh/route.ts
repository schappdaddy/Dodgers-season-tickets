import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

async function getAIPricingRecommendation(game: any) {
  const days = Math.ceil(
    (new Date(game.game_datetime).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  const gameDate = new Date(game.game_datetime).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const prompt = `You are an expert ticket pricing analyst for Dodger Stadium season ticket holders.

I need a specific pricing recommendation for these tickets:
- Game: Los Angeles Dodgers vs ${game.opponent}
- Date: ${gameDate} (${days} days away)
- Seats: ${game.seat_info || "Section 128LG Row L Seats 5-6"}
- Section: 128LG (Loge level) - PREMIUM seats commanding higher prices than upper deck or bleachers
- My cost: $${game.purchase_cost || "unknown"} for 2 tickets
- My tier: ${game.tier}
- My floor price: $${game.floor_price || "not set"}/ticket
- SeatGeek seller fee: 10%

Please search for current Dodger Stadium Loge section ticket prices for this game, Dodgers current team form, and any relevant demand signals.

Respond ONLY with a valid JSON object, no markdown, no backticks, no explanation outside the JSON:
{
  "recommended_price": 170,
  "price_low": 150,
  "price_high": 195,
  "confidence": "high",
  "action": "List now at $170/ea — strong demand expected",
  "reasoning": "2-3 sentence explanation here",
  "factors": {
    "team_form": "brief note",
    "opponent_demand": "brief note",
    "supply": "brief note",
    "timing": "brief note",
    "seat_premium": "Loge 128LG commands 20-30% premium over upper deck"
  },
  "market_avg": null,
  "market_listings": null
}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  if (data.error) throw new Error(`Claude error: ${JSON.stringify(data.error)}`);

  const textBlocks = (data.content || [])
    .filter((item: any) => item.type === "text")
    .map((item: any) => item.text)
    .join("\n");

  if (!textBlocks) throw new Error(`No text in response. Content: ${JSON.stringify(data.content)}`);

  const jsonMatch = textBlocks.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in: ${textBlocks.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]);
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const gameId = body.gameId || null;

  const now = new Date();
  const cutoff = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

  let query = supabaseAdmin
    .from("games")
    .select("id, opponent, game_datetime, tier, disposition, purchase_cost, suggested_price, floor_price, seat_info")
    .eq("disposition", "sell")
    .gte("game_datetime", now.toISOString())
    .lte("game_datetime", cutoff.toISOString())
    .order("game_datetime", { ascending: true });

  if (gameId) {
    const { data: games, error: gErr } = await supabaseAdmin
      .from("games")
      .select("id, opponent, game_datetime, tier, disposition, purchase_cost, suggested_price, floor_price, seat_info")
      .eq("id", gameId)
      .single();

    if (gErr || !games) {
      return NextResponse.json({ message: gErr?.message || "Game not found" }, { status: 500 });
    }

    try {
      const rec = await getAIPricingRecommendation(games);

      const { error: upsertErr } = await supabaseAdmin
        .from("pricing_recommendations")
        .upsert({
          game_id: games.id,
          recommended_price: rec.recommended_price,
          price_low: rec.price_low,
          price_high: rec.price_high,
          confidence: rec.confidence,
          reasoning: rec.reasoning,
          action: rec.action,
          factors: rec.factors,
          data_source: "ai_only",
          market_avg: rec.market_avg || null,
          market_listings: rec.market_listings || null,
          generated_at: new Date().toISOString(),
        }, { onConflict: "game_id" });

      if (upsertErr) {
        return NextResponse.json({ ok: false, error: upsertErr.message });
      }

      return NextResponse.json({
        ok: true,
        gameId: games.id,
        opponent: games.opponent,
        price: rec.recommended_price,
        confidence: rec.confidence,
      });

    } catch (err: any) {
      return NextResponse.json({ ok: false, gameId: games.id, opponent: games.opponent, error: err.message });
    }
  }

  // No gameId — return list of upcoming sell games for the dashboard to iterate
  const { data: games, error: gErr } = await query;
  if (gErr) return NextResponse.json({ message: gErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    games: (games || []).map((g: any) => ({ id: g.id, opponent: g.opponent })),
  });
}
