ALTER TABLE sessions ADD COLUMN operation_until timestamptz;
CREATE INDEX attention_created ON attentions(created_at);
CREATE INDEX appointment_start ON appointments(starts_at);
