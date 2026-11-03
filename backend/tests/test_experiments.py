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
    assert exp["code"].startswith("EXP-")
    assert exp["created"]  # free-form date string
    assert exp["stages"] == []
    exp_id = exp["id"]

    r = client.get("/api/experiments", headers=auth_headers)
    assert r.status_code == 200
    assert any(e["id"] == exp_id for e in r.json())

    r = client.get(f"/api/experiments/{exp_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["code"] == exp["code"]

    r = client.get("/api/experiments/missing-id", headers=auth_headers)
    assert r.status_code == 404

    r = client.patch(
        f"/api/experiments/{exp_id}",
        json={"status": "Live", "fullScreen": True},
        headers=auth_headers,
    )
    assert r.status_code == 422
    r = client.patch(f"/api/experiments/{exp_id}", json={"fullScreen": True}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "Draft"
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
        "components": [{"id": "c1", "type": "text", "label": "Q1", "required": True}],
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


def test_codes_generated_by_server_and_immutable(client, auth_headers):
    first = _create(client, auth_headers, code="DUP").json()
    second = _create(client, auth_headers, code="DUP").json()
    assert first["code"] != second["code"]
    assert first["code"] != "DUP"
    assert (
        client.patch(
            "/api/experiments/" + first["id"],
            json={"code": "OTHER"},
            headers=auth_headers,
        ).status_code
        == 422
    )


def test_experiments_require_auth(client):
    assert client.get("/api/experiments").status_code == 401


def test_stage_update_persists_and_cross_owner_access_denied(client, auth_headers):
    from tests.conftest import register_and_login

    experiment = _create(client, auth_headers).json()
    stage = {
        "id": "stage-1",
        "name": "Question",
        "type": "short_answer",
        "components": [],
        "features": {},
    }
    response = client.patch(
        "/api/experiments/" + experiment["id"],
        json={"stages": [stage]},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert (
        client.get("/api/experiments/" + experiment["id"], headers=auth_headers).json()[
            "stages"
        ][0]["id"]
        == "stage-1"
    )
    other = {
        "Authorization": "Bearer "
        + register_and_login(client, email="other@example.com")
    }
    assert client.get("/api/experiments", headers=other).json() == []
    for method in ("get", "patch", "delete"):
        response = getattr(client, method)(
            "/api/experiments/" + experiment["id"],
            headers=other,
            **({"json": {"name": "Changed"}} if method == "patch" else {}),
        )
        assert response.status_code == 404
    assert (
        client.get(
            "/api/experiments/" + experiment["id"] + "/results.csv", headers=other
        ).status_code
        == 404
    )


def test_full_session_and_editor_extensions_survive(
    client, auth_headers, admin_headers
):
    stage = {
        "id": "stage",
        "name": "Design",
        "type": "short_answer",
        "components": [
            {
                "id": "answer",
                "type": "textbox",
                "label": "Response",
                "placeholder": "Keep me",
            }
        ],
        "features": {"ai": True},
        "customStageSetting": {"enabled": True},
    }
    response = client.post(
        "/api/experiments",
        headers=auth_headers,
        json={"name": "Retained UI", "stages": [stage]},
    )
    assert response.status_code == 201
    experiment = response.json()
    assert experiment["stages"][0]["customStageSetting"] == {"enabled": True}
    assert experiment["stages"][0]["components"][0]["placeholder"] == "Keep me"
    response = client.patch(
        f'/api/experiments/{experiment["id"]}',
        headers=auth_headers,
        json={"stages": experiment["stages"]},
    )
    assert response.json()["stages"][0]["components"][0]["placeholder"] == "Keep me"
    timestamp = 1793066400123
    detail = {
        "componentId": "answer",
        "value": "全文" * 700,
        "signatureDataUrl": "data:image/png;base64,c2ln",
        "fileName": "notes.txt",
    }
    response = client.post(
        "/api/participant/sessions",
        headers=auth_headers,
        json={
            "experimentCode": experiment["code"],
            "participantCode": "P-001",
            "finishedAt": None,
            "answers": [{"componentId": "answer", "value": detail["value"]}],
            "events": [
                {
                    "seq": 0,
                    "type": "answer",
                    "timestamp": "2026-10-27T02:00:00.123Z",
                    "epochMs": timestamp,
                    "perfMs": 10,
                    "stageId": "stage",
                    "detail": detail,
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    session = response.json()
    assert session["events"][0]["epochMs"] == timestamp
    assert session["events"][0]["detail"] == detail
    assert (
        client.get(
            f'/api/participant/sessions/{session["id"]}', headers=admin_headers
        ).status_code
        == 200
    )
    assert (
        client.get(
            f'/api/participant/sessions/{session["id"]}/csv', headers=auth_headers
        ).status_code
        == 200
    )
    summary = client.get(
        f'/api/experiments/{experiment["id"]}/results/summary', headers=auth_headers
    ).json()
    assert summary == {"completed_count": 0, "incomplete_count": 1}



def test_unpublish_pauses_participation_and_republish_keeps_history(client, auth_headers):
    from uuid import uuid4
    from app.core import database
    from app.researcher.models import Experiment
    from app.researcher import repository as versions
    stages = [{"id": "consent", "name": "Consent", "type": "consent", "components": [{"id": "intro", "type": "text", "label": "Consent text"}]},
              {"id": "task", "name": "Task", "type": "short_answer", "components": [{"id": "answer", "type": "textbox", "label": "Answer"}]}]
    experiment = _create(client, auth_headers, stages=stages).json()
    path = f"/api/experiments/{experiment['id']}"
    assert client.patch(path, headers=auth_headers, json={"publish": True, "publishRequestId": str(uuid4())}).json()["status"] == "Live"
    login = {"experimentCode": experiment["code"], "participantCode": "P001"}
    access = client.post("/api/participant/access", json=login).json()
    actor = {"X-Participant-Token": access["token"]}
    sid = str(uuid4())
    assert client.post("/api/participant/sessions/start", headers=actor, json={**login, "sessionId": sid}).status_code == 200
    response = client.patch(path, headers=auth_headers, json={"status": "Draft", "publish": False})
    assert response.status_code == 200 and response.json()["status"] == "Draft"
    assert client.post("/api/participant/access", json=login).status_code == 403
    assert client.get("/api/ai/config", headers=actor).status_code == 403
    with database.SessionLocal() as db:
        assert len(versions.published_versions(db, db.get(Experiment, experiment["id"]))) == 1
    assert client.patch(path, headers=auth_headers, json={"publish": True, "publishRequestId": str(uuid4())}).json()["status"] == "Live"
    assert client.post("/api/participant/access", json=login).status_code == 200
    with database.SessionLocal() as db:
        assert [e.detail["version"] for e in versions.published_versions(db, db.get(Experiment, experiment["id"]))] == [1]
        from app.participant.models import ParticipantSession
        assert db.get(ParticipantSession, sid) is not None

    stages[1]["components"][0]["label"] = "Updated answer"
    changed = client.patch(path, headers=auth_headers, json={"stages": stages})
    assert changed.status_code == 200 and changed.json()["status"] == "Draft"
    with database.SessionLocal() as db:
        assert len(versions.published_versions(db, db.get(Experiment, experiment["id"]))) == 1
    published = client.patch(path, headers=auth_headers, json={"publish": True, "publishRequestId": str(uuid4())})
    assert published.status_code == 200 and published.json()["status"] == "Live"
    with database.SessionLocal() as db:
        history = versions.published_versions(db, db.get(Experiment, experiment["id"]))
        assert [event.detail["version"] for event in history] == [1, 2]
        assert history[0].detail["snapshot"]["stages"][1]["components"][0]["label"] == "Answer"
        assert history[1].detail["snapshot"]["stages"][1]["components"][0]["label"] == "Updated answer"
        from app.participant.models import ParticipantEvent
        binding = db.query(ParticipantEvent).filter_by(session_id=sid, type="server.version").one()
        assert binding.detail["version"] == 1



def test_editing_live_experiment_requires_manual_republication(client, auth_headers):
    from uuid import uuid4
    from tests.test_admin_export import published_stages
    from app.core import database
    from app.researcher.models import Experiment
    from app.researcher import repository as versions
    experiment = _create(client, auth_headers, stages=published_stages()).json()
    path = f"/api/experiments/{experiment['id']}"
    publish = lambda: client.patch(path, headers=auth_headers, json={"publish": True, "publishRequestId": str(uuid4())})
    assert publish().json()["status"] == "Live"
    assert client.patch(path, headers=auth_headers, json={"name": experiment["name"]}).json()["status"] == "Live"
    changed = client.patch(path, headers=auth_headers, json={"name": "Changed", "status": "Live"})
    assert changed.status_code == 200 and changed.json()["status"] == "Draft"
    assert client.patch(path, headers=auth_headers, json={"status": "Live"}).status_code == 422
    # An unfinished draft can be saved without satisfying publication rules.
    assert client.patch(path, headers=auth_headers, json={"stages": []}).status_code == 200
    assert publish().status_code == 422
    assert client.patch(path, headers=auth_headers, json={"stages": published_stages()}).status_code == 200
    assert publish().json()["status"] == "Live"
    assert client.patch(path, headers=auth_headers, json={"fullScreen": True}).json()["status"] == "Draft"
    assert publish().json()["status"] == "Live"
    assert client.patch(path, headers=auth_headers, json={"stages": published_stages("Changed question")}).json()["status"] == "Draft"
    with database.SessionLocal() as db:
        assert len(versions.published_versions(db, db.get(Experiment, experiment["id"]))) == 3
