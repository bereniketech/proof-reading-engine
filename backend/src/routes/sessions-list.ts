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

sessionsListRouter.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);
  if (!user || !accessToken) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ success: false, error: 'Session ID is required' });
    return;
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  // Verify ownership before deleting
  const { data: existing, error: fetchError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !existing) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.status(200).json({ success: true, data: null });
});

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
