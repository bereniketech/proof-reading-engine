ALTER TABLE sections ADD COLUMN IF NOT EXISTS tone_label text;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS tone_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tone_consistency_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tone_report jsonb;
