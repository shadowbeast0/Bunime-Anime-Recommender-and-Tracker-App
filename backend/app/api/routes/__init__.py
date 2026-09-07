from fastapi import APIRouter
from app.api.routes import auth, users, anime, recommendations, interactions

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(anime.router, prefix="/anime", tags=["anime"])
api_router.include_router(recommendations.router, prefix="/recommendations", tags=["recommendations"])
api_router.include_router(interactions.router, prefix="/users", tags=["interactions"])