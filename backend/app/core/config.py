"""Typed runtime configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings; secrets must be supplied at runtime."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    app_secret_key: str = "development-only-change-me"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/experiment_platform"
    session_cookie_name: str = "experiment_session"
    session_cookie_secure: bool = False
    session_ttl_seconds: int = 86_400
    admin_password_hash: str = ""


@lru_cache
def get_settings() -> Settings:
    """Create one immutable-by-convention settings object per process."""

    return Settings()
