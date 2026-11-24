ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE dentists ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
