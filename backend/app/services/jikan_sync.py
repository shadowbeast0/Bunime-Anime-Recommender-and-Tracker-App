import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import get_database
from app.services.recommender_engine import recommender
from datetime import datetime, timezone

scheduler = AsyncIOScheduler()

async def sync_daily_anime():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.jikan.moe/v4/seasons/now")
        if response.status_code == 200:
            data = response.json().get("data", [])
            db = await get_database()
            for item in data:
                anime_id = item.get("mal_id")
                anime_data = {
                    "anime_id": anime_id,
                    "title": item.get("title_english") or item.get("title"),
                    "synopsis": item.get("synopsis", ""),
                    "genres": [g["name"] for g in item.get("genres", [])],
                    "image_url": item.get("images", {}).get("jpg", {}).get("large_image_url", ""),
                    "total_episodes": item.get("episodes"),
                    "status": "Currently Airing",
                    "score": item.get("score"),
                    "last_updated": datetime.now(timezone.utc)
                }
                
                await db.anime.update_one(
                    {"anime_id": anime_id},
                    {"$set": anime_data},
                    upsert=True
                )
            
            await recommender.load_data()

def start_scheduler():
    scheduler.add_job(sync_daily_anime, 'interval', hours=24)
    scheduler.start()

def shutdown_scheduler():
    scheduler.shutdown()