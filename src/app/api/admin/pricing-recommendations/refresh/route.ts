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
      model: "claude-sonnet-4-20250514",
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

  // Extract text from response — may include tool use blocks
  const textBlocks = (data.content || [])
    .filter((item: any) => item.type === "text")
    .map((item: any) => item.text)
    .join("\n");

  if (!textBlocks) throw new Error(`No text in response. Content: ${JSON.stringify(data.content)}`);

  // Find JSON in response
  const jsonMatch = textBlocks.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in: ${textBlocks.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]);
}

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY not configured in environment variables" }, { status: 500 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

  const { data: games, error: gErr } = await supabaseAdmin
    .from("games")
    .select("id, opponent, game_datetime, tier, disposition, purchase_cost, suggested_price, floor_price, seat_info")
    .eq("disposition", "sell")
    .gte("game_datetime", now.toISOString())
    .lte("game_datetime", cutoff.toISOString())
    .order("game_datetime", { ascending: true });

  if (gErr) return NextResponse.json({ message: gErr.message }, { status: 500 });

  if (!games || games.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "No upcoming sell games found" });
  }

  const results = [];

  for (const game of games) {
    try {
      const rec = await getAIPricingRecommendation(game);

      const { error: upsertErr } = await supabaseAdmin
        .from("pricing_recommendations")
        .upsert({
          game_id: game.id,
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
        results.push({ gameId: game.id, opponent: game.opponent, error: `Upsert failed: ${upsertErr.message}` });
      } else {
        results.push({ gameId: game.id, opponent: game.opponent, price: rec.recommended_price, confidence: rec.confidence });
      }

      await new Promise(r => setTimeout(r, 1500));

    } catch (err: any) {
      results.push({ gameId: game.id, opponent: game.opponent, error: err.message });
    }
  }

  const successes = results.filter(r => !r.error).length;
  const failures = results.filter(r => r.error);

  return NextResponse.json({
    ok: successes > 0,
    processed: games.length,
    successes,
    failures: failures.length,
    results,
  });
}
