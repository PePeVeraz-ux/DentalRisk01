CREATE TABLE operation_mutex (id integer PRIMARY KEY CHECK (id=1));
INSERT INTO operation_mutex VALUES (1);
CREATE TABLE dentists (id text PRIMARY KEY, name text NOT NULL, specialty text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true);
CREATE TABLE users (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('ADMIN','RECEPTION','DENTIST','SUPPORT')), dentist_id text REFERENCES dentists(id), active boolean NOT NULL DEFAULT true,
 CHECK(role <> 'DENTIST' OR dentist_id IS NOT NULL));
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), csrf text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE login_attempts (key text PRIMARY KEY, failures integer NOT NULL DEFAULT 0, blocked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE services (id text PRIMARY KEY, name text NOT NULL UNIQUE, price_cents bigint NOT NULL CHECK(price_cents>=0), active boolean NOT NULL DEFAULT true);
CREATE TABLE stations (id text PRIMARY KEY, name text NOT NULL UNIQUE, token_hash text, active boolean NOT NULL DEFAULT true);
CREATE TABLE patients (id text PRIMARY KEY, name text NOT NULL, reference text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true);
CREATE TABLE cards (id text PRIMARY KEY, uid text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','ASSIGNED','BLOCKED')));
CREATE TABLE shifts (id text PRIMARY KEY, name text NOT NULL, weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6), start_time time NOT NULL, end_time time NOT NULL,
 active boolean NOT NULL DEFAULT true, CHECK(end_time>start_time));
CREATE TABLE calendar_days (id text PRIMARY KEY, shift_id text NOT NULL REFERENCES shifts(id), day date NOT NULL, operated boolean NOT NULL,
 breaks jsonb NOT NULL DEFAULT '[]', UNIQUE(shift_id,day));
CREATE TABLE appointments (id text PRIMARY KEY, patient_id text NOT NULL REFERENCES patients(id), dentist_id text NOT NULL REFERENCES dentists(id),
 service_id text NOT NULL REFERENCES services(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','CANCELLED','ATTENDED')), CHECK(ends_at>starts_at));
CREATE TABLE attentions (id text PRIMARY KEY, patient_id text NOT NULL REFERENCES patients(id), dentist_id text NOT NULL REFERENCES dentists(id),
 service_id text NOT NULL REFERENCES services(id), station_id text NOT NULL REFERENCES stations(id), shift_id text NOT NULL REFERENCES shifts(id),
 appointment_id text REFERENCES appointments(id), card_id text NOT NULL REFERENCES cards(id),
 price_cents bigint NOT NULL CHECK(price_cents>=0), status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED','INCIDENT')),
 started_at timestamptz, ended_at timestamptz, released_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ended_at IS NULL OR (started_at IS NOT NULL AND ended_at>=started_at)),
 CHECK(status<>'COMPLETED' OR (started_at IS NOT NULL AND ended_at IS NOT NULL)));
CREATE UNIQUE INDEX active_card ON attentions(card_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX active_appointment ON attentions(appointment_id) WHERE status IN ('PENDING','IN_PROGRESS');
CREATE UNIQUE INDEX active_station ON attentions(station_id) WHERE status='IN_PROGRESS';
CREATE UNIQUE INDEX active_dentist ON attentions(dentist_id) WHERE status='IN_PROGRESS';
CREATE TABLE assignments (id text PRIMARY KEY, attention_id text NOT NULL REFERENCES attentions(id), card_id text NOT NULL REFERENCES cards(id),
 assigned_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz);
CREATE UNIQUE INDEX current_assignment ON assignments(card_id) WHERE released_at IS NULL;
CREATE TABLE rfid_events (id text PRIMARY KEY, station_id text NOT NULL REFERENCES stations(id), uid text NOT NULL, occurred_at timestamptz NOT NULL,
 response jsonb NOT NULL);
CREATE TABLE incidents (id text PRIMARY KEY, attention_id text NOT NULL REFERENCES attentions(id), actor_id text NOT NULL REFERENCES users(id),
 kind text NOT NULL, reason text NOT NULL, before_value jsonb NOT NULL, after_value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit (id text PRIMARY KEY, actor_id text REFERENCES users(id), action text NOT NULL, entity_id text, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE weekly_reports (week_start date PRIMARY KEY, payload jsonb NOT NULL, generated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX attention_report ON attentions(ended_at,dentist_id) WHERE status='COMPLETED';
CREATE INDEX audit_created ON audit(created_at);
CREATE INDEX appointment_schedule ON appointments(dentist_id,starts_at);
