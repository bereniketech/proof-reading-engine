import type { Request, Response } from 'express';
import { Router } from 'express';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';

interface AuthenticatedUser {
  id: string;
}

function getAuthenticatedUser(res: Response): AuthenticatedUser | null {
  const user = res.locals.user;
  if (!user || typeof user.id !== 'string') {
    return null;
  }
  return { id: user.id };
}

function getVerifiedAccessToken(res: Response): string | null {
  const token = res.locals.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export const sessionsListRouter = Router();

sessionsListRouter.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);
  if (!user || !accessToken) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error, count } = await supabase
    .from('sessions')
    .select('id, filename, file_type, document_type, status, created_at, updated_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      sessions: data ?? [],
      total: count ?? 0,
      page,
      limit,
    },
  });
});
