from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Any, Optional
import re
import httpx
from datetime import datetime, timezone
from app.models.anime import AnimeResponse
from app.database import get_database

router = APIRouter()
SAFE_ANIME_FILTER = {"genres": {"$nin": ["Hentai"]}}


def jikan_to_anime(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "anime_id": item["mal_id"],
        "title": item.get("title") or item.get("title_english") or "Untitled",
        "english_title": item.get("title_english") or item.get("title") or "Untitled",
        "synopsis": item.get("synopsis") or "",
        "genres": [genre["name"] for genre in item.get("genres", [])],
        "demographics": [demographic["name"] for demographic in item.get("demographics", [])],
        "themes": [theme["name"] for theme in item.get("themes", [])],
        "image_url": item.get("images", {}).get("jpg", {}).get("large_image_url", ""),
        "total_episodes": item.get("episodes"),
        "current_episodes": item.get("episodes") or 0,
        "status": str(item.get("status") or "Unknown").replace("Finished Airing", "Finished Airing"),
        "media_type": str(item.get("type") or "Unknown").upper(),
        "score": item.get("score"),
    }


async def search_jikan(query: str, limit: int, db: Any) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get("https://api.jikan.moe/v4/anime", params={"q": query, "limit": min(limit, 10), "sfw": "true"})
        response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException):
        return []

    results = []
    ignored_words = {"the", "of", "on", "a", "an", "and", "in"}
    query_terms = [term for term in re.findall(r"[a-z0-9]+", query.lower()) if term not in ignored_words and len(term) > 2]
    for item in response.json().get("data", []):
        anime = jikan_to_anime(item)
        if "Hentai" in anime["genres"]:
            continue
        searchable_title = f"{anime['title']} {anime['english_title']}".lower()
        if query_terms and not any(term in searchable_title for term in query_terms):
            continue
        anime["last_updated"] = datetime.now(timezone.utc)
        await db.anime.update_one({"anime_id": anime["anime_id"]}, {"$set": anime}, upsert=True)
        anime["id"] = str(anime["anime_id"])
        results.append(anime)
    return results


def anilist_to_anime(item: dict[str, Any]) -> dict[str, Any]:
    title = item.get("title") or {}
    description = re.sub(r"<[^>]+>", "", item.get("description") or "").strip()
    return {
        "anime_id": item["id"],
        "title": title.get("romaji") or title.get("english") or "Untitled",
        "english_title": title.get("english") or title.get("romaji") or "Untitled",
        "synopsis": description,
        "genres": item.get("genres") or [],
        "demographics": [],
        "themes": [tag["name"] for tag in item.get("tags", [])[:5]],
        "image_url": (item.get("coverImage") or {}).get("extraLarge", ""),
        "total_episodes": item.get("episodes"),
        "current_episodes": item.get("episodes") or 0,
        "status": str(item.get("status") or "Unknown").replace("_", " ").title(),
        "media_type": str(item.get("type") or "Unknown").upper(),
        "score": (item.get("averageScore") or 0) / 10 or None,
    }


async def search_anilist(query: str, limit: int, db: Any) -> list[dict[str, Any]]:
    graphql_query = """
    query ($search: String!, $perPage: Int!) {
      Page(perPage: $perPage) {
        media(search: $search, type: ANIME, isAdult: false) {
          id title { romaji english } description genres tags { name } coverImage { extraLarge } episodes status type averageScore
        }
      }
    }
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                "https://graphql.anilist.co",
                json={"query": graphql_query, "variables": {"search": query, "perPage": min(limit, 10)}},
            )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, httpx.TimeoutException):
        return []

    results = []
    for item in payload.get("data", {}).get("Page", {}).get("media", []):
        anime = anilist_to_anime(item)
        anime["last_updated"] = datetime.now(timezone.utc)
        await db.anime.update_one({"anime_id": anime["anime_id"]}, {"$set": anime}, upsert=True)
        anime["id"] = str(anime["anime_id"])
        results.append(anime)
    return results


async def search_kitsu(query: str, limit: int, db: Any) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                "https://kitsu.io/api/edge/anime",
                params={"filter[text]": query, "page[limit]": min(limit, 10)},
            )
        response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException):
        return []

    results = []
    for item in response.json().get("data", []):
        attributes = item.get("attributes", {})
        titles = attributes.get("titles") or {}
        canonical_title = attributes.get("canonicalTitle") or "Untitled"
        english_title = titles.get("en") or canonical_title
        anime = {
            "anime_id": 700000 + int(item["id"]),
            "title": canonical_title,
            "english_title": english_title,
            "synopsis": attributes.get("synopsis") or "",
            "genres": [],
            "demographics": [],
            "themes": [],
            "image_url": (attributes.get("posterImage") or {}).get("large", ""),
            "total_episodes": attributes.get("episodeCount"),
            "current_episodes": attributes.get("episodeCount") or 0,
            "status": str(attributes.get("status") or "Unknown").replace("_", " ").title(),
            "media_type": str(attributes.get("subtype") or "Unknown").upper(),
            "score": float(attributes["averageRating"]) / 10 if attributes.get("averageRating") else None,
            "last_updated": datetime.now(timezone.utc),
        }
        await db.anime.update_one({"anime_id": anime["anime_id"]}, {"$set": anime}, upsert=True)
        anime["id"] = str(anime["anime_id"])
        results.append(anime)
    return results

@router.get("/", response_model=List[AnimeResponse])
async def search_anime(
    q: str = None, 
    limit: int = Query(20, le=100), 
    skip: int = 0, 
    media_type: Optional[str] = None,
    demographic: Optional[str] = None,
    theme: Optional[str] = None,
    db: Any = Depends(get_database)
):
    filters: list[dict] = [SAFE_ANIME_FILTER]
    if media_type:
        filters.append({"media_type": media_type.upper()})
    if demographic:
        filters.append({"demographics": demographic})
    if theme:
        filters.append({"themes": theme})
    if q:
        filters.append({"$text": {"$search": q}})
    query: dict = filters[0] if len(filters) == 1 else {"$and": filters}
    animes = []

    if q:
        # Prefer an exact/partial title hit over a loose full-text synopsis hit.
        title_filters: list[dict] = [SAFE_ANIME_FILTER, {
            "$or": [
                {"english_title": {"$regex": re.escape(q), "$options": "i"}},
                {"title": {"$regex": re.escape(q), "$options": "i"}},
            ]
        }]
        if media_type:
            title_filters.append({"media_type": media_type.upper()})
        if demographic:
            title_filters.append({"demographics": demographic})
        if theme:
            title_filters.append({"themes": theme})
        async for doc in db.anime.find({"$and": title_filters}).sort([("score", -1), ("title", 1)]).skip(skip).limit(limit):
            doc["id"] = str(doc["_id"])
            animes.append(doc)

        # A local full-text search can match unrelated tokens from an older
        # catalog. Prefer Jikan's title search when no local title matched.
        if not animes:
            jikan_results = await search_jikan(q, limit, db)
            if jikan_results:
                return jikan_results
            anilist_results = await search_anilist(q, limit, db)
            return anilist_results or await search_kitsu(q, limit, db)

    if not q and len(animes) < limit:
        known_ids = [anime["anime_id"] for anime in animes]
        text_query = query if not known_ids else {"$and": [query, {"anime_id": {"$nin": known_ids}}]}
        async for doc in db.anime.find(text_query).sort([("score", -1), ("title", 1)]).skip(skip).limit(limit - len(animes)):
            doc["id"] = str(doc["_id"])
            animes.append(doc)
    return animes


@router.get("/groups")
async def list_anime_groups(
    limit: int = Query(30, le=100),
    skip: int = 0,
    media_type: Optional[str] = None,
    demographic: Optional[str] = None,
    theme: Optional[str] = None,
    db: Any = Depends(get_database),
):
    match: dict[str, Any] = SAFE_ANIME_FILTER.copy()
    if media_type:
        match["media_type"] = media_type.upper()
    if demographic:
        match["demographics"] = demographic
    if theme:
        match["themes"] = theme
    pipeline = [
        {"$match": match},
        {"$sort": {"score": -1, "title": 1}},
        {"$group": {
            "_id": "$group_key",
            "title": {"$first": "$group_title"},
            "anime": {"$first": "$$ROOT"},
            "count": {"$sum": 1},
            "media_types": {"$addToSet": "$media_type"},
        }},
        {"$sort": {"anime.score": -1, "title": 1}},
        {"$skip": skip},
        {"$limit": limit},
    ]
    groups = []
    async for group in db.anime.aggregate(pipeline):
        anime = group["anime"]
        anime["id"] = str(anime.pop("_id"))
        groups.append({
            "group_key": group["_id"],
            "title": group["title"],
            "count": group["count"],
            "media_types": group["media_types"],
            "anime": anime,
        })
    return groups


@router.get("/group/{group_key}")
async def get_anime_group(group_key: str, db: Any = Depends(get_database)):
    titles = []
    async for anime in db.anime.find({"group_key": group_key, **SAFE_ANIME_FILTER}).sort([("media_type", 1), ("score", -1)]):
        anime["id"] = str(anime.pop("_id"))
        titles.append(anime)
    if not titles:
        raise HTTPException(status_code=404, detail="Anime group not found")
    return {"group_key": group_key, "title": titles[0].get("group_title", titles[0]["title"]), "titles": titles}

@router.get("/{anime_id}", response_model=AnimeResponse)
async def get_anime(anime_id: int, db: Any = Depends(get_database)):
    anime = await db.anime.find_one({"anime_id": anime_id, **SAFE_ANIME_FILTER})
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")
    anime["id"] = str(anime["_id"])
    return anime
