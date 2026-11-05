from uuid import uuid4
from tests.conftest import register_and_login


def study(client, headers):
    result = client.post('/api/experiments', headers=headers, json={
        'name': 'Reusable study', 'stages': [
            {'id': 'consent', 'name': 'Consent', 'type': 'consent', 'components': [
                {'id': 'information', 'type': 'text', 'label': 'Please consent'}]},
            {'id': 'task', 'name': 'Task', 'type': 'short_answer', 'components': [
                {'id': 'question', 'type': 'textbox', 'label': 'Your answer'}],
             'materials': [{'id': 'private-file', 'name': 'brief.pdf', 'reference': 'legacy:private/path'}],
             'apiKey': 'must-not-export'}],
    })
    assert result.status_code == 201, result.text
    return result.json()


def test_design_duplicate_and_portable_import_exclude_private_data(client, auth_headers):
    source = study(client, auth_headers)
    path = '/api/experiments/' + source['id']
    document = client.get(path + '/template', headers=auth_headers)
    assert document.status_code == 200
    data = document.json()
    assert data['format'] == 'beyond-study-template' and data['version'] == 1
    assert all(secret not in document.text for secret in ('private/path', 'must-not-export', 'private-file'))
    assert 'ownerId' not in data and 'code' not in data
    for response in (client.post(path + '/duplicate', headers=auth_headers),
                     client.post('/api/experiments/import-template', headers=auth_headers, json=data)):
        assert response.status_code == 201, response.text
        clone = response.json()
        assert clone['status'] == 'Draft'
        assert clone['id'] != source['id'] and clone['code'] != source['code']
        assert clone['stages'][0]['id'] != 'consent'
        assert clone['stages'][1]['components'][0]['id'] != 'question'
        assert clone['stages'][1]['components'][0]['label'] == 'Your answer'
        assert not clone['stages'][1].get('materials')
        assert client.get('/api/experiments/' + clone['id'] + '/results/summary', headers=auth_headers).json()['completed_count'] == 0
    outsider = {'Authorization': 'Bearer ' + register_and_login(client, email='template-other@example.com')}
    assert client.get(path + '/template', headers=outsider).status_code == 404
    assert client.post(path + '/duplicate', headers=outsider).status_code == 404
    imported = client.post('/api/experiments/import-template', headers=outsider, json=data)
    assert imported.status_code == 201
    assert client.get('/api/experiments/' + imported.json()['id'], headers=auth_headers).status_code == 404
    oversized = {**data, 'name': 'x' * (2 * 1024 * 1024)}
    assert client.post('/api/experiments/import-template', headers=auth_headers, json=oversized).status_code == 413
    for bad in ({**data, 'version': 99}, {**data, 'apiKey': 'forbidden'}, {**data, 'stages': data['stages'] * 11}):
        assert client.post('/api/experiments/import-template', headers=auth_headers, json=bad).status_code == 422


def test_closing_recruitment_preserves_started_sessions(client, auth_headers):
    source = study(client, auth_headers)
    path = '/api/experiments/' + source['id']
    assert client.patch(path, headers=auth_headers, json={'publish': True}).status_code == 200
    access = client.post('/api/participant/access', json={'experimentCode': source['code'], 'participantCode': 'P001'})
    assert access.status_code == 200, access.text
    actor = {'X-Participant-Token': access.json()['token'], 'X-Participant-Client': 'existing-tab'}
    body = {'experimentCode': source['code'], 'participantCode': 'P001', 'sessionId': str(uuid4()), 'clientId': 'existing-tab'}
    started = client.post('/api/participant/sessions/start', headers=actor, json=body)
    assert started.status_code == 200
    body['sessionId'] = started.json()['sessionId']
    assert client.patch(path, headers=auth_headers, json={'status': 'Closed'}).status_code == 200
    assert client.post('/api/participant/access', json={'experimentCode': source['code'], 'participantCode': 'NEW'}).status_code == 403
    assert client.post('/api/participant/sessions/start', headers=actor, json=body).status_code == 200
    snapshot = {**body, 'finishedAt': '2026-11-05T12:00:00Z', 'answers': [], 'events': [
        {'seq': 1, 'type': 'consent', 'stageId': 'consent', 'timestamp': '2026-11-05T12:00:00Z',
         'epochMs': 1793880000000, 'perfMs': 0, 'detail': {'accepted': True}}]}
    saved = client.post('/api/participant/sessions', headers=actor, json=snapshot)
    assert saved.status_code == 201, saved.text
    assert client.post('/api/participant/sessions', headers=actor, json=snapshot).status_code == 201
    assert client.post('/api/participant/sessions/start', headers=actor, json={**body, 'sessionId': str(uuid4())}).status_code == 403
    assert client.patch(path, headers=auth_headers, json={'publish': True}).status_code == 200
    assert client.post('/api/participant/access', json={'experimentCode': source['code'], 'participantCode': 'NEW'}).status_code == 200
    assert client.patch(path, headers=auth_headers, json={'status': 'anything'}).status_code == 422


def test_server_usage_is_owner_scoped_and_excludes_internal_records(client, auth_headers):
    source = study(client, auth_headers)
    payload = {'experimentCode': source['code'], 'participantCode': 'P001', 'answers': [], 'events': [
        {'seq': 1, 'type': 'answer', 'timestamp': '2026-11-05T12:00:00Z', 'epochMs': 1, 'perfMs': 0}]}
    assert client.post('/api/participant/sessions', headers=auth_headers, json=payload).status_code == 201
    usage = client.get('/api/workspace/usage', headers=auth_headers)
    assert usage.status_code == 200
    assert usage.json() == {**usage.json(), 'experiments': 1, 'sessions': 1, 'completedSessions': 0, 'events': 1, 'recordings': 0}
    outsider = {'Authorization': 'Bearer ' + register_and_login(client, email='usage-other@example.com')}
    other = client.get('/api/workspace/usage', headers=outsider).json()
    assert all(other[key] == 0 for key in ('experiments', 'sessions', 'events', 'recordings'))
    assert client.get('/api/workspace/usage').status_code == 401
