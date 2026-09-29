"""Administrator identity persistence."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Administrator


class AdministratorRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_default(self) -> Administrator | None:
        return self.db.scalar(select(Administrator).where(Administrator.username == "administrator"))

    def ensure_default(self, password_hash: str) -> Administrator:
        administrator = self.get_default()
        if administrator is None:
            administrator = Administrator(username="administrator", password_hash=password_hash)
            self.db.add(administrator)
            self.db.flush()
        elif administrator.password_hash != password_hash:
            administrator.password_hash = password_hash
        return administrator
