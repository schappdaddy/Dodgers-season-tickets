import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const SEATGEEK_CLIENT_ID = process.env.SEATGEEK_CLIENT_ID;

async function getSeatGeekEventData(game: any): Promise<{ eventId: string | null; eventUrl: string | null; marketData: string; stats: any }> {
  if (!SEATGEEK_CLIENT_ID) return { eventId: null, eventUrl: null, marketData: "", stats: null };

  try {
    const gameDate = new Date(game.game_datetime);
    const dateStr = gameDate.toISOString().slice(0, 10);

    const url = `https://api.seatgeek.com/2/events?performers.slug=los-angeles-dodgers&datetime_local.gte=${dateStr}T00:00:00&datetime_local.lte=${dateStr}T23:59:59&client_id=${SEATGEEK_CLIENT_ID}&per_page=5`;

    const res = await fetch(url);
    if (!res.ok) return { eventId: null, eventUrl: null, marketData: "", stats: null };

    const body = await res.json();
    const events = body?.events || [];
    if (events.length === 0) return { eventId: null, eventUrl: null, marketData: "", stats: null };

    const event = events[0];
    const eventId = String(event.id);
    const month = String(gameDate.getMonth() + 1);
    const day = String(gameDate.getDate());
    const year = gameDate.getFullYear();
    const eventUrl = `https://seatgeek.com/los-angeles-dodgers-tickets/${month}-${day}-${year}-los-angeles-california-dodger-stadium/mlb/${eventId}?quantity=2`;

    // Get detailed event stats
    const eventRes = await fetch(
      `https://api.seatgeek.com/2/events/${eventId}?client_id=${SEATGEEK_CLIENT_ID}`
    );

    let marketData = "";
    let stats = null;

    if (eventRes.ok) {
      const eventData = await eventRes.json();
      stats = eventData?.stats;

      if (stats) {
        const avg = stats.average_price || 100;
        const logeEstLow = Math.round(avg * 1.8);
        const logeEstMid = Math.round(avg * 2.2);
        const logeEstHigh = Math.round(avg * 2.6);

        marketData = `
SeatGeek live market data for this event:
- Stadium-wide average (ALL sections including cheap upper deck/bleachers): $${stats.average_price || "unknown"}
- Stadium-wide lowest (likely upper deck or bleachers): $${stats.lowest_price || "unknown"}
- Stadium-wide highest: $${stats.highest_price || "unknown"}
- Total listings: ${stats.listing_count || "unknown"}

CRITICAL CONTEXT — DO NOT USE STADIUM AVERAGE AS YOUR BASELINE:
The stadium-wide average includes hundreds of cheap upper deck, bleacher, and standing room tickets that sell for $30-80. These are NOT comparable to Loge seats.

Dodger Stadium section hierarchy and typical price ranges:
- Upper Reserved/Bleachers: $30-80 (cheapest, drags average down)
- Field Level (outfield): $80-150
- Loge Level (128LG, 130LG, 122LG etc.): $130-250 depending on game
- Field Level (infield): $180-400
- Premium/Club: $300+

Section 128LG is LOGE INFIELD — one of the best Loge sections.
Estimated Loge price range for this game based on market data:
- Loge low estimate: ~$${logeEstLow}/ea
- Loge mid estimate: ~$${logeEstMid}/ea
- Loge high estimate: ~$${logeEstHigh}/ea

PRICING RULE: Your recommendation MUST be in the $${logeEstLow}-$${logeEstHigh} range.
DO NOT recommend below $${Math.round(avg * 1.5)} — that would be giving away premium Loge seats at upper deck prices.
DO NOT use $${stats.lowest_price} as your floor — that is an upper deck/bleacher price, not a Loge floor.
        `.trim();

        console.log("SeatGeek market data:", {
          avg: stats.average_price,
          low: stats.lowest_price,
          high: stats.highest_price,
          listings: stats.listing_count,
          logeEstLow,
          logeEstMid,
          logeEstHigh,
        });
      }
    }

    return { eventId, eventUrl, marketData, stats };
  } catch (e) {
    console.error("SeatGeek API error:", e);
    return { eventId: null, eventUrl: null, marketData: "", stats: null };
  }
}

async function getAIPricingRecommendation(game: any, marketData: string, stats: any, apiKey: string) {
  const days = Math.ceil(
    (new Date(game.game_datetime).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  const gameDate = new Date(game.game_datetime).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const urgency = days <= 0
    ? "GAME IS TODAY OR ALREADY STARTED — tickets expire worthless very soon, price at Loge Low immediately"
    : days === 1
    ? "GAME IS TOMORROW — price at Loge Low, must sell today"
    : days <= 3
    ? "GAME IN 2-3 DAYS — price at Loge Low to guarantee sale"
    : days <= 7
    ? "GAME THIS WEEK — price at Loge Mid, drop to Loge Low if unsold in 48hrs"
    : "More than 7 days out — price at Loge Mid to High";

  const avg = stats?.average_price || 100;
  const logeEstLow = Math.round(avg * 1.8);
  const logeEstMid = Math.round(avg * 2.2);
  const logeEstHigh = Math.round(avg * 2.6);

  const weakOpponents = ["Angels", "Rays", "Rockies", "Brewers", "Cardinals", "Reds", "Mariners", "Royals", "Pirates", "Nationals", "Athletics", "Tigers", "White Sox"];
  const premiumOpponents = ["Giants", "Padres", "Phillies", "Red Sox", "Yankees", "Mets", "Cubs", "Astros"];
  const isWeak = weakOpponents.some(o => game.opponent.includes(o));
  const isPremium = premiumOpponents.some(o => game.opponent.includes(o));

  const opponentTier = isPremium ? "PREMIUM — price at Loge High"
    : isWeak ? "WEAK — price at Loge Low, no premium"
    : "AVERAGE — price at Loge Mid";

  const prompt = `You are a ticket pricing analyst for Dodger Stadium season ticket holders.

Game: Dodgers vs ${game.opponent} | ${gameDate}
Opponent tier: ${opponentTier}
Urgency: ${urgency}
Seats: Section 128LG Loge Row L Seats 5-6 (premium infield Loge)
My cost: $${game.purchase_cost || "unknown"} for 2 tickets
SeatGeek takes 10% seller fee

${marketData ? marketData : "No live market data — estimate Loge prices at $130-180 for weak opponents, $160-220 for average, $200-280 for premium."}

YOUR TARGET PRICE BASED ON RULES:
- Opponent tier (${isWeak ? "WEAK" : isPremium ? "PREMIUM" : "AVERAGE"}): ${isWeak ? `$${logeEstLow}/ea` : isPremium ? `$${logeEstHigh}/ea` : `$${logeEstMid}/ea`}
- Urgency adjustment: ${days <= 3 ? "Price at LOW end of range" : days <= 7 ? "Price at MID end of range" : "Price at MID to HIGH end"}
- Final target: ~$${isWeak ? logeEstLow : isPremium ? logeEstHigh : logeEstMid}/ea

STRICT RULES:
1. Recommend within $${logeEstLow}-$${logeEstHigh} range ALWAYS
2. Never go below $${Math.round(avg * 1.5)} — minimum Loge floor
3. Never use stadium-wide lowest price as floor
4. Weak opponent + urgent = Loge Low ($${logeEstLow})
5. Premium opponent + time = Loge High ($${logeEstHigh})
6. Unsold ticket = $0, always better to sell at Loge Low

Web search for actual current Loge section prices for Dodgers vs ${game.opponent} on ${gameDate} to validate these estimates.

Reply ONLY with JSON, no markdown:
{"recommended_price":<number per ticket>,"price_low":<loge low floor>,"price_high":<loge high ceiling>,"confidence":"high"|"medium"|"low","action":"<specific: exact price, when and how much to drop>","reasoning":"<cite actual Loge prices found, explain why this price>","factors":{"team_form":"<Dodgers current record>","opponent_demand":"<honest demand + opponent record>","supply":"<actual Loge listings found and prices>","timing":"<urgency level>","seat_premium":"<Loge 128LG premium assessment for this specific game>"},"market_avg":<stadium avg or null>,"market_listings":<total listings or null>}`;

  const models = ["claude-sonnet-4-5", "claude-haiku-4-5-20251001"];
  let data: any = null;
  let usedModel = "";
  let lastError = "";

  for (const model of models) {
    let attempts = 0;
    while (attempts < 2) {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (!json.error) {
          data = json;
          usedModel = model;
          break;
        }
        lastError = JSON.stringify(json.error);
        break;
      }

      if (response.status === 429) {
        attempts++;
        if (attempts < 2) {
          await new Promise(r => setTimeout(r, 65000));
          continue;
        }
        lastError = "Rate limited";
        break;
      }

      const errText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errText}`);
    }
    if (data) break;
  }

  if (!data) throw new Error(`All models failed: ${lastError}`);

  const textBlocks = (data.content || [])
    .filter((item: any) => item.type === "text")
    .map((item: any) => item.text)
    .join("\n");

  if (!textBlocks) throw new Error("No text in response");

  const jsonMatch = textBlocks.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in: ${textBlocks.slice(0, 200)}`);

  return { rec: JSON.parse(jsonMatch[0]), usedModel };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  console.log("ANTHROPIC key present:", !!apiKey);
  console.log("SEATGEEK key present:", !!SEATGEEK_CLIENT_ID);

  const body = await req.json().catch(() => ({}));
  const gameId = body.gameId || null;

  // No gameId — return list of upcoming sell games
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

  // Get specific game
  const { data: game, error: gErr } = await supabaseAdmin
    .from("games")
    .select("id, opponent, game_datetime, tier, disposition, purchase_cost, suggested_price, floor_price, seat_info")
    .eq("id", gameId)
    .single();

  if (gErr || !game) {
    return NextResponse.json({ ok: false, message: gErr?.message || "Game not found" }, { status: 404 });
  }

  try {
    // Step 1: Get SeatGeek event data + real market stats
    const { eventId, marketData, stats } = await getSeatGeekEventData(game);
    const hadRealData = !!marketData;

    console.log("Event ID found:", eventId);
    console.log("Had real market data:", hadRealData);

    // Step 2: Get AI recommendation with real market data
    const { rec, usedModel } = await getAIPricingRecommendation(game, marketData, stats, apiKey);

    const dataSource = hadRealData
      ? (usedModel.includes("haiku") ? "ai_haiku" : "seatgeek_ai")
      : (usedModel.includes("haiku") ? "ai_haiku" : "ai_only");

    // Step 3: Save to Supabase
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
      dataSource,
      hadMarketData: hadRealData,
      eventId,
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
