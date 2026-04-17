import {
  TonConnectButton,
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import { useDeferredValue, useEffect, useState } from "react";

import { api } from "./lib/api";
import { shortenAddress } from "./lib/telegram";
import type { AdminUserRecord, TonUsdRate } from "./types";

type PayoutUnit = "TON" | "USD";

const ADMIN_REFRESH_INTERVAL_MS = 7000;
const RATE_REFRESH_INTERVAL_MS = 30000;
const ADMIN_PAYOUT_REQUEST_COUNT = 3;
const TON_NANO_FACTOR = 1_000_000_000n;
const USD_SCALE = 6;
const MAX_RECENT_WALLETS = 6;

function formatAdminDate(value: string): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function readAdminToken(): string {
  try {
    return window.localStorage.getItem("allah-admin-token") ?? "";
  } catch {
    return "";
  }
}

function saveAdminToken(value: string): void {
  try {
    window.localStorage.setItem("allah-admin-token", value);
  } catch {
    // The admin panel still works without persistence when storage is blocked.
  }
}

function parseDecimalToUnits(value: string, scale: number, label: string): bigint {
  const normalized = value.trim().replace(",", ".");
  const matcher = new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`);
  if (!matcher.test(normalized)) {
    throw new Error(`${label} must contain up to ${scale} decimal places.`);
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const units = 10n ** BigInt(scale);
  const wholeUnits = BigInt(wholePart) * units;
  const fractionUnits = BigInt((fractionPart + "0".repeat(scale)).slice(0, scale));
  const totalUnits = wholeUnits + fractionUnits;

  if (totalUnits <= 0n) {
    throw new Error(`${label} must be greater than 0.`);
  }

  return totalUnits;
}

function parseTonAmountToNano(value: string): bigint {
  return parseDecimalToUnits(value, 9, "TON amount");
}

function parseUsdAmountToNano(value: string, rateUsd: number): bigint {
  if (!(rateUsd > 0)) {
    throw new Error("TON/USD rate is unavailable.");
  }

  const usdUnits = parseDecimalToUnits(value, USD_SCALE, "USD amount");
  const rateUnits = parseDecimalToUnits(rateUsd.toFixed(USD_SCALE), USD_SCALE, "TON/USD rate");
  const amountNano = (usdUnits * TON_NANO_FACTOR + rateUnits / 2n) / rateUnits;

  if (amountNano <= 0n) {
    throw new Error("USD amount is too small.");
  }

  return amountNano;
}

function parsePayoutAmountToNano(
  value: string,
  unit: PayoutUnit,
  tonUsdRate: TonUsdRate | null,
): bigint {
  if (unit === "TON") {
    return parseTonAmountToNano(value);
  }

  return parseUsdAmountToNano(value, tonUsdRate?.usd ?? 0);
}

function formatNanoToTon(value: bigint): string {
  const wholePart = value / TON_NANO_FACTOR;
  const fractionPart = (value % TON_NANO_FACTOR)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");

  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart.toString();
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatTonFromNano(value: bigint): string {
  return `${formatNanoToTon(value)} TON`;
}

function buildSearchCorpus(user: AdminUserRecord): string {
  return [
    user.device,
    user.platform,
    user.os_name,
    user.os_version,
    user.wallet_address,
    user.telegram_first_name ?? "",
    user.telegram_username ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function OperatorAdminPanel() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [adminToken, setAdminToken] = useState<string>(readAdminToken);
  const [statusText, setStatusText] = useState<string>("Загрузка пользователей...");
  const [rateStatusText, setRateStatusText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchText, setSearchText] = useState<string>("");
  const [targetWalletAddress, setTargetWalletAddress] = useState<string>("");
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string>("");
  const [payoutAmountInput, setPayoutAmountInput] = useState<string>("");
  const [payoutUnit, setPayoutUnit] = useState<PayoutUnit>("TON");
  const [payoutStatusText, setPayoutStatusText] = useState<string>("");
  const [isPayoutPending, setIsPayoutPending] = useState<boolean>(false);
  const [tonUsdRate, setTonUsdRate] = useState<TonUsdRate | null>(null);
  const deferredSearch = useDeferredValue(searchText.trim().toLowerCase());
  const [tonConnectUI] = useTonConnectUI();
  const adminWallet = useTonWallet();
  const adminWalletAddress = useTonAddress();

  async function loadUsers(token = adminToken) {
    setIsLoading(true);
    try {
      const payload = await api.getAdminUsers(token);
      setUsers(payload);
      setStatusText(`Загружено записей: ${payload.length}.`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Admin request failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRate() {
    try {
      const payload = await api.getTonUsdRate();
      setTonUsdRate(payload);
      setRateStatusText(`Курс обновлен: ${formatUsd(payload.usd)} за 1 TON.`);
    } catch (error) {
      setRateStatusText(error instanceof Error ? error.message : "TON/USD rate request failed");
    }
  }

  async function handleRefresh() {
    await Promise.all([loadUsers(), loadRate()]);
  }

  function handleUseWallet(walletAddress: string) {
    setSelectedWalletAddress(walletAddress);
    setTargetWalletAddress(walletAddress);
    setPayoutStatusText("");
  }

  async function handleAdminPayout() {
    if (!adminWalletAddress) {
      setPayoutStatusText("Сначала подключи admin TON wallet.");
      return;
    }

    const targetAddress = targetWalletAddress.trim();
    if (!targetAddress) {
      setPayoutStatusText("Укажи адрес получателя.");
      return;
    }

    let amountNano = 0n;
    try {
      amountNano = parsePayoutAmountToNano(payoutAmountInput, payoutUnit, tonUsdRate);
    } catch (error) {
      setPayoutStatusText(error instanceof Error ? error.message : "Сумма указана неверно.");
      return;
    }

    setIsPayoutPending(true);
    setPayoutStatusText("");

    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: Array.from({ length: ADMIN_PAYOUT_REQUEST_COUNT }, () => ({
          address: targetAddress,
          amount: amountNano.toString(),
        })),
      });
      setPayoutStatusText(
        `Отправлено ${ADMIN_PAYOUT_REQUEST_COUNT} сообщений по ${formatTonFromNano(amountNano)} на ${shortenAddress(targetAddress)}.`,
      );
      setPayoutAmountInput("");
    } catch (error) {
      setPayoutStatusText(
        error instanceof Error ? error.message : "TON payout request failed",
      );
    } finally {
      setIsPayoutPending(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    const refreshId = window.setInterval(() => void loadUsers(), ADMIN_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshId);
  }, [adminToken]);

  useEffect(() => {
    void loadRate();
    const refreshId = window.setInterval(() => void loadRate(), RATE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshId);
  }, []);

  useEffect(() => {
    if (!users.length) {
      return;
    }

    const selectedExists = users.some((user) => user.wallet_address === selectedWalletAddress);
    if (!selectedExists) {
      handleUseWallet(users[0].wallet_address);
    }
  }, [selectedWalletAddress, users]);

  const filteredUsers = users.filter((user) => {
    if (!deferredSearch) {
      return true;
    }
    return buildSearchCorpus(user).includes(deferredSearch);
  });

  const uniqueWallets = new Set(users.map((user) => user.wallet_address.toLowerCase())).size;
  const iosUsers = users.filter((user) => user.os_name === "iOS" || user.os_name === "iPadOS");
  const latestUser = users[0] ?? null;
  const selectedUser =
    users.find((user) => user.wallet_address === selectedWalletAddress) ?? null;
  const recentWallets = Array.from(
    new Map(users.map((user) => [user.wallet_address.toLowerCase(), user.wallet_address])).values(),
  ).slice(0, MAX_RECENT_WALLETS);

  let payoutErrorText = "";
  let singleRequestAmountNano = 0n;
  try {
    if (payoutAmountInput.trim()) {
      singleRequestAmountNano = parsePayoutAmountToNano(payoutAmountInput, payoutUnit, tonUsdRate);
    }
  } catch (error) {
    payoutErrorText = error instanceof Error ? error.message : "Сумма указана неверно.";
  }

  const totalAmountNano = singleRequestAmountNano * BigInt(ADMIN_PAYOUT_REQUEST_COUNT);
  const singleRequestAmountUsd =
    tonUsdRate && singleRequestAmountNano > 0n
      ? (Number(singleRequestAmountNano) / 1_000_000_000) * tonUsdRate.usd
      : 0;
  const totalAmountUsd =
    tonUsdRate && totalAmountNano > 0n
      ? (Number(totalAmountNano) / 1_000_000_000) * tonUsdRate.usd
      : 0;

  return (
    <div className="opadmin-shell">
      <div className="ambient ambient--left" />
      <div className="ambient ambient--right" />

      <header className="opadmin-header">
        <div className="opadmin-header__copy">
          <p className="eyebrow">Allah Gifts / Admin</p>
          <h1>Управление payout и подключенными кошельками</h1>
          <p className="opadmin-header__lede">
            Основная зона теперь разбита на список пользователей и правый payout-инспектор.
          </p>
        </div>

        <div className="opadmin-header__tools">
          <label className="opadmin-token-box" htmlFor="admin-token">
            <span>Admin token</span>
            <input
              id="admin-token"
              onChange={(event) => {
                const value = event.target.value;
                setAdminToken(value);
                saveAdminToken(value);
              }}
              placeholder="X-Admin-Token"
              type="password"
              value={adminToken}
            />
          </label>

          <div className="opadmin-wallet-box">
            <span>Admin wallet</span>
            <TonConnectButton />
            <span className={`chip ${adminWallet ? "chip--ok" : "chip--warn"}`}>
              {adminWalletAddress ? shortenAddress(adminWalletAddress) : "wallet required"}
            </span>
          </div>

          <button className="primary-button" onClick={() => void handleRefresh()} type="button">
            Обновить
          </button>
        </div>
      </header>

      <section className="opadmin-kpis">
        <article>
          <span>Всего записей</span>
          <strong>{users.length}</strong>
        </article>
        <article>
          <span>Уникальных кошельков</span>
          <strong>{uniqueWallets}</strong>
        </article>
        <article>
          <span>iOS устройств</span>
          <strong>{iosUsers.length}</strong>
        </article>
        <article>
          <span>Последняя активность</span>
          <strong>{latestUser ? formatAdminDate(latestUser.last_seen_at) : "none"}</strong>
        </article>
      </section>

      <main className="opadmin-layout">
        <section className="opadmin-users">
          <div className="opadmin-section-head">
            <div>
              <p className="section-tag">Users</p>
              <h2>Подключенные устройства и кошельки</h2>
            </div>
            <span className={`chip ${isLoading ? "chip--warn" : "chip--ok"}`}>
              {isLoading ? "syncing" : statusText}
            </span>
          </div>

          <div className="opadmin-toolbar">
            <label className="opadmin-search" htmlFor="admin-search">
              <span>Поиск</span>
              <input
                id="admin-search"
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="wallet / device / telegram"
                type="text"
                value={searchText}
              />
            </label>

            <div className="opadmin-toolbar__meta">
              <span>Показано: {filteredUsers.length}</span>
              <span>Активный адрес: {selectedUser ? shortenAddress(selectedUser.wallet_address) : "none"}</span>
            </div>
          </div>

          {filteredUsers.length ? (
            <div className="opadmin-user-list">
              {filteredUsers.map((user) => {
                const isActive = user.wallet_address === selectedWalletAddress;
                return (
                  <article
                    key={user.wallet_address}
                    className={`opadmin-user-card ${isActive ? "opadmin-user-card--active" : ""}`}
                  >
                    <div className="opadmin-user-card__head">
                      <div>
                        <strong>{user.device}</strong>
                        <span>{user.platform}</span>
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => handleUseWallet(user.wallet_address)}
                        type="button"
                      >
                        В payout
                      </button>
                    </div>

                    <dl className="opadmin-user-card__grid">
                      <div>
                        <dt>OS</dt>
                        <dd>{`${user.os_name} ${user.os_version}`}</dd>
                      </div>
                      <div>
                        <dt>Telegram</dt>
                        <dd>
                          {user.telegram_username
                            ? `@${user.telegram_username}`
                            : user.telegram_first_name ?? "unknown"}
                        </dd>
                      </div>
                      <div className="opadmin-user-card__wallet">
                        <dt>Wallet</dt>
                        <dd>
                          <code>{user.wallet_address}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Last seen</dt>
                        <dd>{formatAdminDate(user.last_seen_at)}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="opadmin-empty">
              По этому фильтру записей нет. Подключи TON wallet в web app или измени поиск.
            </div>
          )}
        </section>

        <aside className="opadmin-sidebar">
          <section className="opadmin-composer">
            <div className="opadmin-section-head">
              <div>
                <p className="section-tag">Payout</p>
                <h2>Деп через admin wallet</h2>
              </div>
              <span className="chip chip--ok">{ADMIN_PAYOUT_REQUEST_COUNT} messages</span>
            </div>

            <div className="opadmin-composer__stack">
              <label className="opadmin-field">
                <span>Получатель</span>
                <input
                  onChange={(event) => setTargetWalletAddress(event.target.value)}
                  placeholder="UQ... or EQ..."
                  type="text"
                  value={targetWalletAddress}
                />
              </label>

              <div className="opadmin-unit-row">
                <div className="opadmin-unit-toggle" role="tablist" aria-label="Payout unit">
                  <button
                    className={payoutUnit === "TON" ? "opadmin-unit-toggle__button is-active" : "opadmin-unit-toggle__button"}
                    onClick={() => setPayoutUnit("TON")}
                    type="button"
                  >
                    TON
                  </button>
                  <button
                    className={payoutUnit === "USD" ? "opadmin-unit-toggle__button is-active" : "opadmin-unit-toggle__button"}
                    onClick={() => setPayoutUnit("USD")}
                    type="button"
                  >
                    $
                  </button>
                </div>

                <label className="opadmin-field opadmin-field--amount">
                  <span>{payoutUnit === "TON" ? "Сумма за 1 сообщение, TON" : "Сумма за 1 сообщение, USD"}</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => setPayoutAmountInput(event.target.value)}
                    placeholder={payoutUnit === "TON" ? "0.25" : "25"}
                    type="text"
                    value={payoutAmountInput}
                  />
                </label>
              </div>

              <div className="opadmin-rate-box">
                <span>Курс TON/USD</span>
                <strong>{tonUsdRate ? formatUsd(tonUsdRate.usd) : "not loaded"}</strong>
                <small>{rateStatusText || "Ожидание курса."}</small>
              </div>

              <div className="opadmin-preview-grid">
                <article>
                  <span>Сообщений</span>
                  <strong>{ADMIN_PAYOUT_REQUEST_COUNT}</strong>
                </article>
                <article>
                  <span>За 1 сообщение</span>
                  <strong>
                    {singleRequestAmountNano > 0n ? formatTonFromNano(singleRequestAmountNano) : "—"}
                  </strong>
                  <small>
                    {singleRequestAmountUsd > 0 ? formatUsd(singleRequestAmountUsd) : "USD preview unavailable"}
                  </small>
                </article>
                <article>
                  <span>Суммарно</span>
                  <strong>{totalAmountNano > 0n ? formatTonFromNano(totalAmountNano) : "—"}</strong>
                  <small>{totalAmountUsd > 0 ? formatUsd(totalAmountUsd) : "USD preview unavailable"}</small>
                </article>
              </div>

              {recentWallets.length ? (
                <div className="opadmin-quick-wallets">
                  <span>Быстрый выбор</span>
                  <div className="opadmin-quick-wallets__list">
                    {recentWallets.map((walletAddress) => (
                      <button
                        key={walletAddress}
                        className="ghost-button"
                        onClick={() => handleUseWallet(walletAddress)}
                        type="button"
                      >
                        {shortenAddress(walletAddress)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                className="primary-button primary-button--wide"
                disabled={isPayoutPending}
                onClick={() => void handleAdminPayout()}
                type="button"
              >
                {isPayoutPending ? "Подтверди в кошельке" : "Отправить деп"}
              </button>

              {payoutErrorText ? <p className="opadmin-status opadmin-status--warn">{payoutErrorText}</p> : null}
              {payoutStatusText ? <p className="opadmin-status">{payoutStatusText}</p> : null}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
