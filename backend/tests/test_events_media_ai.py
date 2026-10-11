"""AI chat, CSV export and event-timeline round-trip tests."""
from __future__ import annotations


def test_ai_chat_returns_reply_referencing_message(client):
    r = client.post("/api/ai/chat", json={"message": "How do I design a study?"})
    assert r.status_code == 200
    body = r.json()
    assert "reply" in body
    assert "design a study" in body["reply"]  # mock references the message


def test_csv_export_endpoint_matches_columns(client, auth_headers):
    client.post(
        "/api/experiments",
        json={"name": "E", "code": "CSV1", "stages": []},
        headers=auth_headers,
    )
    payload = {
        "experimentCode": "CSV1",
        "participantCode": "abc",
        "answers": [],
        "events": [
            {
                "seq": 0,
                "type": "timer_tick",
                "timestamp": "t0",
                "epochMs": 1,
                "perfMs": 1,
            }
        ],
    }
    r = client.post("/api/participant/sessions", json=payload, headers=auth_headers)
    session_id = r.json()["id"]

    r = client.get(f"/api/participant/sessions/{session_id}/csv", headers=auth_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    lines = r.text.strip().splitlines()
    assert lines[0] == "seq,type,timestamp,epochMs,perfMs,stageId,detail"
    assert len(lines) == 2  # header + 1 event
    assert "timer_tick" in lines[1]


def test_event_timeline_roundtrip_preserves_order(client, auth_headers):
    client.post(
        "/api/experiments",
        json={"name": "E", "code": "TL1", "stages": []},
        headers=auth_headers,
    )
    events = [
        {
            "seq": i,
            "type": f"type_{i}",
            "timestamp": f"ts_{i}",
            "epochMs": i * 100,
            "perfMs": i,
            "stageId": f"s{i}" if i % 2 == 0 else None,
            "detail": {"i": i},
        }
        for i in range(5)
    ]
    payload = {
        "experimentCode": "TL1",
        "participantCode": "abc",
        "answers": [],
        "events": events,
    }
    r = client.post("/api/participant/sessions", json=payload, headers=auth_headers)
    session_id = r.json()["id"]
    r = client.get(f"/api/participant/sessions/{session_id}", headers=auth_headers)
    got = r.json()["events"]
    assert [e["seq"] for e in got] == [0, 1, 2, 3, 4]
    assert got[0]["detail"] == {"i": 0}
    assert got[1]["stageId"] is None