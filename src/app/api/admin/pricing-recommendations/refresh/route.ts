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

  const prompt = `You are an expert ticket resale pricing analyst. I need an ACCURATE current market price for tickets I am trying to sell RIGHT NOW.

CRITICAL CONTEXT:
- Game: Los Angeles Dodgers vs ${game.opponent}
- Date: ${gameDate}
- Days until game: ${days} ${days === 0 ? "— GAME IS TODAY, possibly already started" : days < 0 ? "— GAME HAS PASSED" : ""}
- My seats: Section 128LG Row L Seats 5-6 (Loge level, Dodger Stadium)
- My cost: $${game.purchase_cost || "unknown"} for 2 tickets
- SeatGeek takes 10% from my proceeds

PRICING REALITY RULES — follow these strictly:
1. Loge seats ARE premium but only command a premium when there is ACTUAL DEMAND
2. For weak opponents (Angels, Rays, Rockies, Brewers, Cardinals, Reds, Mariners, Royals, Pirates, Nationals) — demand is LOW, price to SELL not to maximize
3. If the game is TODAY or within 2 days — prices drop 30-50% from face value, buyers have all the leverage
4. If the game is within 7 days and tickets are unsold — price BELOW comparable listings to move fast
5. Never recommend above what comparable Loge tickets are actually listed for right now
6. A ticket that doesn't sell is worth $0 — always better to sell at $80 than not sell at all

TASK: Web search RIGHT NOW for:
1. "Dodgers ${game.opponent} ${gameDate} tickets seatgeek loge" — find actual current listings and prices
2. "Dodgers ${game.opponent} ${gameDate} tickets stubhub section 128" — find comparable prices
3. Current Dodgers record and recent form — winning teams sell better
4. How many days until game and what that means for pricing urgency

Based on ACTUAL current market prices you find, give me a realistic price I can sell at TODAY. If you find Loge tickets listed at $75-100, my recommended price should be AT or BELOW that, not above it.

Respond ONLY with valid JSON, no markdown:
{
  "recommended_price": <number — must reflect actual current market, not theoretical value>,
  "price_low": <floor price — what to drop to if not selling in 24hrs>,
  "price_high": <only list this high if market supports it>,
  "confidence": "high" | "medium" | "low",
  "action": "<specific action: exact price to list at and when to drop>",
  "reasoning": "<2 sentences — cite actual prices you found in your search>",
  "factors": {
    "team_form": "<Dodgers current record and recent performance>",
    "opponent_demand": "<honest assessment — is this a high or low demand opponent>",
    "supply": "<how many listings did you find and at what prices>",
    "timing": "<days until game and urgency level>",
    "seat_premium": "<honest Loge premium assessment given current demand>"
  },
  "market_avg": <average price you found in search or null>,
  "market_listings": <number of listings you found or null>
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

  if (!textBlocks) throw new Error(`No text in response: ${JSON.stringify(data.content)}`);

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

  // If no gameId — return the list of games to process
  if (!gameId) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

    const { data: games, error: gErr } = await supabaseAdmin
      .from("games")
      .select("id, opponent, game_datetime")
      .eq("disposition", "sell")
      .gte("game_datetime", now.toISOString())
      .lte("game_datetime", cutoff.toISOString())
      .order("game_datetime", { ascending: true });

    if (gErr) return NextResponse.json({ message: gErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      games: (games || []).map((g: any) => ({ id: g.id, opponent: g.opponent })),
    });
  }

  // If gameId provided — process that specific game
  const { data: game, error: gErr } = await supabaseAdmin
    .from("games")
    .select("id, opponent, game_datetime, tier, disposition, purchase_cost, suggested_price, floor_price, seat_info")
    .eq("id", gameId)
    .single();

  if (gErr || !game) {
    return NextResponse.json({ ok: false, message: gErr?.message || "Game not found" }, { status: 404 });
  }

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
      return NextResponse.json({ ok: false, error: upsertErr.message });
    }

    return NextResponse.json({
      ok: true,
      gameId: game.id,
      opponent: game.opponent,
      price: rec.recommended_price,
      confidence: rec.confidence,
    });

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      gameId: game.id,
      opponent: game.opponent,
      error: err.message,
    });
  }
}
