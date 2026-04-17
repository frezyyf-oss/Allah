import type {
  AdminUserRecord,
  CheckoutPreview,
  DeviceFingerprint,
  GiftItem,
  HealthResponse,
  RouletteConfig,
  RouletteSpinResult,
  TelegramSessionUser,
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

  registerUser(
    walletAddress: string,
    fingerprint: DeviceFingerprint,
    user?: TelegramSessionUser,
  ): Promise<AdminUserRecord> {
    return requestJson<AdminUserRecord>("/api/users/register", {
      method: "POST",
      body: JSON.stringify({
        wallet_address: walletAddress,
        device: fingerprint.device,
        os_name: fingerprint.os_name,
        os_version: fingerprint.os_version,
        platform: fingerprint.platform,
        user_agent: fingerprint.user_agent,
        telegram_user_id: user?.id ?? null,
        telegram_username: user?.username ?? null,
        telegram_first_name: user?.first_name ?? null,
      }),
    });
  },

  getAdminUsers(adminToken: string): Promise<AdminUserRecord[]> {
    return requestJson<AdminUserRecord[]>("/api/admin/users", {
      headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    });
  },
};
