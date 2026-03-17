import type { Request, Response } from 'express';
import { Router } from 'express';
import { exportSession } from '../services/export.js';

interface AuthenticatedUser {
  id: string;
}

const uuidV4LikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();

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

function forbidden(response: Response): void {
  response.status(403).json({
    success: false,
    error: 'Forbidden',
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

  try {
    const pdfBuffer = await exportSession(sessionId);

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

export { router as exportRouter };
