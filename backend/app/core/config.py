from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Anime Tracker & Recommender"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = "local-development-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    
    MONGO_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "animetracker"
    
    JIKAN_BASE_URL: str = "https://api.jikan.moe/v4"
    
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()