from datetime import datetime, timezone
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_current_user
from app.database import get_database
from app.models.interaction import InteractionCreate, InteractionResponse

router = APIRouter()


def serialize_interaction(interaction: dict[str, Any]) -> dict[str, Any]:
    interaction["id"] = str(interaction.pop("_id"))
    interaction["user_id"] = str(interaction["user_id"])
    return interaction


@router.get("/me/interactions", response_model=List[InteractionResponse])
async def list_interactions(
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    user_id = str(current_user["_id"])
    cursor = db.interactions.find({"user_id": user_id}).sort("last_updated", -1)
    return [serialize_interaction(document) async for document in cursor]


@router.get("/me/watchlist")
async def list_watchlist(
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    """Return each saved anime together with the current user's interaction.

    Keeping this join on the API prevents the client from silently dropping saved
    titles just because they are outside the current catalog or recommendation page.
    """
    user_id = str(current_user["_id"])
    interactions = [
        serialize_interaction(document)
        async for document in db.interactions.find({"user_id": user_id}).sort("last_updated", -1)
    ]
    if not interactions:
        return []

    anime_ids = [interaction["anime_id"] for interaction in interactions]
    anime_by_id: dict[int, dict[str, Any]] = {}
    async for anime in db.anime.find({"anime_id": {"$in": anime_ids}, "genres": {"$nin": ["Hentai"]}}):
        anime["id"] = str(anime.pop("_id"))
        anime_by_id[anime["anime_id"]] = anime

    return [
        {**anime_by_id[interaction["anime_id"]], "userInteraction": interaction}
        for interaction in interactions
        if interaction["anime_id"] in anime_by_id
    ]


@router.put("/me/interactions/{anime_id}", response_model=InteractionResponse)
async def upsert_interaction(
    anime_id: int,
    interaction_in: InteractionCreate,
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    if interaction_in.anime_id != anime_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The anime ID in the URL must match the request body.",
        )

    user_id = str(current_user["_id"])
    now = datetime.now(timezone.utc)
    values = interaction_in.model_dump()
    values.update({"user_id": user_id, "last_updated": now})

    await db.interactions.update_one(
        {"user_id": user_id, "anime_id": anime_id},
        {"$set": values},
        upsert=True,
    )
    saved = await db.interactions.find_one({"user_id": user_id, "anime_id": anime_id})
    return serialize_interaction(saved)


@router.delete("/me/interactions/{anime_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_interaction(
    anime_id: int,
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    result = await db.interactions.delete_one(
        {"user_id": str(current_user["_id"]), "anime_id": anime_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interaction not found")
