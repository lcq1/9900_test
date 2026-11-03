"""Application configuration via environment variables / .env.

Uses pydantic-settings. PostgreSQL is required in every environment.
AI requires explicit provider credentials and never returns mock replies.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    """Runtime settings for the Beyond backend."""

    model_config = SettingsConfigDict(
        # Read the project file even when uvicorn is launched inside backend/.
        # A working-directory .env and process environment can override it.
        env_file=(Path(__file__).resolve().parents[3] / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/experiment_platform"
    )

    @field_validator("database_url")
    @classmethod
    def require_postgresql(cls, value: str) -> str:
        try:
            url = make_url(value)
        except ArgumentError as exc:
            raise ValueError(
                "DATABASE_URL must be a valid PostgreSQL connection URL"
            ) from exc
        if url.drivername not in ("postgres", "postgresql", "postgresql+psycopg"):
            raise ValueError("Only PostgreSQL with psycopg is supported")
        return url.set(drivername="postgresql+psycopg").render_as_string(
            hide_password=False
        )

    # Empty uses backend/storage; relative paths are resolved from backend/.
    local_storage_dir: str = ""
    storage_locations: dict[str, str] = {}
    storage_default_location: str = "legacy"

    access_allowlist_enabled: bool = False
    allowed_emails: str = ""
    allowed_domains: str = ""

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

    # Both transports share the same credential, completion URL and model settings.
    # WorkBuddy uses its public application key, not a model-provider secret.
    ai_provider: str = Field(default="openai_compatible", min_length=1, max_length=32)
    ai_api_key: str | None = None
    ai_model: str = "gpt-4o-mini"
    ai_api_base: str = "https://api.openai.com/v1/chat/completions"
    ai_stream: bool = True
    ai_timeout_seconds: float = Field(default=60, gt=0, le=600)
    ai_temperature: float | None = Field(default=None, ge=0, le=2)
    ai_system_prompt: str | None = None
    ai_max_prompt_chars: int = Field(default=4000, ge=1, le=20000)
    ai_history_messages: int = Field(default=8, ge=0, le=100)
    ai_history_message_chars: int = Field(default=2000, ge=1, le=20000)

    @property
    def cors_origin_list(self) -> list[str]:
        """Return CORS origins as a trimmed list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""
    return Settings()


settings = get_settings()


def require_allowed_email(email: str) -> str:
    """Match exact case-insensitive emails or exact domains; never suffix-match."""
    from fastapi import HTTPException
    normalized = email.strip().lower()
    if normalized.count("@") != 1 or any(char.isspace() for char in normalized):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    local, domain = normalized.split("@")
    if not local or not domain or domain.startswith(".") or domain.endswith("."):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if settings.access_allowlist_enabled:
        emails = {item.strip().lower() for item in settings.allowed_emails.split(",") if item.strip()}
        domains = {item.strip().lower() for item in settings.allowed_domains.split(",") if item.strip()}
        if normalized not in emails and domain not in domains:
            raise HTTPException(status_code=403, detail="This email is not permitted to access this study platform. Contact the researcher.")
    return normalized
