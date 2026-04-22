ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completeness_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completeness_report jsonb;
