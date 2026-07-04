"""Ungovernable API — personal goals & finance tracker.

Single user. Identity/authorization is enforced by Azure App Service Easy Auth
in front of this app; in production the platform injects the authenticated
principal as request headers (X-MS-CLIENT-PRINCIPAL-*). We don't re-implement
auth here, but `/api/me` surfaces who the platform says you are.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import dashboard, external, finance, habits, projects, upskilling, workouts

load_dotenv()

# Create tables on startup (simple single-user app; Alembic available for prod).
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=os.getenv("API_TITLE", "Ungovernable API"),
    version=os.getenv("API_VERSION", "1.0.0"),
)

# CORS: local dev uses a separate Vite origin; in production the SPA is served
# same-origin so CORS is effectively a no-op. Extra origins via env (comma-sep).
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
]
origins += [o for o in os.getenv("EXTRA_CORS_ORIGINS", "").split(",") if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (finance, habits, projects, workouts, dashboard, external, upskilling):
    app.include_router(r.router)


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/me")
async def me(request: Request):
    """Reflect the Easy Auth principal injected by App Service (if present)."""
    name = request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME")
    return {"authenticated": bool(name), "name": name or "local-dev"}


# --------------------------------------------------------------------------- #
# Serve the built SPA same-origin (production). When frontend/dist exists, mount
# its assets and fall back to index.html for client-side routes. Serving the SPA
# from this app means Azure Easy Auth protects the entire surface at the edge.
# In local dev (no dist) Vite serves the frontend separately via its proxy.
# --------------------------------------------------------------------------- #
_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        # Never shadow the API; unknown /api paths should 404 as JSON.
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}
        candidate = _DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
