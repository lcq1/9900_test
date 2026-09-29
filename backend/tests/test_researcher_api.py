"""Core Researcher API and ownership tests."""

from fastapi.testclient import TestClient


def register_and_login(client: TestClient, email: str = "owner@example.com") -> None:
    registration = client.post(
        "/api/auth/researcher/register",
        json={"email": email, "password": "StrongPass123!"},
    )
    assert registration.status_code == 201
    login = client.post(
        "/api/auth/researcher/login",
        json={"email": email, "password": "StrongPass123!"},
    )
    assert login.status_code == 200


def experiment_body(*, status: str | None = None) -> dict:
    body = {
        "name": "Attention Study",
        "fullscreenMode": True,
        "stages": [
            {"type": "consent", "title": "Consent", "content": {"text": "I agree."}, "position": 0, "timeLimit": None},
            {"type": "questionnaire", "title": "Questionnaire", "content": {"text": "Your answer?"}, "position": 1, "timeLimit": 600},
            {"type": "task", "title": "Task", "content": {"text": "Complete the task."}, "position": 2, "timeLimit": 600},
        ],
    }
    if status:
        body["status"] = status
    return body


def test_health_and_researcher_experiment_crud(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    register_and_login(client)
    assert client.get("/api/auth/me").json()["data"]["role"] == "researcher"

    created = client.post("/api/experiments", json=experiment_body())
    assert created.status_code == 201
    experiment = created.json()["data"]
    assert experiment["code"].startswith("EXP-")
    assert len(experiment["stages"]) == 3

    listed = client.get("/api/experiments")
    assert [item["id"] for item in listed.json()["data"]] == [experiment["id"]]

    updated_body = experiment_body(status="published")
    updated_body["name"] = "Published Study"
    experiment_id = experiment["id"]
    updated = client.put(f"/api/experiments/{experiment_id}", json=updated_body)
    assert updated.status_code == 200
    assert updated.json()["data"]["status"] == "published"


def test_researcher_cannot_access_another_owners_experiment(client: TestClient) -> None:
    register_and_login(client, "first@example.com")
    experiment_id = client.post("/api/experiments", json=experiment_body()).json()["data"]["id"]
    assert client.post("/api/auth/logout").status_code == 204

    register_and_login(client, "second@example.com")
    assert client.get(f"/api/experiments/{experiment_id}").status_code == 404
    assert client.delete(f"/api/experiments/{experiment_id}").status_code == 404
