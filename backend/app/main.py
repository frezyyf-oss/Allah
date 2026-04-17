from __future__ import annotations

import asyncio
import logging

import uvicorn

from .api import create_app
from .bot import run_bot
from .config import get_settings


logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger(__name__)


async def run_api_server() -> None:
    settings = get_settings()
    app = create_app(settings)
    config = uvicorn.Config(
        app=app,
        host=settings.backend_host,
        port=settings.backend_port,
        log_level="info",
    )
    server = uvicorn.Server(config)
    await server.serve()


async def main() -> None:
    settings = get_settings()
    async with asyncio.TaskGroup() as task_group:
        task_group.create_task(run_api_server())
        if settings.bot_token:
            task_group.create_task(run_bot(settings))
        else:
            LOGGER.warning("BOT_TOKEN is empty; aiogram polling is skipped.")


if __name__ == "__main__":
    asyncio.run(main())
