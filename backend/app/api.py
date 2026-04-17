from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Annotated

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


def verify_admin_token(
    settings: Settings,
    x_admin_token: str | None,
) -> None:
    if settings.admin_panel_token and x_admin_token != settings.admin_panel_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")


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
