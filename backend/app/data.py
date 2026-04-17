from __future__ import annotations

from decimal import Decimal
from random import SystemRandom
from typing import Iterable
from uuid import uuid4

from pydantic import BaseModel


SYSTEM_RANDOM = SystemRandom()
NANOTONS = Decimal("1000000000")


class GiftItem(BaseModel):
    id: str
    title: str
    strapline: str
    price_ton: str
    price_nano: str
    rarity: str
    remaining: int
    delivery: str
    accent: str
    background: str
    highlight: str
    note: str


class RouletteSegment(BaseModel):
    id: str
    label: str
    reward_title: str
    reward_note: str
    accent: str
    weight: int


def ton_to_nano(value: str) -> str:
    nano_value = (Decimal(value) * NANOTONS).quantize(Decimal("1"))
    return str(int(nano_value))


GIFT_CATALOG: list[GiftItem] = [
    GiftItem(
        id="aurora-drop",
        title="Aurora Drop",
        strapline="Градиентная витрина для редкого подарка",
        price_ton="1.40",
        price_nano=ton_to_nano("1.40"),
        rarity="Epic",
        remaining=12,
        delivery="Ручная выдача после подтверждения оплаты",
        accent="#54f1c8",
        background="#0d1c22",
        highlight="#8cffdc",
        note="Лот для аккуратной выдачи через оператора после оплаты.",
    ),
    GiftItem(
        id="signal-seal",
        title="Signal Seal",
        strapline="Подарок с короткой очередью и меткой Fast lane",
        price_ton="0.95",
        price_nano=ton_to_nano("0.95"),
        rarity="Rare",
        remaining=24,
        delivery="Выдача в пределах 30 минут",
        accent="#ff8a5b",
        background="#24120e",
        highlight="#ffb391",
        note="Подходит для тех, кому нужен быстрый и недорогой слот.",
    ),
    GiftItem(
        id="void-case",
        title="Void Case",
        strapline="Темная капсула с лимитированным остатком",
        price_ton="2.75",
        price_nano=ton_to_nano("2.75"),
        rarity="Legendary",
        remaining=5,
        delivery="Приоритетная выдача после ручной проверки",
        accent="#8aa7ff",
        background="#111625",
        highlight="#bccbff",
        note="Премиальный слот с минимальным остатком на витрине.",
    ),
]


ROULETTE_SEGMENTS: list[RouletteSegment] = [
    RouletteSegment(
        id="bonus-spin",
        label="Bonus",
        reward_title="Дополнительный спин",
        reward_note="Система открывает еще один прогон без доплаты.",
        accent="#5cf0be",
        weight=30,
    ),
    RouletteSegment(
        id="discount",
        label="20%",
        reward_title="Скидка 20%",
        reward_note="Промокод применяется к следующей покупке.",
        accent="#ff9966",
        weight=24,
    ),
    RouletteSegment(
        id="rare-drop",
        label="Rare",
        reward_title="Редкий подарок",
        reward_note="Открывается один редкий слот из витрины.",
        accent="#8ba8ff",
        weight=14,
    ),
    RouletteSegment(
        id="tonback",
        label="Cashback",
        reward_title="Кэшбэк 0.2 TON",
        reward_note="Возврат зачисляется как скидка на заказ.",
        accent="#ffd166",
        weight=20,
    ),
    RouletteSegment(
        id="legendary-upgrade",
        label="Upgrade",
        reward_title="Апгрейд заказа",
        reward_note="Следующий заказ помечается как priority.",
        accent="#ff70c9",
        weight=12,
    ),
]


def list_catalog() -> list[GiftItem]:
    return GIFT_CATALOG


def list_roulette_segments() -> list[RouletteSegment]:
    return ROULETTE_SEGMENTS


def get_gift_by_id(gift_id: str) -> GiftItem:
    for gift in GIFT_CATALOG:
        if gift.id == gift_id:
            return gift
    raise KeyError(gift_id)


def roulette_index(segment_id: str) -> int:
    for index, segment in enumerate(ROULETTE_SEGMENTS):
        if segment.id == segment_id:
            return index
    raise KeyError(segment_id)


def choose_weighted_segment(segments: Iterable[RouletteSegment]) -> RouletteSegment:
    segment_list = list(segments)
    weights = [segment.weight for segment in segment_list]
    return SYSTEM_RANDOM.choices(segment_list, weights=weights, k=1)[0]


def new_spin_id() -> str:
    return uuid4().hex
