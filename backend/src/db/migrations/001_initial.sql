-- Enable UUID generation for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('docx', 'pdf', 'txt')),
  status text NOT NULL DEFAULT 'parsing' CHECK (status IN ('parsing', 'proofreading', 'review', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  section_type text NOT NULL CHECK (section_type IN ('heading', 'paragraph')),
  heading_level integer,
  original_text text NOT NULL,
  corrected_text text,
  reference_text text,
  final_text text,
  change_summary text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sections_session_position
  ON public.sections (session_id, position);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_owner_select ON public.sessions;
DROP POLICY IF EXISTS sessions_owner_insert ON public.sessions;
DROP POLICY IF EXISTS sessions_owner_update ON public.sessions;
DROP POLICY IF EXISTS sessions_owner_delete ON public.sessions;

CREATE POLICY sessions_owner_select
  ON public.sessions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY sessions_owner_insert
  ON public.sessions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY sessions_owner_update
  ON public.sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY sessions_owner_delete
  ON public.sessions
  FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS sections_owner_select ON public.sections;
DROP POLICY IF EXISTS sections_owner_insert ON public.sections;
DROP POLICY IF EXISTS sections_owner_update ON public.sections;
DROP POLICY IF EXISTS sections_owner_delete ON public.sections;

CREATE POLICY sections_owner_select
  ON public.sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY sections_owner_insert
  ON public.sections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY sections_owner_update
  ON public.sections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_id
      AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY sections_owner_delete
  ON public.sections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_id
      AND s.user_id = auth.uid()
    )
  );
