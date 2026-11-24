from datetime import datetime, timezone

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import get_database
from app.services.recommender_engine import recommender

scheduler = AsyncIOScheduler()

async def sync_daily_anime():
    from app.api.routes.anime import jikan_to_anime

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get("https://api.jikan.moe/v4/seasons/now", params={"sfw": "true"})
        response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException):
        return

    db = await get_database()
    for item in response.json().get("data", []):
        anime = jikan_to_anime(item)
        if "Hentai" in anime["genres"]:
            continue
        anime["last_updated"] = datetime.now(timezone.utc)
        await db.anime.update_one({"anime_id": anime["anime_id"]}, {"$set": anime}, upsert=True)

    await recommender.load_data()

def start_scheduler():
    scheduler.add_job(sync_daily_anime, "interval", hours=24)
    scheduler.start()

def shutdown_scheduler():
    scheduler.shutdown()
