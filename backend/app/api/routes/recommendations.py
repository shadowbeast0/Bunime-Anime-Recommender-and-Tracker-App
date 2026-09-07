from fastapi import APIRouter, Depends, Query
from typing import List, Any, Optional
from app.api.dependencies import get_current_user
from app.services.recommender_engine import recommender
from app.models.anime import AnimeResponse
from app.database import get_database

router = APIRouter()
SAFE_ANIME_FILTER = {"genres": {"$nin": ["Hentai"]}}

@router.get("/profile", response_model=List[AnimeResponse])
async def get_user_recommendations(
    limit: int = Query(20, le=50),
    skip: int = Query(0, ge=0),
    genre: Optional[str] = None,
    media_type: Optional[str] = None,
    demographic: Optional[str] = None,
    theme: Optional[str] = None,
    seed_ids: Optional[str] = None,
    exclude_ids: Optional[str] = None,
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    selected_ids = [int(value) for value in (seed_ids or "").split(",") if value.strip().isdigit()]
    user_id = str(current_user["_id"])
    seen_ids = [
        interaction["anime_id"]
        async for interaction in db.interactions.find({"user_id": user_id})
    ]
    dismissed_ids = [int(value) for value in (exclude_ids or "").split(",") if value.strip().isdigit()]
    excluded_ids = [*seen_ids, *selected_ids, *dismissed_ids]

    requested_count = limit + skip

    if selected_ids:
        candidate_ids: list[int] = []
        for anime_id in selected_ids:
            candidate_ids.extend(await recommender.get_content_based_recommendations(anime_id, limit=requested_count * 4))
        recommended_ids = list(dict.fromkeys(candidate_ids))
    else:
        recommended_ids = await recommender.get_profile_recommendations(user_id, requested_count * 4)

    anime_query: dict[str, Any] = {**SAFE_ANIME_FILTER, "anime_id": {"$nin": excluded_ids}}
    if genre:
        anime_query["genres"] = {"$all": [genre], "$nin": ["Hentai"]}
    if media_type:
        anime_query["media_type"] = media_type.upper()
    if demographic:
        anime_query["demographics"] = demographic
    if theme:
        anime_query["themes"] = theme

    animes = []
    for anime_id in recommended_ids:
        anime = await db.anime.find_one({**anime_query, "anime_id": anime_id})
        if anime:
            anime["id"] = str(anime["_id"])
            animes.append(anime)
            if len(animes) == requested_count:
                break

    # Genre, seed, and media filters can leave a small candidate pool. Top-rated
    # unseen titles are a useful final fallback and preserve every active filter.
    cursor = db.anime.find({
        **anime_query,
        "anime_id": {"$nin": [*excluded_ids, *[anime["anime_id"] for anime in animes]]},
    }).sort([("score", -1), ("title", 1)]).limit(max(0, requested_count - len(animes)))
    async for anime in cursor:
        anime["id"] = str(anime["_id"])
        animes.append(anime)
            
    # Similarity chooses a relevant candidate pool; community score determines
    # the visible order so the best-rated matches always lead each page.
    animes.sort(key=lambda anime: (anime.get("score") is not None, anime.get("score") or -1, anime.get("title", "")), reverse=True)
    return animes[skip:skip + limit]

@router.get("/anime/{anime_id}", response_model=List[AnimeResponse])
async def get_similar_anime(
    anime_id: int, 
    limit: int = Query(10, le=20),
    db: Any = Depends(get_database)
):
    similar_ids = await recommender.get_content_based_recommendations(anime_id, limit)
    
    animes = []
    for s_id in similar_ids:
        anime = await db.anime.find_one({"anime_id": s_id, **SAFE_ANIME_FILTER})
        if anime:
            anime["id"] = str(anime["_id"])
            animes.append(anime)
            
    return animes
