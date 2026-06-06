import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const SEATGEEK_CLIENT_ID = process.env.SEATGEEK_CLIENT_ID;

async function getSeatGeekEventId(game: any): Promise<{ eventId: string | null; eventUrl: string | null }> {
  if (!SEATGEEK_CLIENT_ID) return { eventId: null, eventUrl: null };

  try {
    const gameDate = new Date(game.game_datetime);
    const dateStr = gameDate.toISOString().slice(0, 10);

    const url = `https://api.seatgeek.com/2/events?performers.slug=los-angeles-dodgers&datetime_local.gte=${dateStr}T00:00:00&datetime_local.lte=${dateStr}T23:59:59&client_id=${SEATGEEK_CLIENT_ID}&per_page=5`;

    const res = await fetch(url);
    if (!res.ok) return { eventId: null, eventUrl: null };

    const body = await res.json();
    const events = body?.events || [];
    if (events.length === 0) return { eventId: null, eventUrl: null };

    const event = events[0];
    return {
      eventId: String(event.id),
      eventUrl: event.url || `https://seatgeek.com/los-angeles-dodgers-tickets/${dateStr.slice(5, 7)}-${dateStr.slice(8, 10)}-${dateStr.slice(0, 4)}-los-angeles-california-dodger-stadium/mlb/${event.id}?quantity=2`,
    };
  } catch {
    return { eventId: null, eventUrl: null };
  }
}

async function scrapeSeatGeekPrices(eventUrl: string, apiKey: string): Promise<string> {
  try {
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
        messages: [{
          role: "user",
          content: `Fetch this exact SeatGeek page and extract ticket prices by section: ${eventUrl}

I need the current listing prices for Loge sections (look for sections 122LG, 124LG, 126LG, 128LG, 130LG, 132LG, 134LG).

Search for: site:seatgeek.com "${eventUrl.split('/')[3]}" loge section prices

Return ONLY a JSON object with this structure, no markdown:
{
  "sections": {
    "128LG": <lowest price found or null>,
    "130LG": <lowest price found or null>,
    "126LG": <lowest price found or null>,
    "122LG": <lowest price found or null>,
    "loge_avg": <average of all loge prices found or null>,
    "loge_low": <lowest loge price found or null>,
    "loge_high": <highest loge price found or null>
  },
  "total_listings": <number or null>,
  "data_found": true/false,
  "source_url": "${eventUrl}"
}`
        }],
      }),
    });

    if (!response.ok) return "";

    const data = await response.json();
    const text = (data.content || [])
      .filter((i: any) => i.type === "text")
      .map((i: any) => i.text)
      .join("\n");

    return text;
  } catch {
    return "";
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

  const prompt = `You are a ticket pricing analyst for Dodger Stadium season ticket holders.

Game: Dodgers vs ${game.opponent} | ${gameDate} | ${days <= 0 ? "GAME IS TODAY" : `${days} days away`}
Seats: Section 128LG Loge Row L (premium loge level)
My cost: $${game.purchase_cost || "unknown"} for 2 tickets
SeatGeek takes 10% seller fee

REAL MARKET DATA SCRAPED FROM SEATGEEK:
${marketData || "No market data available — use conservative estimate"}

PRICING RULES:
- Use the real market data above to set price AT or SLIGHTLY BELOW comparable Loge sections
- Weak opponents (Angels, Rays, Rockies, Brewers, Cardinals, Reds, Mariners, Royals, Pirates, Nationals) = price to SELL
- Game today or within 2 days = urgent, price below market to move fast
- Within 7 days unsold = price at lowest comparable listing
- Never recommend above what comparable Loge tickets are actually listed for
- Unsold = $0, always better to sell at $80 than nothing

Based on the REAL prices above, give me a specific list price for Section 128LG.

Reply ONLY with JSON, no markdown:
{"recommended_price":<number>,"price_low":<number>,"price_high":<number>,"confidence":"high"|"medium"|"low","action":"<specific price and when to drop>","reasoning":"<cite the actual prices from the market data>","factors":{"team_form":"<brief>","opponent_demand":"<brief>","supply":"<actual listings and prices found>","timing":"<urgency level>","seat_premium":"<honest loge premium assessment>"},"market_avg":<number|null>,"market_listings":<number|null>}`;

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
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (!json.error) { data = json; usedModel = model; break; }
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

  const body = await req.json().catch(() => ({}));
  const gameId = body.gameId || null;

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

  const { data: game, error: gErr } = await supabaseAdmin
    .from("games")
    .select("id, opponent, game_datetime, tier, disposition, purchase_cost, suggested_price, floor_price, seat_info")
    .eq("id", gameId)
    .single();

  if (gErr || !game) {
    return NextResponse.json({ ok: false, message: gErr?.message || "Game not found" }, { status: 404 });
  }

  try {
    // Step 1: Get SeatGeek event ID and URL
    const { eventId, eventUrl } = await getSeatGeekEventId(game);

    // Step 2: Scrape real section prices from SeatGeek
    let marketData = "";
    if (eventUrl) {
      marketData = await scrapeSeatGeekPrices(eventUrl, apiKey);
    }

    // Step 3: Get AI recommendation using real market data
    const { rec, usedModel } = await getAIPricingRecommendation(game, marketData, apiKey);

    const dataSource = usedModel.includes("haiku")
      ? "ai_haiku"
      : eventUrl
      ? "seatgeek_ai"
      : "ai_only";

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
      hadMarketData: !!marketData,
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
