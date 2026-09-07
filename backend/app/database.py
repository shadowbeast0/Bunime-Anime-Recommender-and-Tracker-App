from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class Database:
    client: AsyncIOMotorClient = None

db = Database()

async def get_database():
    return db.client[settings.DATABASE_NAME]

async def connect_to_mongo():
    db.client = AsyncIOMotorClient(settings.MONGO_URL)
    database = db.client[settings.DATABASE_NAME]
    await database.users.create_index("username", unique=True)
    await database.users.create_index("email", unique=True)
    await database.anime.create_index("anime_id", unique=True)
    await database.anime.create_index([("title", "text"), ("synopsis", "text")])
    await database.interactions.create_index([("user_id", 1), ("anime_id", 1)], unique=True)
    await database.interactions.create_index("user_id")

async def close_mongo_connection():
    if db.client:
        db.client.close()