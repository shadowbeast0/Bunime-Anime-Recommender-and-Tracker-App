import ast
import asyncio
import os
import re
import sys
from datetime import datetime, timezone

import pandas as pd

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings


def parse_list(value) -> list[str]:
    if pd.isna(value) or value in (None, ""):
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    text = str(value).strip()
    try:
        parsed = ast.literal_eval(text)
    except (SyntaxError, ValueError):
        parsed = text.split(",")

    if isinstance(parsed, (list, tuple, set)):
        return [str(item).strip() for item in parsed if str(item).strip()]
    return [str(parsed).strip()] if str(parsed).strip() else []


def parse_optional_int(value):
    if pd.isna(value) or value in (None, "", 0, "0"):
        return None
    return int(float(value))


def parse_optional_float(value):
    if pd.isna(value) or value in (None, ""):
        return None
    return float(value)


def normalize_status(value: str) -> str:
    return str(value or "Unknown").replace("_", " ").title()


def franchise_name(title: str) -> str:
    """Create a conservative browse-group label for seasons, films, and extras."""
    name = re.sub(r"\([^)]*\)", "", title or "").strip()
    name = re.sub(r"\b(season|part|cour)\s*\d+\b", "", name, flags=re.I)
    name = re.sub(r"\b\d+(st|nd|rd|th)\s+season\b", "", name, flags=re.I)
    name = re.sub(r"\b(movie|film|ova|ona|special|recap|episode)\b.*$", "", name, flags=re.I)
    name = re.split(r"\s*[:\-–—]\s*", name)[0].strip()
    return name or title


def franchise_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", franchise_name(title).lower()).strip("-") or "misc"

async def load_csv_to_mongo(csv_path: str):
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DATABASE_NAME]

    df = pd.read_csv(csv_path, low_memory=False)
    required_columns = {"anime_id", "title", "synopsis", "genres", "episodes", "status", "score"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing_columns))}")

    image_column = "image_url" if "image_url" in df.columns else "main_picture"
    if image_column not in df.columns:
        raise ValueError("CSV must contain either image_url or main_picture")

    operations = []

    loaded_count = 0
    for _, row in df.iterrows():
        episodes = parse_optional_int(row.get("episodes"))
        genres = parse_list(row["genres"])
        if "Hentai" in genres:
            continue

        english_title = "" if pd.isna(row.get("title_english")) else str(row.get("title_english")).strip()
        primary_title = english_title or str(row["title"])
        anime_data = {
            "anime_id": int(row["anime_id"]),
            "title": str(row["title"]),
            "english_title": english_title or str(row["title"]),
            "group_title": franchise_name(primary_title),
            "group_key": franchise_key(primary_title),
            "synopsis": "" if pd.isna(row["synopsis"]) else str(row["synopsis"]),
            "genres": genres,
            "demographics": parse_list(row.get("demographics")),
            "themes": parse_list(row.get("themes")),
            "image_url": "" if pd.isna(row[image_column]) else str(row[image_column]),
            "total_episodes": episodes,
            "current_episodes": episodes or 0,
            "status": normalize_status(row["status"]),
            "media_type": str(row.get("type", "Unknown") or "Unknown").upper(),
            "score": parse_optional_float(row["score"]),
            "last_updated": datetime.now(timezone.utc)
        }

        operations.append(
            db.anime.update_one(
                {"anime_id": anime_data["anime_id"]},
                {"$set": anime_data},
                upsert=True
            )
        )
        loaded_count += 1

        if len(operations) >= 500:
            await asyncio.gather(*operations)
            operations = []

    if operations:
        await asyncio.gather(*operations)

    client.close()
    print(f"Loaded {loaded_count} safe anime records from {csv_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    
    csv_file_path = sys.argv[1]
    asyncio.run(load_csv_to_mongo(csv_file_path))
