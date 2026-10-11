"""Administrator platform-settings tests."""
from __future__ import annotations


def test_settings_get_and_patch(client, auth_headers):
    r = client.get("/api/admin/settings", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "allowSelfRegistration" in data
    assert "requireConsentSignature" in data
    assert "dataRetentionDays" in data
    assert "maxSessionMinutes" in data
    assert data["dataRetentionDays"] == 365

    r = client.patch(
        "/api/admin/settings",
        json={"dataRetentionDays": 100, "maxSessionMinutes": 30},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["dataRetentionDays"] == 100
    assert r.json()["maxSessionMinutes"] == 30

    # persisted
    r = client.get("/api/admin/settings", headers=auth_headers)
    assert r.json()["dataRetentionDays"] == 100


def test_admin_requires_auth(client):
    assert client.get("/api/admin/settings").status_code == 401