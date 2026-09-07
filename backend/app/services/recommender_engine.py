import pandas as pd
import numpy as np
from bson import ObjectId
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from app.database import get_database

class RecommenderEngine:
    def __init__(self):
        self.tfidf = TfidfVectorizer(stop_words='english')
        self.cosine_sim = None
        self.anime_df = pd.DataFrame()
        
    async def load_data(self):
        db = await get_database()
        cursor = db.anime.find({})
        anime_list = []
        async for doc in cursor:
            anime_list.append({
                "anime_id": doc["anime_id"],
                "title": doc["title"],
                "synopsis": doc.get("synopsis", ""),
                "genres": " ".join(doc.get("genres", []))
            })
            
        if not anime_list:
            return
            
        self.anime_df = pd.DataFrame(anime_list)
        self.anime_df['combined_features'] = self.anime_df['genres'] + " " + self.anime_df['synopsis']
        
        tfidf_matrix = self.tfidf.fit_transform(self.anime_df['combined_features'])
        self.cosine_sim = cosine_similarity(tfidf_matrix, tfidf_matrix)

    async def get_content_based_recommendations(self, anime_id: int, limit: int = 10):
        if self.anime_df.empty or self.cosine_sim is None:
            await self.load_data()
            if self.anime_df.empty:
                return []
                
        try:
            idx = self.anime_df.index[self.anime_df['anime_id'] == anime_id].tolist()[0]
        except IndexError:
            return []
            
        sim_scores = list(enumerate(self.cosine_sim[idx]))
        sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
        sim_scores = sim_scores[1:limit+1]
        
        anime_indices = [i[0] for i in sim_scores]
        return self.anime_df.iloc[anime_indices]['anime_id'].tolist()

    async def get_profile_recommendations(self, user_id: str, limit: int = 20):
        db = await get_database()
        try:
            user = await db.users.find_one({"_id": ObjectId(user_id)})
        except (TypeError, ValueError):
            user = None
        favorite_anime = (user or {}).get("profile", {}).get("favorite_anime_ids", [])
        user_cursor = db.interactions.find({"user_id": user_id, "rating": {"$gte": 4.0}})
        liked_anime = list(dict.fromkeys(favorite_anime))
        async for doc in user_cursor:
            if doc["anime_id"] not in liked_anime:
                liked_anime.append(doc["anime_id"])
            
        if not liked_anime:
            preferred_genres = (user or {}).get("profile", {}).get("preferred_genres", [])
            
            if preferred_genres:
                query = {"genres": {"$in": preferred_genres, "$nin": ["Hentai"]}}
                cursor = db.anime.find(query).sort("score", -1).limit(limit)
                return [doc["anime_id"] async for doc in cursor]
            else:
                cursor = db.anime.find({"genres": {"$nin": ["Hentai"]}}).sort("score", -1).limit(limit)
                return [doc["anime_id"] async for doc in cursor]

        if self.anime_df.empty or self.cosine_sim is None:
            await self.load_data()

        candidate_scores = {}
        for anime_id in liked_anime:
            similar_animes = await self.get_content_based_recommendations(anime_id, limit=10)
            for i, sim_anime_id in enumerate(similar_animes):
                weight = 1.0 / (i + 1)
                candidate_scores[sim_anime_id] = candidate_scores.get(sim_anime_id, 0) + weight

        seen_cursor = db.interactions.find({"user_id": user_id})
        seen_anime = [doc["anime_id"] async for doc in seen_cursor]
        
        for seen in seen_anime:
            if seen in candidate_scores:
                del candidate_scores[seen]

        sorted_candidates = sorted(candidate_scores.items(), key=lambda x: x[1], reverse=True)
        recommended_ids = [candidate[0] for candidate in sorted_candidates[:limit]]

        # A sparse or very new profile can produce fewer similar titles than the
        # requested page size. Fill the remaining slots with highly rated unseen
        # anime so the recommendations area never looks broken or empty.
        if len(recommended_ids) < limit:
            fallback_cursor = db.anime.find({
                "anime_id": {"$nin": [*seen_anime, *recommended_ids]},
                "genres": {"$nin": ["Hentai"]},
            }).sort("score", -1).limit(limit - len(recommended_ids))
            recommended_ids.extend([doc["anime_id"] async for doc in fallback_cursor])

        return recommended_ids

recommender = RecommenderEngine()
