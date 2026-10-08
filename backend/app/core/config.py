"""Application configuration via environment variables / .env.

Uses pydantic-settings. All values have sane local-development defaults so the
backend runs with no external secrets (SQLite + local storage + deterministic
mock AI). Production switches to PostgreSQL via ``DATABASE_URL`` and enables
OneDrive / LLM integration by setting the relevant variables.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the Beyond backend."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Database: SQLite by default; use postgresql://... for production.
    database_url: str = "sqlite:///./dev.db"

    # JWT / auth
    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 1 day

    # CORS: comma-separated list of allowed origins.
    cors_origins: str = "http://localhost:5173"

    # Microsoft Graph / OneDrive (optional; local ./storage fallback when absent).
    onedrive_client_id: str | None = None
    onedrive_client_secret: str | None = None
    onedrive_tenant_id: str | None = None

    # AI proxy (optional; deterministic mock reply when absent).
    ai_api_key: str | None = None
    ai_api_base: str = "https://api.openai.com/v1/chat/completions"

    @property
    def cors_origin_list(self) -> list[str]:
        """Return CORS origins as a trimmed list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""
    return Settings()


settings = get_settings()
