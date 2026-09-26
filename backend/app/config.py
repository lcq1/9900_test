"""Typed environment configuration; secrets are loaded at runtime only."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings shared by database, auth, storage and AI adapters."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    app_secret_key: str = "development-only-change-me"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/experiment_platform"
    session_cookie_name: str = "experiment_session"
    session_cookie_secure: bool = False
    session_ttl_seconds: int = 86_400
    admin_password_hash: str = ""
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    ai_api_base_url: str = ""
    ai_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    """Build settings once per process; tests can clear the cache if needed."""

    return Settings()
