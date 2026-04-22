import type { Request, Response } from 'express';
import { Router } from 'express';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';
import { calculateDiff } from '../services/diff-calculator.js';

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

export const sessionsDiffRouter = Router();

// GET /api/sessions/:id/diff/:compareId
sessionsDiffRouter.get(
  '/sessions/:id/diff/:compareId',
  async (req: Request, res: Response): Promise<void> => {
    const user = getAuthenticatedUser(res);
    const accessToken = getVerifiedAccessToken(res);
    if (!user || !accessToken) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const sessionAId = typeof req.params.id === 'string' ? req.params.id : undefined;
    const sessionBId = typeof req.params.compareId === 'string' ? req.params.compareId : undefined;

    if (!sessionAId || !isUuid(sessionAId) || !sessionBId || !isUuid(sessionBId)) {
      res.status(400).json({ success: false, error: 'Invalid session ID' });
      return;
    }

    const supabase = createUserScopedSupabaseClient(accessToken);

    const [resA, resB] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, user_id, filename, created_at, tone_consistency_score')
        .eq('id', sessionAId)
        .single(),
      supabase
        .from('sessions')
        .select('id, user_id, filename, created_at, tone_consistency_score')
        .eq('id', sessionBId)
        .single(),
    ]);

    if (resA.error || !resA.data) {
      res.status(404).json({ success: false, error: 'Session A not found' });
      return;
    }
    if (resB.error || !resB.data) {
      res.status(404).json({ success: false, error: 'Session B not found' });
      return;
    }
    if (resA.data.user_id !== user.id || resB.data.user_id !== user.id) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const [secA, secB] = await Promise.all([
      supabase
        .from('sections')
        .select('ai_score, corrected_text, original_text, status')
        .eq('session_id', sessionAId),
      supabase
        .from('sections')
        .select('ai_score, corrected_text, original_text, status')
        .eq('session_id', sessionBId),
    ]);

    if (secA.error || secB.error) {
      res.status(500).json({ success: false, error: 'Failed to load sections' });
      return;
    }

    const report = calculateDiff(
      resA.data,
      secA.data ?? [],
      resB.data,
      secB.data ?? [],
    );

    res.status(200).json({ success: true, data: report });
  },
);
