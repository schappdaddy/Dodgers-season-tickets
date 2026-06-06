import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const SEATGEEK_CLIENT_ID = process.env.SEATGEEK_CLIENT_ID;
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;

async function getSeatGeekEventUrl(game: any): Promise<{ eventId: string | null; eventUrl: string | null }> {
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
    const month = String(gameDate.getMonth() + 1);
    const day = String(gameDate.getDate());
    const year = gameDate.getFullYear();

    return {
      eventId: String(event.id),
      eventUrl: `https://seatgeek.com/los-angeles-dodgers-tickets/${month}-${day}-${year}-los-angeles-california-dodger-stadium/mlb/${event.id}?quantity=2`,
    };
  } catch {
    return { eventId: null, eventUrl: null };
  }
}

async function scrapeWithScrapingBee(url: string): Promise<string> {
  if (!SCRAPINGBEE_API_KEY) return "";

  try {
    console.log("ScrapingBee fetching URL:", url);

    const scrapeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&wait=3000&extract_rules=${encodeURIComponent(JSON.stringify({
      "page_text": "body"
    }))}`;

    const res = await fetch(scrapeUrl);
    console.log("ScrapingBee response status:", res.status);

    if (!res.ok) {
      const errText = await res.text();
      console.error("ScrapingBee error body:", errText.slice(0, 500));
      return "";
    }

    const body = await res.json();
    console.log("ScrapingBee response keys:", Object.keys(body));
    console.log("ScrapingBee page_text length:", body?.page_text?.length || 0);
    console.log("ScrapingBee page_text preview:", body?.page_text?.slice(0, 200) || "empty");

    return body?.page_text || "";
  } catch (e) {
    console.error("ScrapingBee fetch error:", e);
    return "";
  }
}

async function extractPricesFromPage(pageText: string, game: any, apiKey: string): Promise<string> {
  if (!pageText) return "";

  // Truncate to avoid token limits — first 8000 chars usually has pricing data
  const truncated = pageText.slice(0, 8000);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Extract ticket prices from this SeatGeek page content for Dodgers vs ${game.opponent}. 
        
Find prices for Loge sections (128LG, 130LG, 126LG, 122LG, 124LG, 132LG, 134LG) and any general loge pricing.

Page content:
${truncated}

Reply ONLY with JSON, no markdown:
{
  "sections": {
    "128LG": <lowest price or null>,
    "130LG": <lowest price or null>,
    "126LG": <lowest price or null>,
    "122LG": <lowest price or null>,
    "loge_avg": <average loge price or null>,
    "loge_low": <lowest loge price or null>,
    "loge_high": <highest loge price or null>
  },
  "total_loge_listings": <number or null>,
  "data_found": <true or false>
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
    ? "GAME IS TODAY OR ALREADY STARTED — tickets expire worthless very soon, price extremely aggressively to move"
    : days === 1
    ? "GAME IS TOMORROW — drop 20-30% below comparable listings, must sell today"
    : days <= 3
    ? "GAME IN 2-3 DAYS — price at or below lowest comparable listing"
    : days <= 7
    ? "GAME THIS WEEK — price competitively, don't hold out"
    : "More than 7 days out — can afford to price near market";

  const prompt = `You are a ticket pricing analyst for Dodger Stadium season ticket holders.

Game: Dodgers vs ${game.opponent} | ${gameDate}
Urgency: ${urgency}
Seats: Section 128LG Loge Row L
My cost: $${game.purchase_cost || "unknown"} for 2 tickets
SeatGeek takes 10% seller fee

REAL SCRAPED MARKET DATA FROM SEATGEEK:
${marketData || "No market data found — be very conservative, assume heavy competition"}

STRICT PRICING RULES:
1. If market data shows Loge prices, recommend AT or BELOW the lowest comparable section
2. Weak opponents (Angels, Rays, Rockies, Brewers, Cardinals, Reds, Mariners, Royals, Pirates, Nationals) = price to SELL not maximize
3. Follow the urgency level above strictly
4. If no market data = assume $100-130 for weak opponents, $150-180 for average, $180-220 for premium
5. An unsold ticket = $0. Always better to sell at $80 than nothing

Reply ONLY with JSON, no markdown:
{"recommended_price":<number>,"price_low":<number>,"price_high":<number>,"confidence":"high"|"medium"|"low","action":"<specific: exact price, when to drop and by how much>","reasoning":"<cite actual prices from market data if available>","factors":{"team_form":"<brief>","opponent_demand":"<honest assessment>","supply":"<actual listings found>","timing":"<urgency>","seat_premium":"<honest loge premium>"},"market_avg":<number|null>,"market_listings":<number|null>}`;

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
  // Debug — check which keys are present
  console.log("ANTHROPIC key present:", !!apiKey);
  console.log("SCRAPINGBEE key present:", !!SCRAPINGBEE_API_KEY);
  console.log("SEATGEEK key present:", !!SEATGEEK_CLIENT_ID);

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
    // Step 1: Get SeatGeek event URL
    const { eventUrl } = await getSeatGeekEventUrl(game);

    // Step 2: Scrape real prices using ScrapingBee
    let pageText = "";
    let marketData = "";

    if (eventUrl && SCRAPINGBEE_API_KEY) {
      pageText = await scrapeWithScrapingBee(eventUrl);
      if (pageText) {
        marketData = await extractPricesFromPage(pageText, game, apiKey);
      }
    }

    // Step 3: Get AI recommendation with real data
    const { rec, usedModel } = await getAIPricingRecommendation(game, marketData, apiKey);

    const dataSource = pageText
      ? (usedModel.includes("haiku") ? "ai_haiku" : "seatgeek_ai")
      : (usedModel.includes("haiku") ? "ai_haiku" : "ai_only");

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
      hadPageData: !!pageText,
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
