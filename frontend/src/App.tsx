import {
  TonConnectButton,
  useIsConnectionRestored,
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import { useEffect, useState, type CSSProperties } from "react";

import { api } from "./lib/api";
import {
  applyTelegramBridge,
  createLocalSession,
  getDeviceFingerprint,
  getTelegramWebApp,
  shortenAddress,
} from "./lib/telegram";
import type {
  AdminUserRecord,
  GiftItem,
  HealthResponse,
  RouletteConfig,
  RouletteSpinResult,
  TelegramSession,
} from "./types";
import { OperatorAdminPanel } from "./OperatorAdminPanel";


function isAdminRoute(): boolean {
  const normalizedPath = window.location.pathname.replace(/\/$/, "");
  return normalizedPath === "/admin" || normalizedPath.endsWith("/admin");
}


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


function parseTonAmountToNano(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,9})?$/.test(normalized)) {
    throw new Error("Amount must be a TON value with up to 9 decimals.");
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const wholeNano = BigInt(wholePart) * 1_000_000_000n;
  const fractionNano = BigInt((fractionPart + "000000000").slice(0, 9));
  const amountNano = wholeNano + fractionNano;

  if (amountNano <= 0n) {
    throw new Error("Amount must be greater than 0 TON.");
  }

  return amountNano.toString();
}


function AdminPanel() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [adminToken, setAdminToken] = useState<string>(readAdminToken);
  const [statusText, setStatusText] = useState<string>("Loading users...");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDepositOpen, setIsDepositOpen] = useState<boolean>(false);
  const [depositWalletAddress, setDepositWalletAddress] = useState<string>("");
  const [depositAmountTon, setDepositAmountTon] = useState<string>("");
  const [depositStatusText, setDepositStatusText] = useState<string>("");
  const [isDepositPending, setIsDepositPending] = useState<boolean>(false);
  const [tonConnectUI] = useTonConnectUI();
  const adminWallet = useTonWallet();
  const adminWalletAddress = useTonAddress();

  async function loadUsers(token = adminToken) {
    setIsLoading(true);
    try {
      const payload = await api.getAdminUsers(token);
      setUsers(payload);
      setStatusText(`Loaded ${payload.length} user records.`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Admin request failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAdminPayout() {
    if (!adminWalletAddress) {
      setDepositStatusText("Connect an admin TON wallet first.");
      return;
    }

    const targetAddress = depositWalletAddress.trim();
    if (!targetAddress) {
      setDepositStatusText("Recipient wallet address is required.");
      return;
    }

    let amountNano = "";
    try {
      amountNano = parseTonAmountToNano(depositAmountTon);
    } catch (error) {
      setDepositStatusText(error instanceof Error ? error.message : "Amount is invalid.");
      return;
    }

    setIsDepositPending(true);
    setDepositStatusText("");

    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: targetAddress,
            amount: amountNano,
          },
        ],
      });
      setDepositStatusText(
        `Transaction request sent: ${depositAmountTon.trim()} TON -> ${shortenAddress(targetAddress)}.`,
      );
      setDepositAmountTon("");
    } catch (error) {
      setDepositStatusText(
        error instanceof Error ? error.message : "TON payout request failed",
      );
    } finally {
      setIsDepositPending(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    const refreshId = window.setInterval(() => void loadUsers(), 7000);
    return () => window.clearInterval(refreshId);
  }, [adminToken]);

  const iosUsers = users.filter((user) => user.os_name === "iOS" || user.os_name === "iPadOS");
  const uniqueWallets = new Set(users.map((user) => user.wallet_address.toLowerCase())).size;
  const latestUser = users[0] ?? null;

  return (
    <div className="admin-shell">
      <div className="ambient ambient--left" />
      <div className="ambient ambient--right" />

      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Allah Gifts / Admin</p>
          <h1>User wallet monitor</h1>
          <p className="admin-copy">
            Rows appear after a visitor connects a TON wallet in the Mini App.
          </p>
        </div>

        <div className="admin-controls">
          <div className="admin-token-box">
            <label htmlFor="admin-token">Admin token</label>
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
            <button onClick={() => void loadUsers()} type="button">
              Refresh
            </button>
          </div>

          <div className="admin-deposit-rail">
            <div className="admin-wallet-box">
              <span className="admin-wallet-box__label">Admin wallet</span>
              <TonConnectButton />
              <span className={`chip ${adminWallet ? "chip--ok" : "chip--warn"}`}>
                {adminWalletAddress ? shortenAddress(adminWalletAddress) : "wallet required"}
              </span>
            </div>

            <button
              className="primary-button admin-deposit-toggle"
              onClick={() => setIsDepositOpen((current) => !current)}
              type="button"
            >
              Деп
            </button>
          </div>
        </div>
      </header>

      <main className="admin-workspace">
        {isDepositOpen ? (
          <section className="admin-deposit-card">
            <div className="admin-panel__head">
              <div>
                <p className="section-tag">Admin payout</p>
                <h2>Send TON from connected wallet</h2>
              </div>
              <span className={`chip ${isDepositPending ? "chip--warn" : "chip--ok"}`}>
                {isDepositPending ? "awaiting wallet" : "ready"}
              </span>
            </div>

            <div className="admin-deposit-form">
              <label className="admin-field">
                <span>Recipient wallet</span>
                <input
                  onChange={(event) => setDepositWalletAddress(event.target.value)}
                  placeholder="UQ... or EQ..."
                  type="text"
                  value={depositWalletAddress}
                />
              </label>

              <label className="admin-field">
                <span>Amount TON</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setDepositAmountTon(event.target.value)}
                  placeholder="0.25"
                  type="text"
                  value={depositAmountTon}
                />
              </label>

              <button
                className="primary-button"
                disabled={isDepositPending}
                onClick={() => void handleAdminPayout()}
                type="button"
              >
                {isDepositPending ? "Confirm in wallet" : "Send TON"}
              </button>
            </div>

            {depositStatusText ? <p className="admin-deposit-status">{depositStatusText}</p> : null}
          </section>
        ) : null}

        <section className="admin-metrics">
          <article>
            <span>Total rows</span>
            <strong>{users.length}</strong>
          </article>
          <article>
            <span>Unique wallets</span>
            <strong>{uniqueWallets}</strong>
          </article>
          <article>
            <span>iOS clients</span>
            <strong>{iosUsers.length}</strong>
          </article>
          <article>
            <span>Last seen</span>
            <strong>{latestUser ? formatAdminDate(latestUser.last_seen_at) : "none"}</strong>
          </article>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <p className="section-tag">Registered users</p>
              <h2>Devices and TON wallets</h2>
            </div>
            <span className={`chip ${isLoading ? "chip--warn" : "chip--ok"}`}>
              {isLoading ? "syncing" : statusText}
            </span>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>OS</th>
                  <th>TON wallet</th>
                  <th>Telegram</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.wallet_address}>
                    <td>
                      <strong>{user.device}</strong>
                      <span>{user.platform}</span>
                    </td>
                    <td>
                      <strong>{user.os_name}</strong>
                      <span>{user.os_version}</span>
                    </td>
                    <td>
                      <code>{user.wallet_address}</code>
                    </td>
                    <td>
                      <strong>{user.telegram_first_name ?? "unknown"}</strong>
                      <span>{user.telegram_username ? `@${user.telegram_username}` : "no username"}</span>
                    </td>
                    <td>{formatAdminDate(user.last_seen_at)}</td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="admin-empty">
                        No users captured yet. Connect a TON wallet in the store first.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}


function StorefrontApp() {
  const [catalog, setCatalog] = useState<GiftItem[]>([]);
  const [roulette, setRoulette] = useState<RouletteConfig | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [session, setSession] = useState<TelegramSession | null>(null);
  const [selectedGiftId, setSelectedGiftId] = useState<string>("");
  const [activityText, setActivityText] = useState<string>(
    "Подключи кошелек, чтобы открыть витрину и рулетку.",
  );
  const [errorText, setErrorText] = useState<string>("");
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);
  const [buyingGiftId, setBuyingGiftId] = useState<string>("");
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [spinRotation, setSpinRotation] = useState<number>(0);
  const [spinResult, setSpinResult] = useState<RouletteSpinResult | null>(null);
  const [lastRegisteredWallet, setLastRegisteredWallet] = useState<string>("");
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const walletAddress = useTonAddress();
  const connectionRestored = useIsConnectionRestored();
  const webApp = getTelegramWebApp();

  const actionsLocked = walletAddress.length === 0;
  const selectedGift =
    catalog.find((gift) => gift.id === selectedGiftId) ?? catalog[0] ?? null;

  useEffect(() => {
    applyTelegramBridge(webApp);

    async function bootstrap() {
      setIsBootstrapping(true);
      setErrorText("");

      try {
        const [healthPayload, catalogPayload, roulettePayload] = await Promise.all([
          api.getHealth(),
          api.getCatalog(),
          api.getRoulette(),
        ]);

        setHealth(healthPayload);
        setCatalog(catalogPayload);
        setRoulette(roulettePayload);
        if (catalogPayload[0]) {
          setSelectedGiftId(catalogPayload[0].id);
        }

        if (webApp?.initData) {
          try {
            const telegramSession = await api.authTelegram(webApp.initData);
            setSession(telegramSession);
          } catch (telegramError) {
            setSession(createLocalSession(webApp));
            setErrorText(
              telegramError instanceof Error
                ? telegramError.message
                : "Telegram auth failed",
            );
          }
        } else {
          setSession(createLocalSession(webApp));
        }
      } catch (error) {
        setErrorText(
          error instanceof Error ? error.message : "Bootstrap request failed",
        );
      } finally {
        setIsBootstrapping(false);
      }
    }

    void bootstrap();
  }, [webApp]);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }
    setActivityText(`Кошелек ${shortenAddress(walletAddress)} подключен.`);
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress || walletAddress === lastRegisteredWallet) {
      return;
    }

    setLastRegisteredWallet(walletAddress);
    void api.registerUser(
      walletAddress,
      getDeviceFingerprint(webApp),
      session?.user,
    ).catch((error) => {
      setErrorText(error instanceof Error ? error.message : "User register failed");
    });
  }, [lastRegisteredWallet, session, walletAddress, webApp]);

  async function handleBuyGift(gift: GiftItem) {
    if (actionsLocked) {
      setActivityText("Сначала подключи TON-кошелек.");
      return;
    }

    setBuyingGiftId(gift.id);
    setSelectedGiftId(gift.id);
    setErrorText("");

    try {
      const preview = await api.prepareOrder(gift.id, walletAddress);
      await tonConnectUI.sendTransaction({
        validUntil: preview.valid_until,
        from: walletAddress,
        messages: [
          {
            address: preview.merchant_address,
            amount: preview.amount_nano,
          },
        ],
      });
      setActivityText(
        `Оплата по заказу ${preview.order_id} отправлена. Лот ${gift.title} помечен к выдаче.`,
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "TON payment request failed",
      );
    } finally {
      setBuyingGiftId("");
    }
  }

  async function handleSpinRoulette() {
    if (actionsLocked || !roulette) {
      setActivityText("Подключи кошелек перед запуском рулетки.");
      return;
    }

    setErrorText("");
    setIsSpinning(true);
    setSpinResult(null);

    try {
      const result = await api.spinRoulette(walletAddress);
      const segmentSize = 360 / roulette.segments.length;
      const centerAngle = result.landed_index * segmentSize + segmentSize / 2;
      const landingRotation = 360 - centerAngle;

      setSpinRotation((previousRotation) => previousRotation + 2160 + landingRotation);

      window.setTimeout(() => {
        setSpinResult(result);
        setActivityText(`Рулетка выдала: ${result.reward_title}.`);
        setIsSpinning(false);
      }, 4200);
    } catch (error) {
      setIsSpinning(false);
      setErrorText(
        error instanceof Error ? error.message : "Roulette request failed",
      );
    }
  }

  function handleShareGift() {
    if (!webApp || !selectedGift) {
      setActivityText("Telegram WebApp context недоступен.");
      return;
    }

    try {
      webApp.sendData(
        JSON.stringify({
          type: "gift_pick",
          giftId: selectedGift.id,
          wallet: walletAddress || "not_connected",
        }),
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "sendData is unavailable",
      );
    }
  }

  function handleShareSpin() {
    if (!webApp || !spinResult) {
      setActivityText("Нет результата рулетки для отправки.");
      return;
    }

    try {
      webApp.sendData(
        JSON.stringify({
          type: "roulette_result",
          rewardTitle: spinResult.reward_title,
        }),
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "sendData is unavailable",
      );
    }
  }

  const wheelBackground = roulette
    ? `conic-gradient(${roulette.segments
        .map((segment, index) => {
          const segmentSize = 360 / roulette.segments.length;
          const start = index * segmentSize;
          const finish = start + segmentSize;
          return `${segment.accent} ${start}deg ${finish}deg`;
        })
        .join(", ")})`
    : undefined;

  return (
    <div className="shell">
      <div className="ambient ambient--left" />
      <div className="ambient ambient--right" />

      <header className="masthead">
        <div className="masthead__copy">
          <p className="eyebrow">Allah Gifts / Telegram Mini App</p>
          <h1>Витрина подарков, рулетка и Tonkeeper в одном web app.</h1>
          <p className="lede">
            UI собран под Telegram Mini Apps, действия закрыты до подключения
            TON-кошелька, а бот готов принимать события из web app через
            <code> sendData </code>.
          </p>
        </div>

        <div className="masthead__actions">
          <div className="connect-box">
            <span className="connect-box__label">TON Connect</span>
            <TonConnectButton />
          </div>

          <div className="status-stack">
            <span className={`chip ${connectionRestored ? "chip--ok" : ""}`}>
              {connectionRestored ? "session restored" : "session restoring"}
            </span>
            <span className={`chip ${actionsLocked ? "chip--warn" : "chip--ok"}`}>
              {actionsLocked ? "wallet required" : shortenAddress(walletAddress)}
            </span>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero__pane">
          <p className="section-tag">Control rail</p>
          <div className="hero__metrics">
            <article>
              <span>mode</span>
              <strong>{session?.mode ?? "loading"}</strong>
            </article>
            <article>
              <span>user</span>
              <strong>{session?.user.first_name ?? "..."}</strong>
            </article>
            <article>
              <span>backend</span>
              <strong>{health?.status ?? "..."}</strong>
            </article>
            <article>
              <span>telegram url</span>
              <strong>{health?.telegram_ready_url || "not set"}</strong>
            </article>
          </div>
          <p className="activity">{activityText}</p>
          {errorText ? <p className="error-line">{errorText}</p> : null}
        </div>

        <div className="hero__poster">
          <div className="poster__orbit" />
          <div className="poster__panel">
            <span className="poster__label">Wallet gate</span>
            <h2>{actionsLocked ? "Сначала Tonkeeper." : "Действия открыты."}</h2>
            <p>
              {actionsLocked
                ? "Кнопки покупки и рулетки отключены до появления адреса в useTonAddress()."
                : "После подключения доступны оплата лота и запуск рулетки."}
            </p>
            <div className="poster__footer">
              <span>{wallet ? "wallet attached" : "wallet not attached"}</span>
              <span>{health?.bot_enabled ? "bot enabled" : "bot token missing"}</span>
            </div>
          </div>
        </div>
      </section>

      <main className="workspace">
        <section className="panel panel--catalog">
          <div className="panel__head">
            <div>
              <p className="section-tag">Gift store</p>
              <h2>Каталог лотов</h2>
            </div>
            <button
              className="ghost-button"
              disabled={!selectedGift || !webApp}
              onClick={handleShareGift}
              type="button"
            >
              Отправить выбор боту
            </button>
          </div>

          <div className="gift-grid">
            {catalog.map((gift) => (
              <article
                key={gift.id}
                className={`gift-tile ${selectedGiftId === gift.id ? "gift-tile--active" : ""}`}
                style={
                  {
                    "--tile-accent": gift.accent,
                    "--tile-background": gift.background,
                    "--tile-highlight": gift.highlight,
                  } as CSSProperties
                }
              >
                <div className="gift-tile__topline">
                  <span>{gift.rarity}</span>
                  <span>{gift.remaining} left</span>
                </div>

                <div className="gift-tile__body">
                  <h3>{gift.title}</h3>
                  <p>{gift.strapline}</p>
                  <small>{gift.note}</small>
                </div>

                <div className="gift-tile__meta">
                  <div>
                    <span>price</span>
                    <strong>{gift.price_ton} TON</strong>
                  </div>
                  <div>
                    <span>delivery</span>
                    <strong>{gift.delivery}</strong>
                  </div>
                </div>

                <div className="gift-tile__actions">
                  <button
                    className="primary-button"
                    disabled={actionsLocked || buyingGiftId === gift.id}
                    onClick={() => void handleBuyGift(gift)}
                    type="button"
                  >
                    {buyingGiftId === gift.id ? "Ожидание Tonkeeper" : "Купить лот"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setSelectedGiftId(gift.id)}
                    type="button"
                  >
                    Выбрать
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel--roulette">
          <div className="panel__head">
            <div>
              <p className="section-tag">Roulette</p>
              <h2>Рулетка наград</h2>
            </div>
            <button
              className="ghost-button"
              disabled={!spinResult || !webApp}
              onClick={handleShareSpin}
              type="button"
            >
              Отправить результат боту
            </button>
          </div>

          <div className="roulette-layout">
            <div className="wheel-stage">
              <div className="wheel-pointer" />
              <div
                className={`wheel ${isSpinning ? "wheel--spinning" : ""}`}
                style={
                  {
                    "--wheel-background": wheelBackground,
                    "--wheel-rotation": `${spinRotation}deg`,
                  } as CSSProperties
                }
              >
                <div className="wheel__hub">
                  <span>Spin cost</span>
                  <strong>{roulette?.spin_cost_ton ?? "0"} TON</strong>
                </div>
              </div>
            </div>

            <div className="roulette-side">
              <ul className="segment-list">
                {roulette?.segments.map((segment) => (
                  <li key={segment.id}>
                    <span
                      className="segment-list__swatch"
                      style={{ background: segment.accent }}
                    />
                    <div>
                      <strong>{segment.reward_title}</strong>
                      <p>{segment.reward_note}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                className="primary-button primary-button--wide"
                disabled={actionsLocked || isSpinning}
                onClick={() => void handleSpinRoulette()}
                type="button"
              >
                {isSpinning ? "Рулетка крутится" : "Запустить рулетку"}
              </button>

              {spinResult ? (
                <div className="result-box">
                  <span>last reward</span>
                  <strong>{spinResult.reward_title}</strong>
                  <p>{spinResult.reward_note}</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel panel--details">
          <div className="panel__head">
            <div>
              <p className="section-tag">Selected lot</p>
              <h2>Текущий фокус</h2>
            </div>
          </div>

          {selectedGift ? (
            <div className="detail-rail">
              <article>
                <span>gift id</span>
                <strong>{selectedGift.id}</strong>
              </article>
              <article>
                <span>wallet</span>
                <strong>{walletAddress || "not connected"}</strong>
              </article>
              <article>
                <span>queue</span>
                <strong>{selectedGift.delivery}</strong>
              </article>
              <article>
                <span>price nano</span>
                <strong>{selectedGift.price_nano}</strong>
              </article>
            </div>
          ) : null}

          <div className="notes">
            <p>
              Telegram actual launch будет доступен только после установки
              <code> PUBLIC_WEBAPP_URL </code> со схемой
              <code> https:// </code>.
            </p>
            <p>
              Локальная сборка не подменяет Telegram init data: при открытии
              вне Telegram интерфейс падает в <code>local</code> режим.
            </p>
            <p>
              Кнопка отправки результата в чат опирается на
              <code> Telegram.WebApp.sendData </code> из сценария reply keyboard.
            </p>
          </div>
        </section>
      </main>

      {isBootstrapping ? (
        <div className="loading-state">Загрузка каталога и конфигурации...</div>
      ) : null}
    </div>
  );
}


function App() {
  return isAdminRoute() ? <OperatorAdminPanel /> : <StorefrontApp />;
}


export default App;
