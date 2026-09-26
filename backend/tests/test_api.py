"""Initial API smoke tests; expand with auth, ownership and invalid-input cases."""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check() -> None:
    """The process exposes a stable liveness response."""

    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# TODO: prioritise tests for cross-researcher access, role confusion, repeated
# participant submissions, disabled accounts and uniform login failures.
