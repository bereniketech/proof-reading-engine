import type { Request, Response } from 'express';
import { Router } from 'express';
import { exportSession, type ReferenceStyle } from '../services/export.js';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';
import { buildTrackedChangesDocx } from '../services/track-changes-exporter.js';

interface AuthenticatedUser {
  id: string;
}

const uuidV4LikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();
const allowedReferenceStyles = new Set<ReferenceStyle>([
  'apa',
  'mla',
  'chicago',
  'ieee',
  'vancouver',
]);

function parseReferenceStyleFromBody(body: unknown): ReferenceStyle {
  if (!body || typeof body !== 'object') {
    return 'apa';
  }

  const candidate = body as { reference_style?: unknown };
  if (typeof candidate.reference_style !== 'string') {
    return 'apa';
  }

  const normalized = candidate.reference_style.trim().toLowerCase() as ReferenceStyle;
  if (!allowedReferenceStyles.has(normalized)) {
    return 'apa';
  }

  return normalized;
}

function isUuid(value: string): boolean {
  return uuidV4LikePattern.test(value);
}

function getAuthenticatedUser(response: Response): AuthenticatedUser | null {
  const user = response.locals.user;

  if (!user || typeof user.id !== 'string') {
    return null;
  }

  return {
    id: user.id,
  };
}

function unauthorized(response: Response): void {
  response.status(401).json({
    success: false,
    error: 'Unauthorized',
  });
}

function notFound(response: Response): void {
  response.status(404).json({
    success: false,
    error: 'Not found',
  });
}

function badRequest(response: Response, error: string): void {
  response.status(400).json({
    success: false,
    error,
  });
}

function serverError(response: Response, error: string): void {
  response.status(500).json({
    success: false,
    error,
  });
}

function getVerifiedAccessToken(response: Response): string | null {
  const token = response.locals.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

router.post('/export/:sessionId', async (req: Request, res: Response) => {
  const authenticatedUser = getAuthenticatedUser(res);
  const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : '';

  if (!authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sessionId)) {
    badRequest(res, 'Invalid session id format.');
    return;
  }

  const referenceStyle = parseReferenceStyleFromBody(req.body);

  try {
    const pdfBuffer = await exportSession(sessionId, { referenceStyle });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="export-${sessionId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF buffer
    res.send(pdfBuffer);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Session not found') {
        notFound(res);
      } else if (error.message.includes('Cannot export')) {
        badRequest(res, error.message);
      } else {
        serverError(res, error.message);
      }
    } else {
      serverError(res, 'Unknown error occurred during PDF export');
    }
  }
});

// GET /api/sessions/:id/export/docx-tracked
router.get('/sessions/:id/export/docx-tracked', async (req: Request, res: Response): Promise<void> => {
  const authenticatedUser = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);

  if (!authenticatedUser || !accessToken) {
    unauthorized(res);
    return;
  }

  const sessionId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!isUuid(sessionId)) {
    badRequest(res, 'Invalid session id format.');
    return;
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id, filename')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    notFound(res);
    return;
  }

  if (session.user_id !== authenticatedUser.id) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('position, section_type, heading_level, original_text, corrected_text, status')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) {
    serverError(res, sectionsError.message);
    return;
  }

  try {
    const buffer = await buildTrackedChangesDocx(sections ?? []);
    const safeFilename = (session.filename as string).replace(/\.[^.]+$/, '') + '-tracked.docx';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Failed to generate docx.');
  }
});

export { router as exportRouter };
