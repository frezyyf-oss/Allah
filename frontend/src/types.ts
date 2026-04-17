export interface GiftItem {
  id: string;
  title: string;
  strapline: string;
  price_ton: string;
  price_nano: string;
  rarity: string;
  remaining: number;
  delivery: string;
  accent: string;
  background: string;
  highlight: string;
  note: string;
}

export interface RouletteSegment {
  id: string;
  label: string;
  reward_title: string;
  reward_note: string;
  accent: string;
  weight: number;
}

export interface RouletteConfig {
  spin_cost_ton: string;
  spin_cost_nano: string;
  segments: RouletteSegment[];
}

export interface RouletteSpinResult {
  spin_id: string;
  landed_segment_id: string;
  landed_index: number;
  reward_title: string;
  reward_note: string;
  spin_cost_ton: string;
  spin_cost_nano: string;
}

export interface CheckoutPreview {
  order_id: string;
  merchant_address: string;
  amount_ton: string;
  amount_nano: string;
  valid_until: number;
  gift_id: string;
}

export interface HealthResponse {
  status: string;
  bot_enabled: boolean;
  telegram_ready_url: string;
}

export interface TelegramSessionUser {
  id: number;
  first_name: string;
  username?: string | null;
  language_code?: string | null;
  is_premium: boolean;
  auth_date: number;
}

export interface TelegramSession {
  mode: "telegram" | "local";
  user: TelegramSessionUser;
}
