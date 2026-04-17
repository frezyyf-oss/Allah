from __future__ import annotations

import html
import json
import logging

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import (
    BotCommand,
    CallbackQuery,
    MenuButtonCommands,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from .config import Settings
from .emoji import tg_emoji
from .keyboards import start_inline_keyboard, start_reply_keyboard


LOGGER = logging.getLogger(__name__)


def build_dispatcher(settings: Settings) -> Dispatcher:
    router = Router()

    @router.message(CommandStart())
    async def start_handler(message: Message) -> None:
        text = (
            f"<b>{tg_emoji('gift')} Allah Gifts</b>\n"
            f"{tg_emoji('wallet')} Сначала подключи TON-кошелек, затем открывай витрину, рулетку и оплату.\n"
            f"{tg_emoji('apps')} Web app уже готов для локальной сборки на `localhost` и для Telegram после установки HTTPS URL.\n"
            f"{tg_emoji('info')} Кнопки ниже используют `icon_custom_emoji_id`, а сообщения — HTML `<tg-emoji>`."
        )
        await message.answer(
            text,
            reply_markup=start_reply_keyboard(settings),
        )
        await message.answer(
            (
                f"<b>{tg_emoji('settings')} Что внутри</b>\n"
                f"{tg_emoji('gift')} Витрина подарков с каталогом и TON-оплатой.\n"
                f"{tg_emoji('party')} Рулетка с весами и выдачей результата от backend.\n"
                f"{tg_emoji('wallet')} Tonkeeper через TON Connect."
            ),
            reply_markup=start_inline_keyboard(settings),
        )

    @router.message(F.text == "Профиль")
    async def profile_handler(message: Message) -> None:
        user = message.from_user
        username = f"@{user.username}" if user and user.username else "не указан"
        await message.answer(
            (
                f"<b>{tg_emoji('profile')} Профиль</b>\n"
                f"{tg_emoji('people')} ID: <code>{user.id if user else 0}</code>\n"
                f"{tg_emoji('link')} Username: <code>{html.escape(username)}</code>\n"
                f"{tg_emoji('lock_open')} Статус web app URL: "
                f"<code>{html.escape(settings.public_webapp_url or 'не задан')}</code>"
            )
        )

    @router.message(F.text == "Помощь")
    async def help_handler(message: Message) -> None:
        await message.answer(
            (
                f"<b>{tg_emoji('info')} Помощь</b>\n"
                f"{tg_emoji('wallet')} Для запуска из Telegram нужен `PUBLIC_WEBAPP_URL` с префиксом `https://`.\n"
                f"{tg_emoji('code')} Для локальной сборки фронтенд запускается на `http://localhost:5173`, backend — на `http://127.0.0.1:8000`.\n"
                f"{tg_emoji('gift')} После выбора лота web app может отправить результат обратно боту через `sendData`."
            )
        )

    @router.callback_query(F.data == "webapp_https_required")
    async def https_required_handler(callback: CallbackQuery) -> None:
        await callback.answer(
            "PUBLIC_WEBAPP_URL должен быть HTTPS, иначе Telegram не откроет Mini App.",
            show_alert=True,
        )

    @router.message(F.web_app_data)
    async def web_app_data_handler(message: Message) -> None:
        payload_text = message.web_app_data.data if message.web_app_data else ""
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError:
            LOGGER.warning("Invalid web_app_data payload: %s", payload_text)
            await message.answer(
                (
                    f"<b>{tg_emoji('cross')} Некорректный payload</b>\n"
                    f"{tg_emoji('file')} Текст: <code>{html.escape(payload_text)}</code>"
                )
            )
            return

        payload_type = payload.get("type", "unknown")
        if payload_type == "gift_pick":
            gift_id = html.escape(str(payload.get("giftId", "unknown")))
            wallet_address = html.escape(str(payload.get("wallet", "not_connected")))
            await message.answer(
                (
                    f"<b>{tg_emoji('gift')} Выбор из web app</b>\n"
                    f"{tg_emoji('tag')} Лот: <code>{gift_id}</code>\n"
                    f"{tg_emoji('wallet')} Кошелек: <code>{wallet_address}</code>"
                )
            )
            return

        if payload_type == "roulette_result":
            reward_title = html.escape(str(payload.get("rewardTitle", "unknown")))
            await message.answer(
                (
                    f"<b>{tg_emoji('party')} Результат рулетки</b>\n"
                    f"{tg_emoji('gift')} Награда: <code>{reward_title}</code>"
                )
            )
            return

        await message.answer(
            (
                f"<b>{tg_emoji('info')} Web app payload</b>\n"
                f"{tg_emoji('file')} Тип: <code>{html.escape(payload_type)}</code>\n"
                f"{tg_emoji('code')} JSON: <code>{html.escape(payload_text)}</code>"
            )
        )

    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    return dispatcher


async def configure_bot(bot: Bot, settings: Settings) -> None:
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Открыть витрину"),
        ]
    )
    if settings.can_launch_from_telegram:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Магазин",
                web_app=WebAppInfo(url=settings.public_webapp_url),
            )
        )
    else:
        await bot.set_chat_menu_button(menu_button=MenuButtonCommands())


async def run_bot(settings: Settings) -> None:
    if not settings.bot_token:
        raise RuntimeError("BOT_TOKEN is empty")

    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = build_dispatcher(settings)

    try:
        await configure_bot(bot, settings)
        await dispatcher.start_polling(bot)
    finally:
        await bot.session.close()
