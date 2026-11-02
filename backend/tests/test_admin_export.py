"""Unit test for the CSV export helper (also covers the export contract)."""

from __future__ import annotations

import csv
import io
from types import SimpleNamespace

from app.participant.export_csv import ANSWER_COLUMNS, ACTIVITY_COLUMNS, build_csv, local_time




def test_csv_readable_answers_and_shared_columns():
    study, sessions, answers, events, consents, recordings = csv_fixture()
    text = build_csv(study, sessions, answers, events)
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    columns = reader.fieldnames
    rows = list(reader)
    assert text.startswith("\ufeff") and "\r\n" in text
    assert columns[:7] == ANSWER_COLUMNS
    assert len(columns) == len(set(columns))
    assert len(rows) == 2
    assert rows[0]["Completion status"] == "Completed"
    assert rows[1]["Completion status"] == "In progress"
    assert rows[1]["Completed at (Australia/Sydney)"] == ""
    assert rows[0]["Study"] == "'=Study"
    assert rows[0][columns[7]] == '中文, "quoted"\nsecond line'
    assert rows[0][columns[8]] == "A\nB"
    assert rows[0][columns[9]] == "0"
    assert rows[0][columns[10]] == "No"
    assert rows[0][columns[11]] == "signed name"
    assert rows[0][columns[12]] == "notes.txt"
    assert rows[0][columns[13]] == ""
    assert rows[1]["Unmatched question – old"] == "'=SUM(A1)"
    single = csv.DictReader(io.StringIO(build_csv(
        study, sessions, answers, events, session_id="s1").lstrip("\ufeff")))
    assert single.fieldnames == columns
    assert list(single) == rows[:1]
    empty = csv.DictReader(io.StringIO(build_csv(study, []).lstrip("\ufeff")))
    assert len(empty.fieldnames) == 14 and list(empty) == []
    assert "base64" not in text


def csv_fixture():
    study = SimpleNamespace(name="=Study", code="STUDY", stages=[{
        "id": "stage", "name": "Questionnaire", "components": [
            {"id": "text", "type": "text", "label": "How do you feel?"},
            *[{"id": key, "type": kind, "label": "Response"} for key, kind in [
                ("text-answer", "textbox"), ("multi", "checkbox"), ("zero", "rating"),
                ("false", "choice"), ("signature", "signature"), ("file", "attachment"),
                ("empty", "textbox"),
            ]],
        ],
    }])
    sessions = [
        SimpleNamespace(id="s1", participant_code="P001", started_at="2026-04-04T15:59:59.123Z",
                        finished_at="2026-04-04T16:00:00Z"),
        SimpleNamespace(id="s2", participant_code="P001", started_at="2026-10-03T16:00:00Z",
                        finished_at=None),
    ]
    values = ['中文, "quoted"\nsecond line', ["A", "B"], 0, False, "signed name",
              "data:text/plain;base64,SECRET", None]
    answers = [SimpleNamespace(session_id="s1", component_id=key, value=value)
               for key, value in zip(["text-answer", "multi", "zero", "false", "signature", "file", "empty"], values)]
    answers.append(SimpleNamespace(session_id="s2", component_id="old", value="=SUM(A1)"))

    def event(id, type, timestamp, detail, seq=1):
        return SimpleNamespace(id=id, session_id="s1", stage_id="stage", type=type,
                               timestamp=timestamp, detail=detail, seq=seq,
                               epoch_ms=1791043200000, perf_ms=12)

    events = [
        event("invalid", "timer_tick", "bad-time", {"remaining": 0}),
        event("reply", "ai_reply", "2026-04-04T16:00:00Z", {"text": "AI response"}, 3),
        event("prompt", "ai_prompt", "2026-04-04T16:00:00Z", {"text": "Question?"}, 2),
        event("copy", "copy", "2026-04-04T16:00:00Z", {"text": "=unsafe", "chars": 7}, 4),
        event("file-event", "answer", "2026-04-04T16:00:01Z",
              {"componentId": "file", "value": values[5], "fileName": "notes.txt", "size": 6}),
        event("media-event", "recording_media", "2026-04-04T16:00:02Z",
              {"recordingId": "r1", "path": "/private/storage/file", "kind": "screen"}),
        event("unknown", "custom_event", "", {"nested": {"someValue": False, "storage_path": "/private"},
              "blob": values[5], "items": [{"count": 0}]}),
    ]
    recordings = [SimpleNamespace(id=id, session_id="s1", filename=id + ".webm",
                  created_at="2026-04-04T16:00:03Z") for id in ("r1", "r2")]
    consents = [SimpleNamespace(id="consent", session_id="s1", signed_at="2026-04-04T15:59:59Z",
                name="Participant", payload={"accepted": True})]
    return study, sessions, answers, events, consents, recordings


def test_activity_preserves_events_and_readable_metadata():
    text = build_csv(*csv_fixture(), view="activity")
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    assert reader.fieldnames == ACTIVITY_COLUMNS
    rows = list(reader)
    assert len(rows) == 9
    by_id = {r["Record reference"]: r for r in rows}
    assert [r["Record reference"] for r in rows][:4] == ["consent", "prompt", "reply", "copy"]
    assert {r["Record reference"] for r in rows[-2:]} == {"invalid", "unknown"}
    assert by_id["prompt"]["Activity"] == "AI question"
    assert by_id["reply"]["Content"] == "AI response"
    assert by_id["copy"]["Content"] == "'=unsafe"
    assert by_id["file-event"]["Content"] == "notes.txt"
    assert by_id["media-event"]["Recording file"] == "r1.webm"
    assert by_id["r2"]["Recording download reference"].endswith("/s1/recordings/r2")
    assert by_id["consent"]["Activity"] == "Consent recorded"
    assert by_id["invalid"]["Time (Australia/Sydney)"] == ""
    assert by_id["invalid"]["Original timestamp"] == "bad-time"
    assert by_id["prompt"]["Unix time (ms)"] == "1791043200000"
    assert by_id["prompt"]["Performance time (ms)"] == "12"
    assert "Nested / Some value: No" in by_id["unknown"]["Details"]
    assert by_id["unknown"]["Original event type"] == "custom_event"
    assert "base64" not in text and "/private" not in text
    assert "SECRET" not in text


def test_csv_sydney_dst_and_attachment_fallback():
    assert local_time("2026-04-04T15:59:59.123Z") == "2026-04-05 02:59:59.123+11:00"
    assert local_time("2026-04-04T16:00:00Z") == "2026-04-05 02:00:00.000+10:00"
    assert local_time("2026-10-03T15:59:59Z") == "2026-10-04 01:59:59.000+10:00"
    assert local_time("2026-10-03T16:00:00Z") == "2026-10-04 03:00:00.000+11:00"
    assert local_time("2026-01-01T00:00:00") == ""
    study, sessions, answers, _, _, _ = csv_fixture()
    text = build_csv(study, sessions, answers)
    assert "Attachment recorded" in text and "base64" not in text


def test_csv_multiple_stages_and_formula_safety():
    study, sessions, answers, events, _, _ = csv_fixture()
    study.stages.append({"id": "second", "name": "Questionnaire", "components": [
        {"id": "other", "type": "textbox", "label": "Your answer"},
        {"id": "note", "type": "text", "label": "Repeated prompt"},
        {"id": "latest", "type": "text", "label": "Nearest prompt"},
        {"id": "selection", "type": "choice", "label": "Your choice"},
    ]})
    answers.extend([
        SimpleNamespace(session_id="s1", component_id="other", value="\t=unsafe"),
        SimpleNamespace(session_id="s1", component_id="selection", value="Option A"),
    ])
    reader = csv.DictReader(io.StringIO(build_csv(study, sessions, answers, events).lstrip("\ufeff")))
    rows = list(reader)
    assert rows[0]["Stage 2 – Questionnaire / Q1 – Your answer"] == "'\t=unsafe"
    assert rows[0]["Stage 2 – Questionnaire / Q2 – Nearest prompt (Your choice)"] == "Option A"
    from app.participant.export_csv import safe_cell
    for value in ("=1", "+1", "-1", "@x", "  =1", "\rtext", "\ntext"):
        assert safe_cell(value) == "'" + value
    assert list(csv.DictReader(io.StringIO(build_csv(study, [], view="activity").lstrip("\ufeff")))) == []


def test_csv_http_contract_without_database(monkeypatch):
    """Exercise HTTP serialization and view validation with explicit repository stubs."""
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from app.core.database import get_db
    from app.core.security import get_current_researcher, get_current_administrator
    from app.researcher import routes as researcher_routes
    from app.administrator import routes as admin_routes
    from app.participant import routes as participant_routes
    from app.participant import export_csv

    app = FastAPI()
    for router in (researcher_routes.router, admin_routes.router, participant_routes.router):
        app.include_router(router, prefix="/api")
    data = csv_fixture()
    study, sessions = data[:2]
    sessions[0].experiment_code = study.code
    actor = SimpleNamespace(id="owner", role="administrator")
    monkeypatch.setattr(researcher_routes, "owned_experiment", lambda *args: study)
    monkeypatch.setattr(admin_routes, "get_experiment_or_404", lambda *args: study)
    monkeypatch.setattr(participant_routes.repo, "get_session", lambda *args: sessions[0])
    monkeypatch.setattr(participant_routes.repo, "find_experiment_by_code", lambda *args: study)
    monkeypatch.setattr(participant_routes, "check_session_owner", lambda *args: None)

    def export(db, experiment, view="answers", session_id=None):
        return build_csv(*data, view=view, session_id=session_id)

    monkeypatch.setattr(researcher_routes, "export_experiment_csv", export)
    monkeypatch.setattr(admin_routes, "export_experiment_csv", export)
    monkeypatch.setattr(export_csv, "export_experiment_csv", export)
    previous = app.dependency_overrides.copy()
    app.dependency_overrides.update({
        get_db: lambda: None, get_current_researcher: lambda: actor,
        get_current_administrator: lambda: actor,
    })
    try:
        with TestClient(app) as client:
            for path, filename, session_id in (
                ("/api/experiments/study/results.csv", "experiment", None),
                ("/api/admin/experiments/study/results.csv", "experiment", None),
                ("/api/participant/sessions/s1/csv", "s1", "s1"),
            ):
                default = client.get(path)
                assert default.content == client.get(path + "?view=answers").content
                for view in ("answers", "activity"):
                    response = client.get(path + "?view=" + view)
                    assert response.status_code == 200
                    assert response.content == build_csv(*data, view=view, session_id=session_id).encode("utf-8")
                    assert filename + "_" + view + ".csv" in response.headers["content-disposition"]
                assert client.get(path + "?view=invalid").status_code == 422
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def test_administrator_authorization(client, auth_headers, admin_headers):
    for path in ("researchers", "experiments", "participants"):
        assert client.get("/api/admin/" + path, headers=auth_headers).status_code == 403
        assert (
            client.get("/api/admin/" + path, headers=admin_headers).status_code == 200
        )


def test_experiment_csv_summary_and_delete_guard(client, auth_headers, admin_headers):
    import csv, io
    from app.participant.export_csv import ANSWER_COLUMNS

    experiment = client.post(
        "/api/experiments",
        json={"name": "=unsafe title", "stages": []},
        headers=auth_headers,
    ).json()
    response = client.post(
        "/api/participant/sessions",
        json={
            "experimentCode": experiment["code"],
            "participantCode": "P001",
            "finishedAt": "2026-10-14T00:00:00Z",
            "answers": [{"componentId": "answer-1", "value": "hello"}],
            "events": [],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    summary = client.get(
        "/api/experiments/" + experiment["id"] + "/results/summary",
        headers=auth_headers,
    )
    assert summary.json() == {"completed_count": 1, "incomplete_count": 0}
    result = client.get(
        "/api/experiments/" + experiment["id"] + "/results.csv", headers=auth_headers
    )
    assert result.status_code == 200
    assert result.content.startswith(b"\xef\xbb\xbf")
    assert b"\r\n" in result.content
    reader = csv.DictReader(io.StringIO(result.content.decode("utf-8-sig")))
    assert reader.fieldnames == ANSWER_COLUMNS + ["Unmatched question – answer-1"]
    rows = list(reader)
    assert len(rows) == 1 and rows[0]["Unmatched question – answer-1"] == "hello"
    assert all(r["Study"].startswith("'") for r in rows)
    assert (
        client.delete(
            "/api/experiments/" + experiment["id"], headers=auth_headers
        ).status_code
        == 409
    )
    assert (
        client.get(
            "/api/admin/experiments/" + experiment["id"] + "/results.csv",
            headers=admin_headers,
        ).status_code
        == 200
    )


def test_settings_get_and_patch(client, admin_headers):
    auth_headers = admin_headers
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


def test_settings_write_requires_administrator(client, auth_headers):
    assert (
        client.patch(
            "/api/admin/settings", json={"dataRetentionDays": 100}, headers=auth_headers
        ).status_code
        == 403
    )
    assert (
        client.get("/api/workspace/settings", headers=auth_headers).status_code == 200
    )
    members = client.get("/api/workspace/members", headers=auth_headers)
    assert members.status_code == 200
    assert len(members.json()) == 1


def test_session_csv_download_is_shared_by_owner_and_administrator(
    client, auth_headers, admin_headers
):
    import csv
    import io

    experiment = client.post(
        "/api/experiments",
        headers=auth_headers,
        json={"name": "CSV study", "stages": []},
    ).json()
    detail = {"text": 'first line, "quoted"\nsecond line'}
    session = client.post(
        "/api/participant/sessions",
        headers=auth_headers,
        json={
            "experimentCode": experiment["code"],
            "participantCode": "P001",
            "answers": [],
            "events": [
                {
                    "seq": 1,
                    "type": "paste",
                    "timestamp": "2026-10-27T00:00:00Z",
                    "epochMs": 1793059200000,
                    "perfMs": 2,
                    "detail": detail,
                }
            ],
        },
    )
    assert session.status_code == 201
    path = "/api/participant/sessions/" + session.json()["id"] + "/csv"
    owner = client.get(path + "?view=activity", headers=auth_headers)
    admin = client.get(path + "?view=activity", headers=admin_headers)
    assert owner.status_code == admin.status_code == 200
    assert owner.content == admin.content
    rows = list(csv.DictReader(io.StringIO(owner.content.decode("utf-8-sig"))))
    assert rows[0]["Activity"] == "Text pasted"
    assert rows[0]["Content"] == detail["text"]
    assert client.get(path).status_code == 401

    for endpoint, headers, filename in (
        (path, auth_headers, session.json()["id"]),
        ("/api/experiments/" + experiment["id"] + "/results.csv", auth_headers, "experiment"),
        ("/api/admin/experiments/" + experiment["id"] + "/results.csv", admin_headers, "experiment"),
    ):
        default = client.get(endpoint, headers=headers)
        assert default.content == client.get(endpoint + "?view=answers", headers=headers).content
        for view in ("answers", "activity"):
            response = client.get(endpoint + "?view=" + view, headers=headers)
            assert response.status_code == 200
            assert response.content.startswith(b"\xef\xbb\xbf")
            assert filename + "_" + view + ".csv" in response.headers["content-disposition"]
        assert client.get(endpoint + "?view=invalid", headers=headers).status_code == 422

    from tests.conftest import register_and_login
    other = {"Authorization": "Bearer " + register_and_login(client, email="csv-other@example.com")}
    for view in ("answers", "activity"):
        assert client.get(path + "?view=" + view, headers=other).status_code == 404
        assert client.get("/api/experiments/" + experiment["id"] + "/results.csv?view=" + view,
                          headers=other).status_code == 404
        assert client.get("/api/admin/experiments/" + experiment["id"] + "/results.csv?view=" + view,
                          headers=auth_headers).status_code == 403



def test_workbook_versions_unknown_history_and_long_cells():
    from openpyxl import load_workbook
    from app.participant.export_csv import build_workbook
    study, sessions, answers, events, consents, recordings = csv_fixture()
    study.created, study.status = "01 Nov 2026", "Live"
    config = {"name": study.name, "code": study.code, "stages": study.stages}
    history = [SimpleNamespace(type="server.published", timestamp="2026-01-01T00:00:00Z",
                              detail={"version": v, "snapshot": config}) for v in (1, 2)]
    def internal(kind, detail):
        return SimpleNamespace(session_id="s1", type=kind, detail=detail)
    events += [internal("server.version", {"version": 1}), internal("server.ai", {"conversation_id": "chat"})]
    prompt = "中文 long " * 9000
    events[3].detail["text"] = "流水内容" * 40000
    turns = [SimpleNamespace(conversation_id="chat", sequence=1, created_at="2026-04-04T16:00:00Z",
                             provider="test", model="model", request_id="request", prompt=prompt, reply="=SUM(A1)")]
    content = build_workbook(study, sessions, answers, events, consents, recordings, history,
                             turns, [SimpleNamespace(id="chat", stage_id="stage")])
    assert content.startswith(b"PK")
    book = load_workbook(io.BytesIO(content))
    assert book.sheetnames == ["Study information", "V1", "V2", "Unknown legacy version"]
    assert book["V2"].max_row == 1
    sheet = book["V1"]
    assert sheet.freeze_panes == "A2" and sheet.auto_filter.ref
    headers = [c.value for c in sheet[1]]
    row = [c.value or "" for c in sheet[2]]
    assert row[0] == "P001" and row[2] == "V1"
    assert row[4] == "2026-04-05 02:59:59+11:00"
    assert row[5] == "2026-04-05 02:00:00+10:00"
    assert row[headers.index("Successful AI turns")] == "1"
    ai_text = "".join(str(row[i]) for i, h in enumerate(headers) if h.startswith("AI history"))
    assert prompt in ai_text and "=SUM(A1)" in ai_text
    assert any(h.startswith("AI history 2 /") for h in headers)
    unknown = book["Unknown legacy version"]
    assert "How do you feel" not in str([c.value for c in unknown[1]])
    assert unknown.cell(2, 3).value == "Unknown legacy version"
    assert unknown.cell(2, 6).value is None
    text = "\n".join(str(cell.value or "") for ws in book for row in ws for cell in row)
    assert "base64" not in text and "/private" not in text
    assert "Unix time (ms)" in text and "Performance time (ms)" in text
    assert all(c.data_type != "f" for ws in book for row in ws for c in row)
    assert all(len(str(c.value or "")) <= 30000 for ws in book for row in ws for c in row)


def test_workbook_capacity_and_invalid_characters(monkeypatch):
    import pytest
    from fastapi import HTTPException
    from openpyxl import Workbook
    from app.participant import export_csv
    monkeypatch.setattr(export_csv, "MAX_COLUMNS", 1)
    with pytest.raises(HTTPException, match="capacity"):
        export_csv.workbook_table(Workbook(), "test", ["a", "b"], [])
    monkeypatch.setattr(export_csv, "MAX_COLUMNS", 16384)
    with pytest.raises(HTTPException, match="characters"):
        export_csv.workbook_table(Workbook(), "test", ["a"], [["bad\x01text"]])
    monkeypatch.setattr(export_csv, "MAX_ROWS", 1)
    with pytest.raises(HTTPException, match="capacity"):
        export_csv.workbook_table(Workbook(), "test", ["a"], [["row"]])


def published_stages(question="Original question"):
    return [{"id": "consent", "name": "Consent", "type": "consent", "components": [
        {"id": "consent-text", "type": "text", "label": "Please consent"}]},
        {"id": "task", "name": "Task", "type": "short_answer", "features": {"ai": True}, "components": [
        {"id": "question", "type": "textbox", "label": question}]}]


def test_versioned_export_and_session_snapshot(client, auth_headers, monkeypatch):
    from uuid import uuid4
    from copy import deepcopy
    from openpyxl import load_workbook
    from app.core import database
    from app.participant.models import ParticipantSession, ParticipantEvent
    from app.researcher import repository as versions
    from app.researcher.models import Experiment
    from app.participant import ai_proxy
    from app.core.config import settings

    response = client.post("/api/experiments", headers=auth_headers, json={"name": "Versioned", "stages": published_stages()})
    assert response.status_code == 201, response.text
    experiment = response.json()
    path = f"/api/experiments/{experiment['id']}"
    publish = {"publish": True, "publishRequestId": str(uuid4())}
    assert client.patch(path, headers=auth_headers, json=publish).status_code == 200
    assert client.patch(path, headers=auth_headers, json=publish).status_code == 200
    code = experiment["code"]
    with database.SessionLocal() as db:
        assert len(versions.published_versions(db, db.get(Experiment, experiment["id"]))) == 1
        db.add(ParticipantSession(id=str(uuid4()), experiment_code=code, participant_code="OLD", started_at="2026-01-01T00:00:00Z"))
        db.commit()
    access = client.post("/api/participant/access", json={"experimentCode": code, "participantCode": "P001"}).json()
    actor = {"X-Participant-Token": access["token"]}
    sid = str(uuid4())
    start_body = {"sessionId": sid, "experimentCode": code, "participantCode": "P001"}
    start = client.post("/api/participant/sessions/start", headers=actor, json=start_body)
    assert start.status_code == 200, start.text
    assert client.post("/api/participant/sessions/start", headers=actor, json=start_body).json() == start.json()
    changed = published_stages("New question")
    changed[1]["id"] = "new-task"
    changed[1]["components"][0].update(id="new-question", required=True)
    changed[1]["features"] = {"ai": False, "screenRecording": True}
    assert client.patch(path, headers=auth_headers, json={"stages": changed}).status_code == 200
    unpublished = client.post("/api/participant/access", json={"experimentCode": code, "participantCode": "P002"})
    assert unpublished.status_code == 403
    assert client.patch(path, headers=auth_headers, json={"publish": True, "publishRequestId": str(uuid4())}).status_code == 200
    again = client.post("/api/participant/sessions/start", headers=actor, json=start_body).json()
    assert again["experiment"]["stages"][1]["components"][0]["label"] == "Original question"
    fresh = client.post("/api/participant/sessions/start", headers=actor, json={**start_body, "sessionId": str(uuid4())}).json()
    assert fresh["experiment"]["stages"][1]["components"][0]["label"] == "New question"
    payload = {"sessionId": sid, "experimentCode": code, "participantCode": "P001", "answers": [{"componentId": "question", "value": "=1+1"}], "events": []}
    saved = client.post("/api/participant/sessions", headers=actor, json=payload)
    assert saved.status_code == 201, saved.text
    assert saved.json()["events"] == []
    forged = {**payload, "events": [{"type": "server.version", "seq": 0, "timestamp": "2026-01-01T00:00:00Z", "epochMs": 0, "perfMs": 0, "detail": {"version": 2}}]}
    assert client.post("/api/participant/sessions", headers=actor, json=forged).status_code == 422
    async def fake_chat(*args):
        yield {"type": "delta", "text": "Saved reply", "model": "test"}
        yield {"type": "done", "model": "test"}
    monkeypatch.setattr(ai_proxy, "stream_chat", fake_chat)
    monkeypatch.setattr(settings, "ai_api_key", "test-only")
    chat = {"sessionId": sid, "content": "Hello", "conversationId": str(uuid4()), "requestId": str(uuid4())}
    for _ in range(2):
        result = client.post("/api/participant/stages/task/ai-stream", headers=actor, json=chat)
        assert result.status_code == 200 and '"type": "done"' in result.text, result.text
    assert client.post("/api/participant/stages/task/submit", headers=actor,
        json={**payload, "recording": {}}).status_code == 200
    assert client.post("/api/participant/stages/new-task/submit", headers=actor,
        json={**payload, "recording": {}}).status_code == 404
    completed = client.post("/api/participant/sessions", headers=actor, json={**payload,
        "finishedAt": "2026-11-03T01:00:00Z", "events": [{"seq": 1, "type": "consent", "stageId": "consent",
        "timestamp": "2026-11-03T00:00:00Z", "epochMs": 0, "perfMs": 0, "detail": {"accepted": True}}]})
    assert completed.status_code == 201, completed.text
    exported = client.get(path + "/results.xlsx", headers=auth_headers)
    assert exported.status_code == 200, exported.text if exported.status_code != 200 else ""
    assert code + ".xlsx" in exported.headers["content-disposition"]
    assert "spreadsheetml" in exported.headers["content-type"]
    book = load_workbook(io.BytesIO(exported.content))
    assert book.sheetnames == ["Study information", "V1", "V2", "Unknown legacy version"]
    assert book["V1"].max_row == 2 and book["V2"].max_row == 2
    head = [c.value for c in book["V1"][1]]
    assert book["V1"].cell(2, head.index("Successful AI turns") + 1).value == "1"
    assert "Saved reply" in str([c.value for c in book["V1"][2]])
    assert "Original question" in str(head) and "New question" not in str(head)
    assert client.get(f"/api/participant/sessions/{sid}/xlsx", headers=auth_headers).status_code == 200
    assert client.get(path + "/results.xlsx").status_code in (401, 403)
    from tests.conftest import register_and_login
    outsider = {"Authorization": "Bearer " + register_and_login(client, email="xlsx-outsider@example.com")}
    assert client.get(path + "/results.xlsx", headers=outsider).status_code == 404
    assert client.get(f"/api/participant/sessions/{sid}/xlsx", headers=outsider).status_code == 404
    assert client.get(f"/api/admin/experiments/{experiment['id']}/results.xlsx", headers=auth_headers).status_code == 403
    from app.researcher.models import Researcher
    with database.SessionLocal() as db:
        db.query(Researcher).filter_by(email="xlsx-outsider@example.com").one().role = "administrator"
        db.commit()
    admin_file = client.get(f"/api/admin/experiments/{experiment['id']}/results.xlsx", headers=outsider)
    assert admin_file.status_code == 200 and code + ".xlsx" in admin_file.headers["content-disposition"]
    assert load_workbook(io.BytesIO(admin_file.content)).sheetnames == book.sheetnames
    other = client.post("/api/participant/access", json={"experimentCode": code, "participantCode": "OTHER"}).json()
    assert client.post("/api/participant/stages/task/ai-stream", headers={"X-Participant-Token": other["token"]}, json=chat).status_code == 403
    with database.SessionLocal() as db:
        bindings = db.query(ParticipantEvent).filter_by(session_id=sid, type="server.version").all()
        assert len(bindings) == 1 and bindings[0].detail["version"] == 1
        assert len(versions.published_versions(db, db.get(Experiment, experiment["id"]))) == 2



def test_publication_concurrency_and_idempotency(client, auth_headers):
    from concurrent.futures import ThreadPoolExecutor
    from uuid import uuid4
    from app.core import database
    from app.researcher import repository as versions
    from app.researcher.models import Experiment
    experiment = client.post("/api/experiments", headers=auth_headers,
                             json={"name": "Concurrent", "stages": published_stages()}).json()
    path = f"/api/experiments/{experiment['id']}"
    def publish(body):
        response = client.patch(path, headers=auth_headers, json=body)
        assert response.status_code == 200, response.text
        return response.json()
    bodies = [{"publish": True, "publishRequestId": str(uuid4()), "stages": published_stages(name)} for name in ("A", "B")]
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(publish, bodies))
    same = {"publish": True, "publishRequestId": str(uuid4())}
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(publish, [same, same]))
    with database.SessionLocal() as db:
        exp = db.get(Experiment, experiment["id"])
        history = versions.published_versions(db, exp)
        assert [e.detail["version"] for e in history] == [1, 2]
        assert {e.detail["snapshot"]["stages"][1]["components"][0]["label"] for e in history[:2]} == {"A", "B"}
        assert history[-1].detail["snapshot"]["stages"] == exp.stages
    assert client.patch(path, headers=auth_headers, json={**same, "name": "Conflicting reuse"}).status_code == 409


def test_only_changed_publications_create_version_sheets(client, auth_headers):
    from uuid import uuid4
    from openpyxl import load_workbook
    from app.core import database
    from app.researcher import repository as versions
    from app.researcher.models import Experiment
    response = client.post('/api/experiments', headers=auth_headers,
                           json={"name": "Publication versions", "stages": published_stages()})
    assert response.status_code == 201
    experiment = response.json()
    path = f"/api/experiments/{experiment['id']}"
    def patch(body):
        response = client.patch(path, headers=auth_headers, json=body)
        assert response.status_code == 200, response.text
        return response.json()
    def publish():
        return patch({"publish": True, "publishRequestId": str(uuid4())})
    def sheets():
        response = client.get(path + '/results.xlsx', headers=auth_headers)
        assert response.status_code == 200
        return load_workbook(io.BytesIO(response.content)).sheetnames
    for text in ['Draft A', 'Draft B', 'Published question']:
        patch({"stages": published_stages(text)})
    assert sheets() == ['Study information']
    publish()
    assert sheets() == ['Study information', 'V1']
    publish()
    assert sheets() == ['Study information', 'V1']
    patch({"status": "Draft"})
    publish()
    assert sheets() == ['Study information', 'V1']
    patch({"stages": published_stages('Temporary draft')})
    patch({"stages": published_stages('Published question')})
    publish()
    assert sheets() == ['Study information', 'V1']
    patch({"stages": published_stages('New published question')})
    patch({"stages": published_stages('Final published question')})
    assert sheets() == ['Study information', 'V1']
    publish()
    assert sheets() == ['Study information', 'V1', 'V2']
    patch({"stages": published_stages('Published question')})
    publish()
    assert sheets() == ['Study information', 'V1', 'V2', 'V3']
    with database.SessionLocal() as db:
        exp = db.get(Experiment, experiment['id'])
        history = versions.published_versions(db, exp)
        assert [e.detail['version'] for e in history] == [1, 2, 3]


def test_existing_live_baseline_preserves_unknown_sessions(client, auth_headers):
    from uuid import uuid4
    from app.core import database
    from app.participant.models import ParticipantSession, ParticipantEvent
    from app.researcher.models import Experiment, Researcher
    from app.researcher import repository as versions
    with database.SessionLocal() as db:
        owner = db.query(Researcher).one()
        experiment = Experiment(id=str(uuid4()), owner_id=owner.id, name="Legacy", code="LEGACY",
                                status="Live", created="01 Nov 2026", stages=published_stages())
        db.add(experiment)
        sid = str(uuid4())
        db.add(ParticipantSession(id=sid, experiment_code="LEGACY", participant_code="OLD", started_at="2026-01-01T00:00:00Z"))
        db.commit()
        eid = experiment.id
    access = client.post("/api/participant/access", json={"experimentCode": "LEGACY", "participantCode": "OLD"}).json()
    actor = {"X-Participant-Token": access["token"]}
    response = client.post("/api/participant/sessions/start", headers=actor,
                           json={"sessionId": sid, "experimentCode": "LEGACY", "participantCode": "OLD"})
    assert response.status_code == 200
    with database.SessionLocal() as db:
        versions_list = versions.published_versions(db, db.get(Experiment, eid))
        assert len(versions_list) == 1 and versions_list[0].detail["baseline"] is True
        assert db.query(ParticipantEvent).filter_by(session_id=sid, type="server.version").one().detail["version"] is None
    from openpyxl import load_workbook
    book = load_workbook(io.BytesIO(client.get(f"/api/experiments/{eid}/results.xlsx", headers=auth_headers).content))
    assert book.sheetnames == ["Study information", "V1", "Unknown legacy version"]
    assert book["V1"].max_row == 1
    assert "precise time unknown" in str([c.value for c in book["Study information"][5]])


def test_excel_emoji_chunks_preserve_all_text():
    from openpyxl import Workbook, load_workbook
    from app.participant.export_csv import workbook_table
    content = "😀" * 20001 + "结束"
    book = Workbook()
    book.remove(book.active)
    workbook_table(book, "Unicode", ["Text"], [[content]])
    output = io.BytesIO()
    book.save(output)
    loaded = load_workbook(io.BytesIO(output.getvalue()))
    assert "".join(c.value for c in loaded.active[2]) == content
    assert all(len(c.value.encode("utf-16-le")) <= 60000 for c in loaded.active[2])
