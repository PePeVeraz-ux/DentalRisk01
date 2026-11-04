CREATE INDEX attention_started ON attentions(started_at) WHERE status='COMPLETED';
CREATE INDEX attention_station_started ON attentions(station_id,started_at,id) WHERE status='COMPLETED';
