# Deployment

This project can be deployed as two Render web services backed by MongoDB Atlas.

## 1. Create MongoDB Atlas

Create a cluster and database user, then copy the connection string. Add the connection string as `MONGO_URL` in Render. For a first deployment, allow Render to connect through Atlas Network Access; tighten the rule later if your plan provides fixed outbound IPs.

## 2. Deploy with Render

1. Push this repository to GitHub or another Git provider.
2. In Render, choose **New > Blueprint** and select the repository.
3. Render will read `render.yaml` and create the backend and frontend services.
4. Set `MONGO_URL` on `anime-recommendation-api`.
5. Set `NEXT_PUBLIC_API_URL` on `anime-recommendation-frontend` to the backend URL followed by `/api/v1`, for example `https://anime-recommendation-api.onrender.com/api/v1`.
6. After the frontend URL is known, set `BACKEND_CORS_ORIGINS` on the backend to a JSON array containing that URL, for example `["https://anime-recommendation-frontend.onrender.com"]`.
7. Redeploy both services.

Render generates `SECRET_KEY` automatically from the blueprint. Keep MongoDB credentials and service environment variables out of Git.

## Local environment files

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local` when running the deployed configuration locally. These files are ignored by Git.