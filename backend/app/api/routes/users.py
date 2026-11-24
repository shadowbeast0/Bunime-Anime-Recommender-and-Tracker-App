from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from app.models.user import UserProfileUpdate, UserResponse
from app.api.dependencies import get_current_user
from app.database import get_database
from typing import Any

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: Any = Depends(get_current_user)):
    return current_user

@router.put("/me/profile", response_model=UserResponse)
async def update_profile(
    profile_in: UserProfileUpdate,
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    profile_values = profile_in.model_dump()
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {f"profile.{key}": value for key, value in profile_values.items()}},
    )
    updated_user = await db.users.find_one({"_id": current_user["_id"]})
    updated_user["profile"] = {**UserProfileUpdate().model_dump(), **updated_user.get("profile", {})}
    updated_user["id"] = str(updated_user["_id"])
    return updated_user

@router.get("/me/export")
async def export_watchlist(
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    """Download the user's saved anime in a portable, human-readable format."""
    user_id = str(current_user["_id"])
    interactions = [
        interaction
        async for interaction in db.interactions.find({"user_id": user_id}).sort("last_updated", -1)
    ]
    anime_by_id: dict[int, dict[str, Any]] = {}
    if interactions:
        anime_ids = [interaction["anime_id"] for interaction in interactions]
        async for anime in db.anime.find({"anime_id": {"$in": anime_ids}, "genres": {"$nin": ["Hentai"]}}):
            anime_by_id[anime["anime_id"]] = anime

    entries = []
    for interaction in interactions:
        anime = anime_by_id.get(interaction["anime_id"])
        if not anime:
            continue
        entries.append({
            "anime_name": anime.get("english_title") or anime["title"],
            "original_title": anime["title"],
            "your_rating": interaction.get("rating"),
            "watch_status": interaction.get("watch_status") or None,
            "genres": anime.get("genres", []),
            "mal_rating": anime.get("score"),
        })

    payload = {"app": "Bunime", "exported_at": datetime.now(timezone.utc).isoformat(), "anime": entries}
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="bunime-anime-export.json"'},
    )
