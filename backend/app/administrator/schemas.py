"""Administrator authentication and read-only management schemas."""

from pydantic import Field

from ..core.schemas import ApiModel


class AdministratorCredentials(ApiModel):
    password: str = Field(min_length=8, max_length=256)
