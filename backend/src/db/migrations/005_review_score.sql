ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_report jsonb;
