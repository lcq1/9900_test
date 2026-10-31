"""Unit test for the CSV export helper (also covers the export contract)."""

from __future__ import annotations

from app.participant.export_csv import export_session_csv
from app.participant.models import ParticipantEvent


def test_export_session_csv_produces_expected_rows():
    events = [
        ParticipantEvent(
            seq=0,
            type="stage_view",
            timestamp="t0",
            epoch_ms=0,
            perf_ms=1,
            stage_id="s1",
            detail={"a": 1},
        ),
        ParticipantEvent(
            seq=1,
            type="answer",
            timestamp="t1",
            epoch_ms=10,
            perf_ms=2,
            stage_id=None,
            detail=None,
        ),
    ]
    csv_text = export_session_csv(events)
    lines = csv_text.strip().splitlines()
    assert lines[0] == "seq,type,timestamp,epochMs,perfMs,stageId,detail"
    assert len(lines) == 3  # header + 2 data rows
    assert "stage_view" in lines[1]
    assert lines[1].split(",")[5] == "s1"  # stageId column
    assert lines[2].split(",")[5] == ""  # empty stageId


def test_administrator_authorization(client, auth_headers, admin_headers):
    for path in ("researchers", "experiments", "participants"):
        assert client.get("/api/admin/" + path, headers=auth_headers).status_code == 403
        assert (
            client.get("/api/admin/" + path, headers=admin_headers).status_code == 200
        )


def test_experiment_csv_summary_and_delete_guard(client, auth_headers, admin_headers):
    import csv, io
    from app.participant.export_csv import EXPORT_COLUMNS

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
    assert reader.fieldnames == EXPORT_COLUMNS
    rows = list(reader)
    assert {r["record_type"] for r in rows} == {"run", "answer"}
    assert all(r["experiment_name"].startswith("'") for r in rows)
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
    owner = client.get(path, headers=auth_headers)
    admin = client.get(path, headers=admin_headers)
    assert owner.status_code == admin.status_code == 200
    assert owner.content == admin.content
    rows = list(csv.DictReader(io.StringIO(owner.text)))
    assert rows[0]["type"] == "paste"
    assert __import__("json").loads(rows[0]["detail"]) == detail
    assert client.get(path).status_code == 401
