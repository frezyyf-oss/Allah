import type {
  CheckoutPreview,
  GiftItem,
  HealthResponse,
  RouletteConfig,
  RouletteSpinResult,
  TelegramSession,
} from "../types";


export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";


async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}


export const api = {
  getHealth(): Promise<HealthResponse> {
    return requestJson<HealthResponse>("/api/health");
  },

  getCatalog(): Promise<GiftItem[]> {
    return requestJson<GiftItem[]>("/api/catalog");
  },

  getRoulette(): Promise<RouletteConfig> {
    return requestJson<RouletteConfig>("/api/roulette");
  },

  authTelegram(initData: string): Promise<TelegramSession> {
    return requestJson<TelegramSession>("/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ init_data: initData }),
    });
  },

  prepareOrder(giftId: string, walletAddress: string): Promise<CheckoutPreview> {
    return requestJson<CheckoutPreview>("/api/orders/prepare", {
      method: "POST",
      body: JSON.stringify({
        gift_id: giftId,
        wallet_address: walletAddress,
      }),
    });
  },

  spinRoulette(walletAddress: string): Promise<RouletteSpinResult> {
    return requestJson<RouletteSpinResult>("/api/roulette/spin", {
      method: "POST",
      body: JSON.stringify({ wallet_address: walletAddress }),
    });
  },
};
