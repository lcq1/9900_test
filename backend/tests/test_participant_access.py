"""Public entry and scoped participant permissions."""
from app.core import database
from app.researcher.models import Experiment

def live_experiment(client, headers, code="ENTRY1"):
    response = client.post("/api/experiments", headers=headers, json={"name": "Entry", "code": code, "stages": []})
    assert response.status_code == 201
    data = response.json()
    with database.SessionLocal() as db:
        exp = db.get(Experiment, data["id"])
        exp.status = "Live"
        exp.code = code
        data["code"] = code
        exp.stages = [{"id": "stage-" + code, "name": "Study", "type": "task", "components": [], "features": {"ai": True}}]
        db.commit()
    return data

def login(client, code="entry1", participant="P01"):
    response = client.post("/api/participant/access", json={"experimentCode": code, "participantCode": participant})
    assert response.status_code == 200, response.text
    return {"X-Participant-Token": response.json()["token"]}

def test_public_entry_submission_and_isolation(client, auth_headers):
    exp = live_experiment(client, auth_headers)
    other = live_experiment(client, auth_headers, "ENTRY2")
    headers = login(client)
    assert client.get("/api/ai/config", headers=headers).status_code == 200
    payload = {"experimentCode": exp["code"], "participantCode": "P01", "answers": [], "events": []}
    assert client.post("/api/participant/sessions", headers=headers, json=payload).status_code == 422
    import uuid
    payload["sessionId"] = str(uuid.uuid4())
    assert client.post("/api/participant/sessions/start", headers=headers, json=payload).status_code == 200
    response = client.post("/api/participant/sessions", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    session_id = response.json()["id"]
    assert client.post("/api/participant/stages/stage-ENTRY1/submit", headers=headers, json=payload).status_code == 200
    assert client.post("/api/participant/sessions", headers=headers, json={**payload, "participantCode": "P02"}).status_code == 403
    assert client.post("/api/participant/sessions", headers=headers, json={**payload, "experimentCode": other["code"]}).status_code == 403
    for path in ["/api/experiments", "/api/participant/sessions", f"/api/participant/sessions/{session_id}", f"/api/participant/sessions/{session_id}/csv"]:
        assert client.get(path, headers=headers).status_code == 401
    assert client.get("/api/participant/stages/stage-ENTRY2/ai-messages", headers=headers).status_code == 404
    assert client.get("/api/participant/stages/stage-ENTRY1/ai-messages", headers=headers).status_code == 200
    import uuid
    upload = f"/api/participant/sessions/{session_id}/recordings/{uuid.uuid4()}?stage_id=stage-ENTRY1&kind=screen&offset=0"
    assert client.post(upload, headers=login(client, participant="P02"), content=b"test").status_code == 403
    assert client.post("/api/participant/sessions", headers={"Authorization": "Bearer " + headers["X-Participant-Token"]}, json=payload).status_code == 401
    with database.SessionLocal() as db:
        db.get(Experiment, exp["id"]).status = "Draft"
        db.commit()
    assert client.post("/api/participant/sessions", headers=headers, json=payload).status_code == 403

def test_entry_rejects_draft_invalid_and_short_codes(client, auth_headers):
    draft = client.post("/api/experiments", headers=auth_headers, json={"name": "Draft", "stages": []}).json()["code"]
    for code, participant, expected in [(draft, "P01", 403), ("MISSING", "P01", 404), (draft, "P", 400)]:
        r = client.post("/api/participant/access", json={"experimentCode": code, "participantCode": participant})
        assert r.status_code == expected


def test_resume_unfinished_session_by_experiment_and_participant(client, auth_headers):
    import uuid
    exp = live_experiment(client, auth_headers, "RESUME1")
    headers = login(client, "RESUME1", "RESUME-P01")
    payload = {"experimentCode": exp["code"], "participantCode": "RESUME-P01", "sessionId": str(uuid.uuid4())}
    first = client.post("/api/participant/sessions/start", headers=headers, json=payload)
    assert first.status_code == 200
    session_id = first.json()["sessionId"]
    progress = {"sessionId": session_id, "updatedAt": 123, "stageIndex": 0, "answers": {"draft": "Unfinished answer"}, "deadlines": {"task": 1793664000000}}
    saved = client.post("/api/participant/sessions", headers=headers, json={**payload, "sessionId": session_id, "finishedAt": None, "answers": [{"componentId": "draft", "value": "Unfinished answer"}], "events": [{"seq": 0, "type": "progress_checkpoint", "timestamp": "2026-11-03T01:00:00Z", "epochMs": 1793667600000, "perfMs": 0, "detail": {"progress": progress}}]})
    assert saved.status_code == 201
    resumed = client.post("/api/participant/sessions/start", headers=headers, json={**payload, "sessionId": str(uuid.uuid4())})
    assert resumed.status_code == 200
    assert resumed.json()["sessionId"] == session_id
    assert resumed.json()["progress"] == progress
    assert resumed.json()["experiment"] == first.json()["experiment"]
    other = client.post("/api/participant/sessions/start", headers=login(client, "RESUME1", "RESUME-P02"), json={**payload, "participantCode": "RESUME-P02", "sessionId": str(uuid.uuid4())})
    assert other.status_code == 200
    assert other.json()["sessionId"] != session_id
    assert other.json()["progress"] is None


def test_issued_codes_are_scoped_and_revocable(client, auth_headers):
    created = client.post("/api/experiments", headers=auth_headers, json={
        "name": "Single-page study", "status": "Live",
        "storageNotice": "This pilot uses approved study storage.",
        "stages": [{"id": "welcome", "type": "instruction", "name": "Welcome",
                    "components": [{"id": "text", "type": "text", "label": "Welcome"}]}],
    })
    assert created.status_code == 201
    experiment = created.json()
    path = f"/api/experiments/{experiment['id']}/participant-codes"
    issued = client.post(path, headers=auth_headers)
    assert issued.status_code == 201
    code = issued.json()["code"]
    assert client.get(path, headers=auth_headers).json() == [{"code": code, "revoked": False}]
    access = "/api/participant/access"
    assert client.post(access, json={"experimentCode": experiment["code"], "participantCode": "unknown"}).status_code == 403
    opened = client.post(access, json={"experimentCode": experiment["code"], "participantCode": code})
    assert opened.status_code == 200
    assert opened.json()["experiment"]["storageNotice"] == "This pilot uses approved study storage."
    assert client.delete(path + "/" + code, headers=auth_headers).status_code == 204
    assert client.post(access, json={"experimentCode": experiment["code"], "participantCode": code}).status_code == 403
    assert client.get("/api/ai/config", headers={"X-Participant-Token": opened.json()["token"]}).status_code == 403


def test_participant_capture_waits_for_persisted_consent(client, auth_headers, monkeypatch, tmp_path):
    import json
    import uuid
    from app.participant import ai_proxy
    from app.core.config import settings
    from app.core import storage
    monkeypatch.setattr(settings, "ai_api_key", "consent-test-key")
    monkeypatch.setattr(settings, "ai_api_base", "https://consent.example/v1/chat/completions")
    monkeypatch.setattr(settings, "ai_stream", False)
    monkeypatch.setattr(storage, "STORAGE_DIR", str(tmp_path))
    async def fake_chat(*args):
        yield {"type": "delta", "text": "ready", "model": "test"}
        yield {"type": "done", "model": "test"}
    monkeypatch.setattr(ai_proxy, "stream_chat", fake_chat)
    study = client.post("/api/experiments", headers=auth_headers, json={
        "name": "Consent gate", "status": "Live", "stages": [
            {"id": "consent-gate", "type": "consent", "name": "Consent",
             "signingMethod": "name", "consentClauses": ["Approved clause"],
             "components": [{"id": "information", "type": "text", "label": "Approved information"}]},
            {"id": "consent-task", "type": "short_answer", "name": "Task",
             "features": {"ai": True, "screenRecording": True},
             "components": [{"id": "task-text", "type": "text", "label": "Task"}]},
        ],
    })
    assert study.status_code == 201, study.text
    code = study.json()["code"]
    headers = login(client, code)
    payload = {"experimentCode": code, "participantCode": "P01", "sessionId": str(uuid.uuid4())}
    started = client.post("/api/participant/sessions/start", headers=headers, json=payload)
    assert started.status_code == 200
    payload["sessionId"] = started.json()["sessionId"]
    chat = {"sessionId": payload["sessionId"], "content": "hello",
            "conversationId": str(uuid.uuid4()), "requestId": str(uuid.uuid4())}
    upload = f"/api/participant/sessions/{payload['sessionId']}/recordings/{uuid.uuid4()}"
    params = {"stage_id": "consent-task", "kind": "screen", "offset": 0}
    assert client.post("/api/participant/stages/consent-task/ai-stream", headers=headers, json=chat).status_code == 403
    assert client.post(upload, headers=headers, params=params, content=b"header").status_code == 403
    consent = {"method": "name", "name": "Test Participant", "readToEnd": True,
               "signedAt": "2026-11-05T01:00:00Z", "document": ["Approved information"],
               "clauses": [{"text": "Approved clause", "accepted": True}]}
    accepted = client.post("/api/participant/stages/consent-gate/submit", headers=headers, json={
        **payload, "consentAccepted": True,
        "answers": [{"componentId": "consent", "value": json.dumps(consent)}],
    })
    assert accepted.status_code == 200, accepted.text
    assert client.post("/api/participant/stages/consent-task/ai-stream", headers=headers, json=chat).status_code == 200
    assert client.post(upload, headers=headers, params=params, content=b"header").status_code == 200
