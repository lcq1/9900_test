"""Experiment CRUD round-trip tests."""
from __future__ import annotations


def _create(client, headers, **overrides):
    payload = {
        "name": "Exp1",
        "code": "EXP1",
        "status": "Draft",
        "fullScreen": False,
        "stages": [],
    }
    payload.update(overrides)
    return client.post("/api/experiments", json=payload, headers=headers)


def test_experiment_crud_roundtrip(client, auth_headers):
    r = _create(client, auth_headers)
    assert r.status_code == 201
    exp = r.json()
    assert exp["code"] == "EXP1"
    assert exp["created"]  # free-form date string
    assert exp["stages"] == []
    exp_id = exp["id"]

    r = client.get("/api/experiments", headers=auth_headers)
    assert r.status_code == 200
    assert any(e["id"] == exp_id for e in r.json())

    r = client.get(f"/api/experiments/{exp_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["code"] == "EXP1"

    r = client.get("/api/experiments/missing-id", headers=auth_headers)
    assert r.status_code == 404

    r = client.patch(
        f"/api/experiments/{exp_id}",
        json={"status": "Live", "fullScreen": True},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "Live"
    assert r.json()["fullScreen"] is True

    r = client.delete(f"/api/experiments/{exp_id}", headers=auth_headers)
    assert r.status_code == 204

    r = client.get(f"/api/experiments/{exp_id}", headers=auth_headers)
    assert r.status_code == 404


def test_experiment_stages_shape_roundtrip(client, auth_headers):
    stage = {
        "id": "s1",
        "name": "Stage 1",
        "type": "survey",
        "duration": 10,
        "components": [
            {"id": "c1", "type": "text", "label": "Q1", "required": True}
        ],
        "features": {"ai": True, "timer": False},
        "countdownMinutes": 5,
    }
    r = _create(client, auth_headers, stages=[stage])
    assert r.status_code == 201
    exp = r.json()
    assert len(exp["stages"]) == 1
    assert exp["stages"][0]["id"] == "s1"
    assert exp["stages"][0]["components"][0]["label"] == "Q1"
    assert exp["stages"][0]["features"]["ai"] is True
    assert exp["stages"][0]["countdownMinutes"] == 5


def test_experiment_duplicate_code(client, auth_headers):
    assert _create(client, auth_headers, code="DUP").status_code == 201
    assert _create(client, auth_headers, code="DUP").status_code == 409


def test_experiments_require_auth(client):
    assert client.get("/api/experiments").status_code == 401
