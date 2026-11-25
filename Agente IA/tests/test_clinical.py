from sqlalchemy import text
from conftest import auth
from hashlib import sha256


def test_shared_records_are_scoped_and_exclude_patient_identity(context):
    client, engine, _ = context
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE dentists (id text PRIMARY KEY, name text, active boolean)'))
        connection.execute(text('CREATE TABLE services (id text PRIMARY KEY, name text)'))
        connection.execute(text('''CREATE TABLE attentions (id text PRIMARY KEY, dentist_id text,
            service_id text, status text, started_at text, ended_at text, created_at text,
            patient_id text)'''))
        connection.execute(text('''CREATE TABLE appointments (id text PRIMARY KEY, dentist_id text,
            service_id text, status text, starts_at text, ends_at text, patient_id text)'''))
        connection.execute(text("INSERT INTO dentists VALUES ('dentist-external-1','Propio',true),('other','Otro',true)"))
        connection.execute(text("INSERT INTO services VALUES ('s','Consulta')"))
        connection.execute(text("""INSERT INTO attentions VALUES
            ('a1','dentist-external-1','s','COMPLETED',NULL,NULL,'2026-11-01','private-1'),
            ('a2','other','s','PENDING',NULL,NULL,'2026-11-02','private-2')"""))
        connection.execute(text("""INSERT INTO appointments VALUES
            ('c1','dentist-external-1','s','SCHEDULED','2026-11-10','2026-11-10','private-1'),
            ('c2','other','s','SCHEDULED','2026-11-11','2026-11-11','private-2')"""))

    assert client.get('/api/v1/clinical/records?kind=attentions', headers=auth(client)).status_code == 503
    client.app.state.settings.clinical_connector_enabled = True
    admin = client.get('/api/v1/clinical/records?kind=attentions', headers=auth(client))
    assert admin.status_code == 200 and len(admin.json()['items']) == 2
    assert all('patient_id' not in row for row in admin.json()['items'])
    reception = client.get('/api/v1/clinical/records?kind=attentions',
                           headers=auth(client, 'RECEPTION'))
    assert reception.status_code == 200 and len(reception.json()['items']) == 2
    dentist = client.get('/api/v1/clinical/records?kind=appointments',
                         headers=auth(client, 'DENTIST'))
    assert [row['id'] for row in dentist.json()['items']] == ['c1']
    summary = client.get('/api/v1/clinical/summary', headers=auth(client, 'DENTIST'))
    assert summary.json() == {'scope': 'own', 'attentions_by_status':
                              [{'status': 'COMPLETED', 'total': 1}]}
    assert client.get('/api/v1/clinical/records?kind=attentions',
                      headers=auth(client, 'SUPPORT')).status_code == 403
    key = 'test-agent-clinical-key'
    client.app.state.settings.esp_agent_key_hash = sha256(key.encode()).hexdigest()
    client.app.state.settings.esp_agent_owner_id = 'ADMIN'
    delegated = client.get('/api/v1/agent/clinical/records?kind=attentions',
                           headers={'X-Agent-Key': key})
    assert delegated.status_code == 200 and len(delegated.json()['items']) == 2
    assert all('patient_id' not in row for row in delegated.json()['items'])
    assert client.get('/api/v1/agent/clinical/summary',
                      headers={'X-Agent-Key': key}).status_code == 200
    assert client.get('/api/v1/agent/clinical/records?kind=attentions',
                      headers={'X-Agent-Key': 'wrong'}).status_code == 401
    payload = {'name':'Dentista nuevo','email':'newdentist@example.com',
               'password':'Seguro-de-prueba-2026!', 'role':'DENTIST',
               'dentist_id':'missing'}
    assert client.post('/api/v1/users', json=payload,
                       headers=auth(client)).status_code == 422
    assert client.post('/api/v1/users', json={**payload,'dentist_id':'other'},
                       headers=auth(client)).status_code == 201
    assert client.post('/api/v1/users', json={**payload,'role':'ADMIN','dentist_id':None,
        'email':'extra-admin@example.com'}, headers=auth(client)).status_code == 403
