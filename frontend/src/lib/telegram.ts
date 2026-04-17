import type { TelegramSession } from "../types";


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
