from __future__ import annotations

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

from .config import Settings
from .emoji import button_emoji_id


def start_reply_keyboard(settings: Settings) -> ReplyKeyboardMarkup:
    keyboard: list[list[KeyboardButton]] = []
    if settings.can_launch_from_telegram:
        keyboard.append(
            [
                KeyboardButton(
                    text="Открыть витрину",
                    icon_custom_emoji_id=button_emoji_id("gift"),
                    web_app=WebAppInfo(url=settings.public_webapp_url),
                )
            ]
        )
    keyboard.append(
        [
            KeyboardButton(
                text="Профиль",
                icon_custom_emoji_id=button_emoji_id("profile"),
            ),
            KeyboardButton(
                text="Помощь",
                icon_custom_emoji_id=button_emoji_id("info"),
            ),
        ]
    )
    return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True)


def start_inline_keyboard(settings: Settings) -> InlineKeyboardMarkup:
    launch_button: InlineKeyboardButton
    if settings.can_launch_from_telegram:
        launch_button = InlineKeyboardButton(
            text="Запустить web app",
            icon_custom_emoji_id=button_emoji_id("apps"),
            web_app=WebAppInfo(url=settings.public_webapp_url),
        )
    else:
        launch_button = InlineKeyboardButton(
            text="Нужен HTTPS URL",
            icon_custom_emoji_id=button_emoji_id("lock_closed"),
            callback_data="webapp_https_required",
        )

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [launch_button],
            [
                InlineKeyboardButton(
                    text="TON Connect",
                    icon_custom_emoji_id=button_emoji_id("wallet"),
                    url="https://docs.ton.org/ecosystem/ton-connect/dapp",
                )
            ],
        ]
    )
