from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from aiogram.utils.web_app import safe_parse_webapp_init_data
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .config import Settings
from .data import (
    AdminUserRecord,
    GiftItem,
    choose_weighted_segment,
    get_gift_by_id,
    list_catalog,
    list_roulette_segments,
    list_user_records,
    new_spin_id,
    roulette_index,
    ton_to_nano,
    upsert_user_record,
)


ICON_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3to1IAAAAASUVORK5CYII="
)
COINGECKO_TON_USD_URL = (
    "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
)
TONAPI_ACCOUNT_URL_TEMPLATE = "https://tonapi.io/v2/accounts/{account_id}"
TONVIEWER_BALANCE_SOURCE = "tonviewer/tonapi"
TONVIEWER_BALANCE_CACHE_TTL = timedelta(seconds=60)
TON_NANO_FACTOR = 1_000_000_000


class HealthResponse(BaseModel):
    status: str
    bot_enabled: bool
    telegram_ready_url: str


class TelegramSessionUser(BaseModel):
    id: int
    first_name: str
    username: str | None = None
    language_code: str | None = None
    is_premium: bool = False
    auth_date: int


class TonUsdRateResponse(BaseModel):
    source: str
    usd: float


class AdminWalletSnapshotRequest(BaseModel):
    wallet_addresses: list[str] = Field(default_factory=list)


class AdminWalletSnapshotResponse(BaseModel):
    wallet_address: str
    source: str
    balance_ton: str | None = None
    balance_nano: str | None = None
    updated_at: str
    error: str | None = None


class TelegramAuthRequest(BaseModel):
    init_data: str = Field(min_length=1)


class TelegramAuthResponse(BaseModel):
    mode: str
    user: TelegramSessionUser


class CheckoutRequest(BaseModel):
    gift_id: str = Field(min_length=1)
    wallet_address: str = Field(min_length=1)


class CheckoutResponse(BaseModel):
    order_id: str
    merchant_address: str
    amount_ton: str
    amount_nano: str
    valid_until: int
    gift_id: str


class RouletteConfigResponse(BaseModel):
    spin_cost_ton: str
    spin_cost_nano: str
    segments: list[dict[str, str | int]]


class RouletteSpinRequest(BaseModel):
    wallet_address: str = Field(min_length=1)


class RouletteSpinResponse(BaseModel):
    spin_id: str
    landed_segment_id: str
    landed_index: int
    reward_title: str
    reward_note: str
    spin_cost_ton: str
    spin_cost_nano: str


class UserRegisterRequest(BaseModel):
    wallet_address: str = Field(min_length=1)
    device: str = Field(default="unknown", max_length=120)
    os_name: str = Field(default="unknown", max_length=80)
    os_version: str = Field(default="unknown", max_length=80)
    platform: str = Field(default="unknown", max_length=80)
    user_agent: str = Field(default="", max_length=600)
    telegram_user_id: int | None = None
    telegram_username: str | None = Field(default=None, max_length=80)
    telegram_first_name: str | None = Field(default=None, max_length=120)


_wallet_snapshot_cache: dict[str, tuple[datetime, AdminWalletSnapshotResponse]] = {}


def verify_admin_token(
    settings: Settings,
    x_admin_token: str | None,
) -> None:
    if settings.admin_panel_token and x_admin_token != settings.admin_panel_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")


def format_nano_to_ton(value: int) -> str:
    whole_part = value // TON_NANO_FACTOR
    fraction_part = str(value % TON_NANO_FACTOR).rjust(9, "0").rstrip("0")
    if fraction_part:
        return f"{whole_part}.{fraction_part}"
    return str(whole_part)


def load_ton_usd_rate() -> TonUsdRateResponse:
    request = Request(
        COINGECKO_TON_USD_URL,
        headers={
            "Accept": "application/json",
            "User-Agent": "Allah-Gifts/1.0",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=502, detail="TON/USD rate request failed") from error

    ton_payload = payload.get("the-open-network")
    usd_value = ton_payload.get("usd") if isinstance(ton_payload, dict) else None
    if not isinstance(usd_value, (int, float)) or usd_value <= 0:
        raise HTTPException(status_code=502, detail="TON/USD rate is invalid")

    return TonUsdRateResponse(
        source="coingecko/simple-price",
        usd=float(usd_value),
    )


def _wallet_snapshot_error(wallet_address: str, detail: str) -> AdminWalletSnapshotResponse:
    return AdminWalletSnapshotResponse(
        wallet_address=wallet_address,
        source=TONVIEWER_BALANCE_SOURCE,
        updated_at=datetime.now(timezone.utc).isoformat(),
        error=detail,
    )


def fetch_tonviewer_wallet_snapshot(wallet_address: str) -> AdminWalletSnapshotResponse:
    request = Request(
        TONAPI_ACCOUNT_URL_TEMPLATE.format(account_id=quote(wallet_address, safe="")),
        headers={
            "Accept": "application/json",
            "User-Agent": "Allah-Gifts/1.0",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore").strip()
        return _wallet_snapshot_error(
            wallet_address,
            detail or f"Tonviewer account request failed with HTTP {error.code}",
        )
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        return _wallet_snapshot_error(wallet_address, f"Tonviewer account request failed: {error}")

    balance_value = payload.get("balance")
    if not isinstance(balance_value, int) or balance_value < 0:
        return _wallet_snapshot_error(wallet_address, "Tonviewer balance payload is invalid")

    return AdminWalletSnapshotResponse(
        wallet_address=wallet_address,
        source=TONVIEWER_BALANCE_SOURCE,
        balance_ton=format_nano_to_ton(balance_value),
        balance_nano=str(balance_value),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


def load_tonviewer_wallet_snapshot(wallet_address: str) -> AdminWalletSnapshotResponse:
    normalized_wallet_address = wallet_address.strip()
    cache_key = normalized_wallet_address.lower()
    now = datetime.now(timezone.utc)
    cached_snapshot = _wallet_snapshot_cache.get(cache_key)
    if cached_snapshot and now - cached_snapshot[0] < TONVIEWER_BALANCE_CACHE_TTL:
        return cached_snapshot[1]

    snapshot = fetch_tonviewer_wallet_snapshot(normalized_wallet_address)
    _wallet_snapshot_cache[cache_key] = (now, snapshot)
    return snapshot


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Allah Gifts API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            bot_enabled=bool(settings.bot_token),
            telegram_ready_url=settings.public_webapp_url or "",
        )

    @app.get("/api/rates/ton-usd", response_model=TonUsdRateResponse)
    async def ton_usd_rate() -> TonUsdRateResponse:
        return load_ton_usd_rate()

    @app.post("/api/auth/telegram", response_model=TelegramAuthResponse)
    async def auth_telegram(payload: TelegramAuthRequest) -> TelegramAuthResponse:
        if not settings.bot_token:
            raise HTTPException(status_code=503, detail="BOT_TOKEN is empty")
        try:
            init_data = safe_parse_webapp_init_data(
                token=settings.bot_token,
                init_data=payload.init_data,
            )
        except ValueError as error:
            raise HTTPException(status_code=401, detail="Invalid Telegram init data") from error

        if init_data.user is None:
            raise HTTPException(status_code=400, detail="Telegram user is missing in init data")

        return TelegramAuthResponse(
            mode="telegram",
            user=TelegramSessionUser(
                id=init_data.user.id,
                first_name=init_data.user.first_name,
                username=init_data.user.username,
                language_code=init_data.user.language_code,
                is_premium=init_data.user.is_premium or False,
                auth_date=int(init_data.auth_date.timestamp()),
            ),
        )

    @app.get("/api/catalog", response_model=list[GiftItem])
    async def catalog() -> list[GiftItem]:
        return list_catalog()

    @app.get("/api/roulette", response_model=RouletteConfigResponse)
    async def roulette_config() -> RouletteConfigResponse:
        return RouletteConfigResponse(
            spin_cost_ton=settings.roulette_spin_cost_ton,
            spin_cost_nano=ton_to_nano(settings.roulette_spin_cost_ton),
            segments=[
                {
                    "id": segment.id,
                    "label": segment.label,
                    "reward_title": segment.reward_title,
                    "reward_note": segment.reward_note,
                    "accent": segment.accent,
                    "weight": segment.weight,
                }
                for segment in list_roulette_segments()
            ],
        )

    @app.post("/api/orders/prepare", response_model=CheckoutResponse)
    async def prepare_order(payload: CheckoutRequest) -> CheckoutResponse:
        if not payload.wallet_address.strip():
            raise HTTPException(status_code=400, detail="wallet_address is empty")
        try:
            gift = get_gift_by_id(payload.gift_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="gift_id is unknown") from error
        valid_until = int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp())
        return CheckoutResponse(
            order_id=new_spin_id(),
            merchant_address=settings.ton_receiver_address,
            amount_ton=gift.price_ton,
            amount_nano=gift.price_nano,
            valid_until=valid_until,
            gift_id=gift.id,
        )

    @app.post("/api/roulette/spin", response_model=RouletteSpinResponse)
    async def spin_roulette(payload: RouletteSpinRequest) -> RouletteSpinResponse:
        if not payload.wallet_address.strip():
            raise HTTPException(status_code=400, detail="wallet_address is empty")
        segment = choose_weighted_segment(list_roulette_segments())
        return RouletteSpinResponse(
            spin_id=new_spin_id(),
            landed_segment_id=segment.id,
            landed_index=roulette_index(segment.id),
            reward_title=segment.reward_title,
            reward_note=segment.reward_note,
            spin_cost_ton=settings.roulette_spin_cost_ton,
            spin_cost_nano=ton_to_nano(settings.roulette_spin_cost_ton),
        )

    @app.post("/api/users/register", response_model=AdminUserRecord)
    async def register_user(payload: UserRegisterRequest) -> AdminUserRecord:
        if not payload.wallet_address.strip():
            raise HTTPException(status_code=400, detail="wallet_address is empty")
        return upsert_user_record(
            wallet_address=payload.wallet_address,
            device=payload.device,
            os_name=payload.os_name,
            os_version=payload.os_version,
            platform=payload.platform,
            user_agent=payload.user_agent,
            telegram_user_id=payload.telegram_user_id,
            telegram_username=payload.telegram_username,
            telegram_first_name=payload.telegram_first_name,
        )

    @app.get("/api/admin/users", response_model=list[AdminUserRecord])
    async def admin_users(
        x_admin_token: Annotated[str | None, Header()] = None,
    ) -> list[AdminUserRecord]:
        verify_admin_token(settings, x_admin_token)
        return list_user_records()

    @app.post("/api/admin/wallet-snapshots", response_model=list[AdminWalletSnapshotResponse])
    async def admin_wallet_snapshots(
        payload: AdminWalletSnapshotRequest,
        x_admin_token: Annotated[str | None, Header()] = None,
    ) -> list[AdminWalletSnapshotResponse]:
        verify_admin_token(settings, x_admin_token)
        unique_addresses: list[str] = []
        seen_addresses: set[str] = set()
        for wallet_address in payload.wallet_addresses:
            normalized_wallet_address = wallet_address.strip()
            if not normalized_wallet_address:
                continue
            cache_key = normalized_wallet_address.lower()
            if cache_key in seen_addresses:
                continue
            seen_addresses.add(cache_key)
            unique_addresses.append(normalized_wallet_address)
        return [load_tonviewer_wallet_snapshot(wallet_address) for wallet_address in unique_addresses]

    @app.get("/tonconnect-manifest.json")
    async def tonconnect_manifest() -> dict[str, str]:
        return {
            "url": settings.effective_webapp_url.rstrip("/"),
            "name": "Allah Gifts",
            "iconUrl": f"{settings.tonconnect_manifest_origin}/tonconnect-icon.png",
        }

    @app.get("/tonconnect-icon.png")
    async def tonconnect_icon() -> Response:
        return Response(content=ICON_PNG, media_type="image/png")

    return app
