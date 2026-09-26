"""FastAPI application factory surface and top-level route registration."""

from fastapi import FastAPI

from .routes import api_router


app = FastAPI(title="Experiment Platform API", version="0.1.0")
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    """Lightweight liveness endpoint; database readiness can be added later."""

    return {"status": "ok"}
