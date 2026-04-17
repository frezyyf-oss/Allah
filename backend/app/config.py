from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    if not parts.scheme or not parts.netloc:
        return url
    return f"{parts.scheme}://{parts.netloc}"


class Settings(BaseSettings):
    bot_token: str = ""
    bot_username: str = "@NftBatttleBot"
    public_webapp_url: str = ""
    frontend_dev_url: str = "http://localhost:5173"
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    ton_receiver_address: str = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"
    roulette_spin_cost_ton: str = "0.35"

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def api_base_url(self) -> str:
        return f"http://{self.backend_host}:{self.backend_port}"

    @property
    def effective_webapp_url(self) -> str:
        return (self.public_webapp_url or self.frontend_dev_url).rstrip("/")

    @property
    def can_launch_from_telegram(self) -> bool:
        return self.public_webapp_url.startswith("https://")

    @property
    def tonconnect_manifest_origin(self) -> str:
        if self.public_webapp_url.startswith("https://"):
            return origin_of(self.public_webapp_url)
        return self.api_base_url

    @property
    def twa_return_url(self) -> str:
        if not self.bot_username:
            return ""
        return f"https://t.me/{self.bot_username.lstrip('@')}"

    @property
    def cors_origins(self) -> list[str]:
        origins = [origin_of(self.frontend_dev_url)]
        if self.public_webapp_url:
            origins.append(origin_of(self.public_webapp_url))
        return origins


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
