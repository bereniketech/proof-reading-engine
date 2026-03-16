CREATE OR REPLACE FUNCTION public.persist_session_sections(
  p_session_id uuid,
  p_sections jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.sections (
    session_id,
    position,
    section_type,
    heading_level,
    original_text,
    reference_text
  )
  SELECT
    p_session_id,
    (section_item->>'position')::integer,
    section_item->>'section_type',
    CASE
      WHEN section_item ? 'heading_level' AND section_item->>'heading_level' IS NOT NULL
      THEN (section_item->>'heading_level')::integer
      ELSE NULL
    END,
    section_item->>'original_text',
    section_item->>'reference_text'
  FROM jsonb_array_elements(p_sections) AS section_item
  ON CONFLICT (session_id, position)
  DO UPDATE SET
    section_type = EXCLUDED.section_type,
    heading_level = EXCLUDED.heading_level,
    original_text = EXCLUDED.original_text,
    reference_text = EXCLUDED.reference_text,
    updated_at = now();

  UPDATE public.sessions
  SET status = 'proofreading',
      updated_at = now()
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % does not exist.', p_session_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.persist_session_sections(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_session_sections(uuid, jsonb) TO authenticated;
