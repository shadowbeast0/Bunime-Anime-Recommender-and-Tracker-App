from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional

class UserProfile(BaseModel):
    preferred_genres: List[str] = []
    favorite_anime_ids: List[int] = []
    github_url: Optional[str] = None

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserInDB(UserBase):
    id: str = Field(alias="_id", default=None)
    hashed_password: str
    profile: UserProfile = UserProfile()

class UserResponse(UserBase):
    id: str
    profile: UserProfile

class UserProfileUpdate(UserProfile):
    pass
