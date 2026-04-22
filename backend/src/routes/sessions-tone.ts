import type { Request, Response } from 'express';
import { Router } from 'express';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';
import { runToneCheck } from '../services/tone-checker.js';

interface AuthenticatedUser {
  id: string;
}

function getAuthenticatedUser(res: Response): AuthenticatedUser | null {
  const user = res.locals.user;
  return user && typeof user.id === 'string' ? { id: user.id } : null;
}

function getVerifiedAccessToken(res: Response): string | null {
  const token = res.locals.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return uuidPattern.test(v);
}

export const sessionsToneRouter = Router();

// GET /api/sessions/:id/tone
sessionsToneRouter.get(
  '/sessions/:id/tone',
  async (req: Request, res: Response): Promise<void> => {
    const user = getAuthenticatedUser(res);
    const accessToken = getVerifiedAccessToken(res);
    if (!user || !accessToken) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const id = typeof req.params.id === 'string' ? req.params.id : undefined;
    if (!id || !isUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid session ID' });
      return;
    }

    const supabase = createUserScopedSupabaseClient(accessToken);

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    if (session.user_id !== user.id) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('id, position, corrected_text, original_text')
      .eq('session_id', id)
      .order('position', { ascending: true });

    if (sectionsError) {
      res.status(500).json({ success: false, error: sectionsError.message });
      return;
    }

    try {
      const result = await runToneCheck(id, sections ?? []);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tone check failed';
      res.status(500).json({ success: false, error: message });
    }
  },
);
