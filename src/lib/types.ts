export type Disposition = "sell" | "keep" | "friends";
export type Tier = "premium" | "mid" | "low";
export type GameStatus = "available" | "pending" | "reserved";
export type ListingStatus = "listed" | "ended" | "sold" | "cancelled";
export type RequestStatus = "requested" | "confirmed" | "paid" | "tickets_sent" | "cancelled";

export type Listing = {
  id: string;
  platform: string;
  status: ListingStatus;
  listed_price: number | null;
  net_proceeds: number | null;
  listing_url: string | null;
  notes: string | null;
  listed_at: string | null;
  ended_at: string | null;
  sold_at: string | null;
};

export type ActiveRequest = {
  id: string;
  friend_name: string;
  friend_contact: string | null;
  status: RequestStatus;
  purpose: string;
  amount_due: number | null;
  amount_paid: number | null;
};

export type Game = {
  id: string;
  opponent: string;
  game_datetime: string;
  status: GameStatus;
  seat_info: string | null;
  price_total: number | null;
  purchase_cost: number | null;
  friend_price: number | null;
  notes: string | null;
  promotion_title: string | null;
  promotion_description: string | null;
  disposition: Disposition;
  tier: Tier;
  suggested_price: number | null;
  floor_price: number | null;
  is_listed_online: boolean;
  listed_platforms: string[];
  active_listings: Listing[];
  listings: Listing[];
  active_request_id: string | null;
  active_request: ActiveRequest | null;
};

export type Request = {
  id: string;
  status: RequestStatus;
  purpose: string;
  amount_due: number | null;
  amount_paid: number | null;
  friend_name: string;
  friend_contact: string | null;
  created_at: string;
  game_id: string;
  games: {
    id: string;
    opponent: string;
    game_datetime: string;
    seat_info: string | null;
    status: GameStatus;
    active_request_id: string | null;
  } | null;
};

export type MarketData = {
  gameId: string;
  avgPrice: number | null;
  lowestPrice: number | null;
  listingCount: number;
  fetchedAt: string;
  error?: string;
};

// Financial constants
export const SEASON_COST = 9466.02;
export const RECOVERY_GOAL_PCT = 0.60;
export const RECOVERY_GOAL = SEASON_COST * RECOVERY_GOAL_PCT;
export const SEATGEEK_FEE = 0.10;

// Tier pricing defaults
export const TIER_DEFAULTS: Record<Tier, { suggestedPrice: number; floorPrice: number }> = {
  premium: { suggestedPrice: 185, floorPrice: 150 },
  mid:     { suggestedPrice: 155, floorPrice: 130 },
  low:     { suggestedPrice: 125, floorPrice: 110 },
};

export const PLATFORMS = ["SeatGeek", "StubHub", "TickPick", "Ticketmaster", "Other"] as const;
