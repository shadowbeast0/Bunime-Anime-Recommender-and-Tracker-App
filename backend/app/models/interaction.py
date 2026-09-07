from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

class InteractionBase(BaseModel):
    anime_id: int
    watch_status: str
    episodes_watched: int = 0
    watched_episodes: List[str] = []
    rating: Optional[float] = Field(None, ge=1.0, le=5.0)
    dislike_reason: Optional[str] = None

class InteractionCreate(InteractionBase):
    pass

class InteractionInDB(InteractionBase):
    id: str = Field(alias="_id", default=None)
    user_id: str
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InteractionResponse(InteractionBase):
    id: str
    user_id: str
    last_updated: datetime