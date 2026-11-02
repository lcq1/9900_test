"""FastAPI application entrypoint: wiring, CORS, lifespan and routers."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.administrator.routes import router as admin_router, workspace_router
from app.core.config import settings
from app.core.routes import router as core_router
from app.participant.routes import router as participant_router, ai_router
from app.researcher.routes import router as researcher_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("beyond")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Alembic owns schema creation. Startup checks connectivity without changing it.
    from app.core.database import engine

    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    logger.info("PostgreSQL connection established.")
    yield


app = FastAPI(title="Beyond Backend API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(core_router, prefix="/api")
app.include_router(researcher_router, prefix="/api")
app.include_router(participant_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(workspace_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
