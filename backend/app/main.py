"""FastAPI application and stable top-level router registration."""

from fastapi import FastAPI

from .administrator.routes import router as administrator_router
from .core.routes import router as core_router
from .participant.routes import router as participant_router
from .researcher.routes import router as researcher_router


app = FastAPI(title="Experiment Platform API", version="0.2.0")
app.include_router(core_router, prefix="/api")
app.include_router(researcher_router, prefix="/api")
app.include_router(administrator_router, prefix="/api")
app.include_router(participant_router, prefix="/api")


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
