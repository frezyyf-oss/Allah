import type { DeviceFingerprint, TelegramSession } from "../types";


export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramWebAppInitDataUnsafe {
  user?: TelegramWebAppUser;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: TelegramWebAppInitDataUnsafe;
  platform?: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  ready(): void;
  expand(): void;
  sendData(data: string): void;
  close(): void;
}


declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}


function toCssVarName(key: string): string {
  return key.replace(/_/g, "-").toLowerCase();
}


function formatVersion(version: string | undefined): string {
  return version ? version.replace(/_/g, ".") : "unknown";
}


function cleanDevice(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }
  return value.replace(/\s+Build\/.+$/i, "").trim() || "unknown";
}


function parseDeviceFingerprint(userAgent: string, platform: string): DeviceFingerprint {
  const iosMatch = userAgent.match(/\b(iPhone|iPad|iPod)\b.*\bOS\s([\d_]+)/i);
  if (iosMatch) {
    return {
      device: iosMatch[1],
      os_name: iosMatch[1] === "iPad" ? "iPadOS" : "iOS",
      os_version: formatVersion(iosMatch[2]),
      platform,
      user_agent: userAgent,
    };
  }

  const androidMatch = userAgent.match(/Android\s([\d.]+);\s?([^;)]+)/i);
  if (androidMatch) {
    return {
      device: cleanDevice(androidMatch[2]),
      os_name: "Android",
      os_version: formatVersion(androidMatch[1]),
      platform,
      user_agent: userAgent,
    };
  }

  const windowsMatch = userAgent.match(/Windows NT\s([\d.]+)/i);
  if (windowsMatch) {
    return {
      device: "Windows PC",
      os_name: "Windows",
      os_version: formatVersion(windowsMatch[1]),
      platform,
      user_agent: userAgent,
    };
  }

  const macMatch = userAgent.match(/Mac OS X\s([\d_]+)/i);
  if (macMatch) {
    return {
      device: "Mac",
      os_name: "macOS",
      os_version: formatVersion(macMatch[1]),
      platform,
      user_agent: userAgent,
    };
  }

  return {
    device: platform || "unknown",
    os_name: "unknown",
    os_version: "unknown",
    platform,
    user_agent: userAgent,
  };
}


export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}


export function applyTelegramBridge(webApp: TelegramWebApp | null): void {
  if (!webApp) {
    return;
  }

  webApp.ready();
  webApp.expand();

  if (webApp.colorScheme) {
    document.documentElement.dataset.telegramScheme = webApp.colorScheme;
  }

  for (const [key, value] of Object.entries(webApp.themeParams ?? {})) {
    document.documentElement.style.setProperty(
      `--telegram-${toCssVarName(key)}`,
      value,
    );
  }
}


export function createLocalSession(webApp: TelegramWebApp | null): TelegramSession {
  const user = webApp?.initDataUnsafe.user;
  return {
    mode: "local",
    user: {
      id: user?.id ?? 0,
      first_name: user?.first_name ?? "Local Viewer",
      username: user?.username ?? null,
      language_code: user?.language_code ?? "ru",
      is_premium: user?.is_premium ?? false,
      auth_date: Math.floor(Date.now() / 1000),
    },
  };
}


export function shortenAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}


export function getDeviceFingerprint(webApp: TelegramWebApp | null): DeviceFingerprint {
  const userAgent = window.navigator.userAgent || "";
  const platform = webApp?.platform || window.navigator.platform || "unknown";
  return parseDeviceFingerprint(userAgent, platform);
}
