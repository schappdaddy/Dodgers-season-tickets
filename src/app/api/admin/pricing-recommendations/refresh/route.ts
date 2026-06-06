import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const SEATGEEK_CLIENT_ID = process.env.SEATGEEK_CLIENT_ID;

async function getSeatGeekEventData(game: any): Promise<{ eventId: string | null; eventUrl: string | null; marketData: string }> {
  if (!SEATGEEK_CLIENT_ID) return { eventId: null, eventUrl: null, marketData: "" };

  try {
    const gameDate = new Date(game.game_datetime);
    const dateStr = gameDate.toISOString().slice(0, 10);

    const url = `https://api.seatgeek.com/2/events?performers.slug=los-angeles-dodgers&datetime_local.gte=${dateStr}T00:00:00&datetime_local.lte=${dateStr}T23:59:59&client_id=${SEATGEEK_CLIENT_ID}&per_page=5`;

    const res = await fetch(url);
    if (!res.ok) return { eventId: null, eventUrl: null, marketData: "" };

    const body = await res.json();
    const events = body?.events || [];
    if (events.length === 0) return { eventId: null, eventUrl: null, marketData: "" };

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
    if (eventRes.ok) {
      const eventData = await eventRes.json();
      const stats = eventData?.stats;

      if (stats) {
        marketData = `
SeatGeek live market data for this event:
- Average ticket price (all sections): $${stats.average_price || "unknown"}
- Lowest ticket price (all sections): $${stats.lowest_price || "unknown"}
- Highest ticket price: $${stats.highest_price || "unknown"}
- Total listings: ${stats.listing_count || "unknown"}

Important context: These are stadium-wide averages across ALL sections.
Loge sections (128LG, 130LG etc.) typically price:
- 20-40% ABOVE stadium average for premium/rivalry games
- 10-20% ABOVE stadium average for average games  
- At or near stadium average for weak opponents (Angels, Rays, Rockies etc.)

Use the lowest_price as your floor — never go below that or you won't sell.
Use average_price as your baseline, then adjust up or down based on section premium and opponent demand.
        `.trim();

        console.log("SeatGeek market data found:", {
          avg: stats.average_price,
          low: stats.lowest_price,
          high: stats.highest_price,
          listings: stats.listing_count,
        });
      }
    }

    return { eventId, eventUrl, marketData };
  } catch (e) {
    console.error("SeatGeek API error:", e);
    return { eventId: null, eventUrl: null, marketData: "" };
  }
}

async function getAIPricingRecommendation(game: any, marketData: string, apiKey: string) {
  const days = Math.ceil(
    (new Date(game.game_datetime).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  const gameDate = new Date(game.game_datetime).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const urgency = days <= 0
    ? "GAME IS TODAY OR ALREADY STARTED — tickets expire worthless very soon, price extremely aggressively, $0 is the alternative"
    : days === 1
    ? "GAME IS TOMORROW — drop 20-30% below comparable listings, must sell today"
    : days <= 3
    ? "GAME IN 2-3 DAYS — price at or below lowest comparable listing, urgency is high"
    : days <= 7
    ? "GAME THIS WEEK — price competitively at or slightly below market to guarantee sale"
    : "More than 7 days out — can price near or slightly above market";

  const prompt = `You are a ticket pricing analyst for Dodger Stadium season ticket holders.

Game: Dodgers vs ${game.opponent} | ${gameDate}
Urgency: ${urgency}
Seats: Section 128LG Loge Row L Seats 5-6
My cost: $${game.purchase_cost || "unknown"} for 2 tickets
SeatGeek takes 10% seller fee from my proceeds

${marketData ? `REAL SEATGEEK MARKET DATA:\n${marketData}` : "No live market data — use conservative estimates and web search for current prices."}

STRICT PRICING RULES:
1. Use the SeatGeek lowest_price as your absolute floor — never recommend below that
2. Use average_price as baseline, adjust for section premium and opponent
3. Weak opponents (Angels, Rays, Rockies, Brewers, Cardinals, Reds, Mariners, Royals, Pirates, Nationals) = price at or BELOW stadium average, do not add Loge premium for these games
4. Premium opponents (Giants, Padres, Phillies, Red Sox, Yankees) = add 20-30% Loge premium above average
5. Follow urgency strictly — game day = price to sell immediately
6. An unsold ticket = $0. Always better to sell at cost than nothing

${!marketData ? "Web search for current Dodgers vs " + game.opponent + " ticket prices on SeatGeek to find real market data." : ""}

Reply ONLY with JSON, no markdown:
{"recommended_price":<number per ticket>,"price_low":<floor per ticket>,"price_high":<aggressive per ticket>,"confidence":"high"|"medium"|"low","action":"<specific: exact price to list at and when/how much to drop>","reasoning":"<cite actual market data prices you used>","factors":{"team_form":"<Dodgers current record/form>","opponent_demand":"<honest demand assessment>","supply":"<listings found and price range>","timing":"<urgency assessment>","seat_premium":"<honest Loge premium for this specific matchup>"},"market_avg":<number|null>,"market_listings":<number|null>}`;

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
  console.log("SCRAPINGBEE key present:", !!process.env.SCRAPINGBEE_API_KEY);
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
    const { eventId, eventUrl, marketData } = await getSeatGeekEventData(game);
    const hadRealData = !!marketData;

    console.log("Event ID found:", eventId);
    console.log("Had real market data:", hadRealData);

    // Step 2: Get AI recommendation with real market data
    const { rec, usedModel } = await getAIPricingRecommendation(game, marketData, apiKey);

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
