"""Administrator authentication and system-wide query tests."""

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.security import hash_secret

from test_researcher_api import register_and_login


def test_administrator_can_list_researchers_and_experiments(client: TestClient) -> None:
    register_and_login(client)
    client.post("/api/auth/logout")

    settings = get_settings()
    previous_hash = settings.admin_password_hash
    settings.admin_password_hash = hash_secret("AdminPass123!")
    try:
        login = client.post("/api/auth/administrator/login", json={"password": "AdminPass123!"})
        assert login.status_code == 200
        assert login.json()["data"]["role"] == "administrator"
        researchers = client.get("/api/administrator/researchers")
        assert researchers.status_code == 200
        assert len(researchers.json()["data"]) == 1
        experiments = client.get("/api/administrator/experiments")
        assert experiments.status_code == 200
    finally:
        settings.admin_password_hash = previous_hash
