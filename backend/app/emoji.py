from __future__ import annotations


EMOJI_IDS: dict[str, str] = {
    "settings": "5870982283724328568",
    "profile": "5870994129244131212",
    "people": "5870772616305839506",
    "file": "5870528606328852614",
    "smile": "5870764288364252592",
    "growth": "5870930636742595124",
    "stats": "5870921681735781843",
    "home": "5873147866364514353",
    "lock_closed": "6037249452824072506",
    "lock_open": "6037496202990194718",
    "megaphone": "6039422865189638057",
    "check": "5870633910337015697",
    "cross": "5870657884844462243",
    "pen": "5870676941614354370",
    "trash": "5870875489362513438",
    "down": "5893057118545646106",
    "link": "5769289093221454192",
    "info": "6028435952299413210",
    "bot": "6030400221232501136",
    "wallet": "5769126056262898415",
    "box": "5884479287171485878",
    "calendar": "5890937706803894250",
    "tag": "5886285355279193209",
    "clock": "5983150113483134607",
    "gift": "6032644646587338669",
    "party": "6041731551845159060",
    "apps": "5778672437122045013",
    "brush": "6050679691004612757",
    "money": "5904462880941545555",
    "send_money": "5890848474563352982",
    "receive_money": "5879814368572478751",
    "code": "5940433880585605708",
    "loading": "5345906554510012647",
}


EMOJI_FALLBACKS: dict[str, str] = {
    "settings": "⚙️",
    "profile": "👤",
    "people": "👥",
    "file": "📁",
    "smile": "🙂",
    "growth": "📊",
    "stats": "📊",
    "home": "🏘",
    "lock_closed": "🔒",
    "lock_open": "🔓",
    "megaphone": "📣",
    "check": "✅",
    "cross": "❌",
    "pen": "🖋",
    "trash": "🗑",
    "down": "📰",
    "link": "🔗",
    "info": "ℹ",
    "bot": "🤖",
    "wallet": "👛",
    "box": "📦",
    "calendar": "📅",
    "tag": "🏷",
    "clock": "⏰",
    "gift": "🎁",
    "party": "🎉",
    "apps": "📦",
    "brush": "🖌",
    "money": "🪙",
    "send_money": "🪙",
    "receive_money": "🏧",
    "code": "🔨",
    "loading": "🔄",
}


def tg_emoji(name: str) -> str:
    emoji_id = EMOJI_IDS[name]
    fallback = EMOJI_FALLBACKS[name]
    return f'<tg-emoji emoji-id="{emoji_id}">{fallback}</tg-emoji>'


def button_emoji_id(name: str) -> str:
    return EMOJI_IDS[name]
