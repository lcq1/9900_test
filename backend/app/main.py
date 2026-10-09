"""FastAPI application entrypoint: wiring, CORS, lifespan and routers."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.administrator.routes import router as admin_router
from app.core.config import settings
from app.core.database import Base
from app.core.routes import router as core_router
from app.participant.routes import ai_router, router as participant_router
from app.researcher.routes import router as researcher_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("beyond")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (dev/test convenience; production uses migrations).
    # Engine is imported lazily so tests can swap in an isolated engine.
    from app.core.database import engine

    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured.")
    yield


app = FastAPI(title="Beyond Backend API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(core_router, prefix='/api')
app.include_router(researcher_router, prefix='/api')
app.include_router(participant_router, prefix='/api')
app.include_router(ai_router, prefix='/api')
app.include_router(admin_router, prefix='/api')

# ---------------------------------------------------------------------------
# Single-process deployment: serve the built React SPA from this same app.
# `backend/static` is produced by `build-and-stage.sh` from `frontend/dist`.
# Everything below is guarded so the API still boots when the bundle is absent.
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).resolve().parents[1] / 'static'
STATIC_INDEX = STATIC_DIR / 'index.html'
STATIC_ASSETS_DIR = STATIC_DIR / 'assets'
STATIC_AVAILABLE = STATIC_INDEX.is_file()

if STATIC_ASSETS_DIR.is_dir():
    app.mount('/assets', StaticFiles(directory=STATIC_ASSETS_DIR), name='assets')
else:
    logger.warning("Static assets directory not found at %s", STATIC_ASSETS_DIR)


@app.get("/")
def serve_index() -> FileResponse:
    """Serve the SPA entry document."""
    if not STATIC_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Frontend bundle not built; run build-and-stage.sh.",
        )
    return FileResponse(STATIC_INDEX)


@app.get("/{full_path:path}")
def serve_spa(full_path: str) -> FileResponse:
    """SPA fallback: real static file if present, otherwise index.html.

    Paths under `/api` are never handled here — those belong to the routers
    registered above, and Starlette matches them before this catch-all.
    """
    if full_path.startswith("api"):
        # Defensive guard: never let the SPA fallback shadow API routes.
        raise HTTPException(status_code=404, detail="Not Found")

    if not STATIC_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Frontend bundle not built; run build-and-stage.sh.",
        )

    candidate = (STATIC_DIR / full_path).resolve()
    if candidate.is_file() and STATIC_DIR in candidate.parents:
        return FileResponse(candidate)

    return FileResponse(STATIC_INDEX)
