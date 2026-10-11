"""Auth and researcher management tests."""
from __future__ import annotations

from tests.conftest import register_and_login


def test_register_returns_researcher(client):
    r = client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "alice@example.com", "password": "pw12345"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "alice@example.com"
    assert data["role"] == "researcher"
    assert "id" in data
    # camelCase contract
    assert "createdAt" in data


def test_register_duplicate_email(client):
    payload = {"name": "C", "email": "c@example.com", "password": "pw"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409


def test_login_success_returns_session_shape(client):
    client.post(
        "/api/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "pw12345"},
    )
    r = client.post("/api/auth/login", json={"email": "bob@example.com", "password": "pw12345"})
    assert r.status_code == 200
    body = r.json()
    assert "token" in body
    assert "researcher" in body
    assert "issuedAt" in body  # matches frontend Session type
    assert body["researcher"]["email"] == "bob@example.com"


def test_login_wrong_password(client):
    client.post(
        "/api/auth/register",
        json={"name": "Eve", "email": "eve@example.com", "password": "pw"},
    )
    r = client.post("/api/auth/login", json={"email": "eve@example.com", "password": "nope"})
    assert r.status_code == 401


def test_protected_endpoint_requires_auth(client):
    assert client.get("/api/researchers").status_code == 401


def test_list_researchers_and_promote(client):
    client.post(
        "/api/auth/register",
        json={"name": "Dan", "email": "dan@example.com", "password": "pw"},
    )
    r = client.post(
        "/api/auth/register",
        json={"name": "Promotee", "email": "prom@example.com", "password": "pw"},
    )
    promotee_id = r.json()["id"]

    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/researchers", headers=headers)
    assert r.status_code == 200
    assert any(u["email"] == "dan@example.com" for u in r.json())

    r = client.patch(f"/api/researchers/{promotee_id}/promote", headers=headers)
    assert r.status_code == 200
    assert r.json()["role"] == "administrator"


def test_logout(client):
    assert client.post("/api/auth/logout").status_code == 200