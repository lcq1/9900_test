"""Destructive session operations use isolated PostgreSQL schemas and temp files."""
from pathlib import Path
from uuid import uuid4
from app.core import database, storage
from app.core.config import settings
from app.participant.models import ParticipantSession, ParticipantEvent, Answer, Consent, Recording, AIConversation, AIChatTurn
from app.researcher.models import Researcher
from tests.conftest import register_and_login


def seed(client, headers, monkeypatch, tmp_path, files=1):
    monkeypatch.setattr(storage, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "local_storage_dir", "")
    study = client.post('/api/experiments', headers=headers, json={"name": "Delete only one run", "stages": []}).json()
    sid, keep, conversation = str(uuid4()), str(uuid4()), str(uuid4())
    with database.SessionLocal() as db:
        owner = db.query(Researcher).filter_by(email="researcher@example.com").one()
        owner_id = owner.id
        for id in (sid, keep):
            db.add(ParticipantSession(id=id, experiment_code=study['code'], participant_code='P01', started_at='2026-11-06T00:00:00Z'))
            db.add(Answer(session_id=id, component_id='answer', value='private answer'))
        db.add(Consent(session_id=sid, signed_at='2026-11-06T00:00:00Z', name='Test', payload={}))
        db.add(AIConversation(id=conversation, researcher_id=owner_id, experiment_id=study['id'], stage_id='task', created_at='2026-11-06T00:00:00Z'))
        db.flush()
        db.add(AIChatTurn(conversation_id=conversation, request_id=str(uuid4()), sequence=1, prompt='test', reply='test', model='test', provider='test', created_at='2026-11-06T00:00:00Z'))
        db.add(ParticipantEvent(session_id=sid, type='server.ai', detail={"conversation_id": conversation}))
        paths = []
        for index in range(files):
            reference = f'recordings/{sid}/file-{index}.mp4'
            path = Path(storage._safe_local_path(reference)); path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b'test video')
            paths.append(path)
            db.add(Recording(session_id=sid, filename=path.name, path=reference, created_at='2026-11-06T00:00:00Z'))
        db.commit()
    return study, sid, keep, conversation, paths


def administrator(client):
    token = register_and_login(client, email='delete-admin@example.com')
    with database.SessionLocal() as db:
        db.query(Researcher).filter_by(email='delete-admin@example.com').one().role = 'administrator'
        db.commit()
    return {'Authorization': 'Bearer ' + token}


def test_administrator_deletes_one_record_and_all_its_related_data(client, auth_headers, monkeypatch, tmp_path):
    study, sid, keep, conversation, paths = seed(client, auth_headers, monkeypatch, tmp_path)
    url = '/api/participant/sessions/' + sid
    assert client.delete(url).status_code == 401
    assert client.delete(url, headers=auth_headers).status_code == 403
    with database.SessionLocal() as db:
        recording_id = db.query(Recording).filter_by(session_id=sid).one().id
    assert client.delete(url + '/recordings/' + recording_id, headers=auth_headers).status_code == 403
    admin = administrator(client)
    assert client.delete(url, headers=admin).json() == {'deleted': True}
    assert not paths[0].exists()
    assert client.get(url, headers=admin).status_code == 404
    assert client.post('/api/participant/sessions', headers=auth_headers, json={
        'sessionId': sid, 'experimentCode': study['code'], 'participantCode': 'P01', 'finishedAt': None, 'answers': [], 'events': []}).status_code == 404
    assert client.delete(url, headers=admin).status_code == 404
    assert client.get('/api/participant/sessions/' + keep, headers=auth_headers).status_code == 200
    assert client.get('/api/experiments/' + study['id'], headers=auth_headers).status_code == 200
    with database.SessionLocal() as db:
        for model in (ParticipantSession,): assert db.get(model, sid) is None
        for model in (Answer, Consent, Recording): assert db.query(model).filter_by(session_id=sid).count() == 0
        assert db.get(AIConversation, conversation) is None
        assert db.query(AIChatTurn).filter_by(conversation_id=conversation).count() == 0
        assert db.query(ParticipantEvent).filter_by(type='server.session_deleted').count() == 1
        assert db.query(Answer).filter_by(session_id=keep).count() == 1


def test_only_admin_can_delegate_and_revoke_and_owner_scope_is_always_enforced(client, auth_headers, monkeypatch, tmp_path):
    _, sid, keep, _, _ = seed(client, auth_headers, monkeypatch, tmp_path)
    other = {'Authorization': 'Bearer ' + register_and_login(client, email='delete-other@example.com')}
    admin = administrator(client)
    policy = {'allowResearcherSessionDeletion': True}
    assert client.get('/api/workspace/settings', headers=auth_headers).json()['allowResearcherSessionDeletion'] is False
    assert client.patch('/api/admin/settings', headers=auth_headers, json=policy).status_code == 403
    assert client.patch('/api/admin/settings', headers=admin, json=policy).status_code == 200
    url = '/api/participant/sessions/' + sid
    assert client.delete(url, headers=other).status_code == 404
    assert client.delete(url, headers=auth_headers).status_code == 200
    assert client.patch('/api/admin/settings', headers=admin, json={'allowResearcherSessionDeletion': False}).status_code == 200
    assert client.delete('/api/participant/sessions/' + keep, headers=auth_headers).status_code == 403
    assert client.delete('/api/participant/sessions/' + keep, headers=admin).status_code == 200


def test_failed_file_staging_restores_previously_staged_files_and_keeps_database(client, auth_headers, monkeypatch, tmp_path):
    _, sid, _, _, paths = seed(client, auth_headers, monkeypatch, tmp_path, files=2)
    admin = administrator(client)
    replace = Path.replace
    attempts = []
    def fail_second(source, target):
        if '.deleting-' in str(target):
            attempts.append(source)
            if len(attempts) == 2: raise OSError('Storage unavailable')
        return replace(source, target)
    monkeypatch.setattr(Path, 'replace', fail_second)
    response = client.delete('/api/participant/sessions/' + sid, headers=admin)
    assert response.status_code == 503
    assert all(path.read_bytes() == b'test video' for path in paths)
    assert client.get('/api/participant/sessions/' + sid, headers=admin).status_code == 200
    with database.SessionLocal() as db:
        assert db.query(Recording).filter_by(session_id=sid).count() == 2
        assert db.query(ParticipantEvent).filter_by(type='server.session_deleted').count() == 0
