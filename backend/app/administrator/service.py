"""Administrator authentication and system-wide read services."""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.schemas import CurrentUser
from ..core.security import verify_secret
from ..researcher.repository import ExperimentRepository, ResearcherRepository
from ..researcher.schemas import ExperimentRead, ResearcherRead
from ..researcher.service import ExperimentService
from .models import Administrator
from .repository import AdministratorRepository


class AdministratorService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.administrators = AdministratorRepository(db)

    def authenticate(self, password: str):
        configured_hash = get_settings().admin_password_hash
        if not configured_hash:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Administrator login is not configured",
            )
        if not verify_secret(configured_hash, password):
            return None
        administrator = self.administrators.ensure_default(configured_hash)
        return administrator

    def current_user(self, administrator_id) -> CurrentUser:
        administrator = self.db.get(Administrator, administrator_id)
        if administrator is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        return CurrentUser(id=administrator.id, role="administrator")

    def list_researchers(self) -> list[ResearcherRead]:
        return [ResearcherRead.model_validate(item) for item in ResearcherRepository(self.db).list_all()]

    def list_experiments(self) -> list[ExperimentRead]:
        service = ExperimentService(self.db)
        return [service.to_read(item) for item in ExperimentRepository(self.db).list_all()]
