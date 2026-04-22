import type { Request, Response } from 'express';
import { Router } from 'express';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';
import {
  buildDocumentContext,
  saveMessage,
  loadHistory,
  streamChatResponse,
} from '../services/chat.js';

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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return uuidPattern.test(v);
}

export const sessionsChatRouter = Router();

// GET /api/sessions/:id/chat/history
sessionsChatRouter.get(
  '/sessions/:id/chat/history',
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

    try {
      const history = await loadHistory(accessToken, id);
      res.status(200).json({ success: true, data: history });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load history';
      res.status(500).json({ success: false, error: message });
    }
  },
);

// POST /api/sessions/:id/chat  (SSE streaming)
sessionsChatRouter.post(
  '/sessions/:id/chat',
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

    const { message } = req.body as { message?: unknown };
    if (typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({ success: false, error: 'message is required' });
      return;
    }

    const trimmedMessage = message.trim();

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

    const { data: sections } = await supabase
      .from('sections')
      .select('position, section_type, original_text, corrected_text')
      .eq('session_id', id)
      .order('position', { ascending: true });

    await saveMessage(accessToken, id, 'user', trimmedMessage);

    const history = await loadHistory(accessToken, id);
    // Exclude the user message we just inserted — pass only prior history
    const priorHistory = history.slice(0, -1);

    const docContext = buildDocumentContext(sections ?? []);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullResponse = '';
    try {
      for await (const token of streamChatResponse(docContext, priorHistory, trimmedMessage)) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
      }
      const msgId = await saveMessage(accessToken, id, 'assistant', fullResponse);
      res.write(`data: ${JSON.stringify({ type: 'done', messageId: msgId })}\n\n`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Stream error';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
    } finally {
      res.end();
    }
  },
);
