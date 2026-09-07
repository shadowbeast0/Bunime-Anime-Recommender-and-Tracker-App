from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

class AnimeBase(BaseModel):
    anime_id: int
    title: str
    english_title: Optional[str] = None
    synopsis: Optional[str] = ""
    genres: List[str] = []
    demographics: List[str] = []
    themes: List[str] = []
    image_url: str
    total_episodes: Optional[int] = None
    current_episodes: int = 0
    status: str
    media_type: Optional[str] = None
    score: Optional[float] = None
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AnimeCreate(AnimeBase):
    pass

class AnimeInDB(AnimeBase):
    id: str = Field(alias="_id", default=None)

class AnimeResponse(AnimeBase):
    id: str
