"""HTTP route layer: validation and response mapping only.

Keep SQL in repositories and business decisions in services. Protected routes
must derive identity and role from a server-side session, never request fields.
"""

from fastapi import APIRouter, HTTPException, status

from .schemas import AdministratorCredentials, ApiResponse, ParticipantCredentials, ResearcherCredentials


api_router = APIRouter()


@api_router.post("/auth/researcher/login", tags=["auth"])
def researcher_login(credentials: ResearcherCredentials) -> ApiResponse[None]:
    """Authenticate a researcher with a generic error on every failure mode."""

    _ = credentials
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Authentication is not implemented")


@api_router.post("/auth/participant/login", tags=["auth"])
def participant_login(credentials: ParticipantCredentials) -> ApiResponse[None]:
    """Verify experiment and participant codes without logging either code."""

    _ = credentials
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Authentication is not implemented")


@api_router.post("/auth/administrator/login", tags=["auth"])
def administrator_login(credentials: AdministratorCredentials) -> ApiResponse[None]:
    """Verify the configured administrator hash and establish an admin session."""

    _ = credentials
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Authentication is not implemented")


# TODO: register /auth/me, /auth/logout, experiment CRUD, participant workflow,
# file upload-url and AI job routes from the plan once their services are ready.
