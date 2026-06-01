import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

async function getAIPricingRecommendation(game: any, marketData: any) {
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
- Section: 128LG (Loge level) - these are PREMIUM seats that command higher prices than upper deck, bleachers, or reserve sections
- My cost: $${game.purchase_cost || "unknown"} for 2 tickets
- My tier: ${game.tier} (${game.tier === "premium" ? "high demand rivalry game" : game.tier === "mid" ? "average demand game" : "low demand game"})
- My suggested price: $${game.suggested_price || "not set"}/ticket
- My floor price: $${game.floor_price || "not set"}/ticket
- SeatGeek fee: 10% taken from my proceeds

${marketData ? `Current market data for comparable Loge sections:
- Average price: $${marketData.avgPrice}/ticket
- Lowest price: $${marketData.lowestPrice}/ticket  
- Number of listings: ${marketData.listingCount}` : "No live market data available - please web search for current Dodger Stadium Loge section ticket prices for this game."}

Please web search for:
1. Current ticket listings for Dodgers vs ${game.opponent} on ${gameDate} specifically for Loge level sections 126-133 at Dodger Stadium
2. Recent sold prices for Loge seats at Dodger Stadium for similar matchups
3. Current Dodgers team performance and win streak (affects demand)
4. Any injury news for key players (Ohtani, Betts, Freeman)
5. ${game.opponent} current standing and fan travel likelihood
6. Any special promotions or bobblehead nights for this game

Based on your research, provide a pricing recommendation specifically for Loge Section 128LG Row L seats. These seats are significantly better than average and should be priced accordingly.

Respond ONLY with a JSON object, no markdown, no backticks:
{
  "recommended_price": <number per ticket>,
  "price_low": <conservative price per ticket>,
  "price_high": <aggressive price per ticket>,
  "confidence": "high" | "medium" | "low",
  "action": <one sentence specific action to take>,
  "reasoning": <2-3 sentences explaining the recommendation>,
  "factors": {
    "team_form": <brief note on Dodgers current form>,
    "opponent_demand": <brief note on opponent marketability>,
    "supply": <brief note on current listing supply>,
    "timing": <brief note on days until game and optimal listing window>,
    "seat_premium": <brief note on Loge premium vs other sections>
  },
  "market_avg": <number or null>,
  "market_listings": <number or null>
}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "interleaved-thinking-2025-05-14",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract text from response (may include tool use blocks)
  const text = data.content
    .map((item: any) => (item.type === "text" ? item.text : ""))
    .filter(Boolean)
    .join("\n");

  // Clean and parse JSON
  const clean = text.replace(/```json|```/g, "").trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]);
}

export async function POST() {
  // Get upcoming sell games (next 45 days)
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
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Try to get SeatGeek data if available
  const seatgeekClientId = process.env.SEATGEEK_CLIENT_ID;
  const marketDataMap: Record<string, any> = {};

  if (seatgeekClientId) {
    try {
      const seatgeekRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/admin/seatgeek`);
      if (seatgeekRes.ok) {
        const body = await seatgeekRes.json();
        for (const row of (body.market || [])) {
          marketDataMap[row.gameId] = row;
        }
      }
    } catch {}
  }

  const results = [];

  for (const game of games) {
    try {
      const marketData = marketDataMap[game.id] || null;
      const rec = await getAIPricingRecommendation(game, marketData);

      const dataSource = marketData?.avgPrice ? "seatgeek_ai" : "ai_only";

      // Upsert recommendation
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
          data_source: dataSource,
          market_avg: rec.market_avg || marketData?.avgPrice || null,
          market_listings: rec.market_listings || marketData?.listingCount || null,
          generated_at: new Date().toISOString(),
        }, { onConflict: "game_id" });

      if (upsertErr) {
        results.push({ gameId: game.id, opponent: game.opponent, error: upsertErr.message });
      } else {
        results.push({ gameId: game.id, opponent: game.opponent, price: rec.recommended_price, confidence: rec.confidence });
      }

      // Delay between API calls to be respectful
      await new Promise(r => setTimeout(r, 1000));

    } catch (err: any) {
      results.push({ gameId: game.id, opponent: game.opponent, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, processed: games.length, results });
}
