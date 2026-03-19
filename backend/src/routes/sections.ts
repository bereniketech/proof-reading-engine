import type { Request, Response } from 'express';
import { Router } from 'express';
import { createAdminSupabaseClient, createUserScopedSupabaseClient } from '../lib/supabase.js';
import { applySectionInstruction } from '../services/openai.js';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';

interface AuthenticatedUser {
  id: string;
}

interface UpdateSectionBody {
  status?: SectionStatus;
  final_text?: string;
  reference_text?: string;
}

const sectionStatuses = new Set<SectionStatus>(['pending', 'ready', 'accepted', 'rejected']);
const uuidV4LikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();
let adminClient: any;

function getAdminClient(): any {
  if (!adminClient) {
    adminClient = createAdminSupabaseClient();
  }
  return adminClient;
}

function isUuid(value: string): boolean {
  return uuidV4LikePattern.test(value);
}

function getVerifiedAccessToken(response: Response): string | null {
  const accessToken = response.locals.accessToken;

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return null;
  }

  return accessToken;
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

function parseUpdateSectionBody(body: unknown): UpdateSectionBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Partial<UpdateSectionBody>;
  const hasStatus = Object.hasOwn(candidate, 'status');
  const hasFinalText = Object.hasOwn(candidate, 'final_text');
  const hasReferenceText = Object.hasOwn(candidate, 'reference_text');

  if (!hasStatus && !hasFinalText && !hasReferenceText) {
    return null;
  }

  if (hasStatus && (!candidate.status || !sectionStatuses.has(candidate.status))) {
    return null;
  }

  if (hasFinalText) {
    if (typeof candidate.final_text !== 'string') {
      return null;
    }

    if (candidate.final_text.length > 100_000) {
      return null;
    }
  }

  if (hasReferenceText) {
    if (typeof candidate.reference_text !== 'string') {
      return null;
    }

    if (candidate.reference_text.length > 100_000) {
      return null;
    }
  }

  return {
    ...(candidate.status ? { status: candidate.status } : {}),
    ...(typeof candidate.final_text === 'string' ? { final_text: candidate.final_text } : {}),
    ...(typeof candidate.reference_text === 'string'
      ? { reference_text: candidate.reference_text }
      : {}),
  };
}

async function getSessionOwnerId(sessionId: string): Promise<string | null> {
  const client = getAdminClient();
  const { data, error } = await client.from('sessions').select('user_id').eq('id', sessionId).maybeSingle();

  if (error || !data || typeof data.user_id !== 'string') {
    return null;
  }

  return data.user_id;
}

async function getSectionOwnerId(sectionId: string): Promise<string | null> {
  const client = getAdminClient();
  const { data, error } = await client
    .from('sections')
    .select('session:sessions!inner(user_id)')
    .eq('id', sectionId)
    .maybeSingle();

  if (error || !data || !('session' in data)) {
    return null;
  }

  const sessionValue = data.session;
  if (!sessionValue || typeof sessionValue !== 'object' || !('user_id' in sessionValue)) {
    return null;
  }

  const ownerId = sessionValue.user_id;
  if (typeof ownerId !== 'string') {
    return null;
  }

  return ownerId;
}

router.get('/sessions/:id', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sessionId = typeof req.params.id === 'string' ? req.params.id : '';

  if (!authToken || !authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sessionId)) {
    badRequest(res, 'Invalid session id format.');
    return;
  }

  const supabase = createUserScopedSupabaseClient(authToken);
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id, filename, file_type, status, created_at, updated_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    serverError(res, 'Failed to fetch session.');
    return;
  }

  if (!session) {
    const ownerId = await getSessionOwnerId(sessionId);
    if (ownerId && ownerId !== authenticatedUser.id) {
      forbidden(res);
      return;
    }

    notFound(res);
    return;
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) {
    serverError(res, 'Failed to fetch session sections.');
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      session,
      sections: sections ?? [],
    },
  });
});

router.get('/sections/:id', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sectionId = typeof req.params.id === 'string' ? req.params.id : '';

  if (!authToken || !authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sectionId)) {
    badRequest(res, 'Invalid section id format.');
    return;
  }

  const supabase = createUserScopedSupabaseClient(authToken);
  const { data: section, error } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .eq('id', sectionId)
    .maybeSingle();

  if (error) {
    serverError(res, 'Failed to fetch section.');
    return;
  }

  if (!section) {
    const ownerId = await getSectionOwnerId(sectionId);
    if (ownerId && ownerId !== authenticatedUser.id) {
      forbidden(res);
      return;
    }

    notFound(res);
    return;
  }

  res.status(200).json({
    success: true,
    data: section,
  });
});

router.patch('/sections/:id', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sectionId = typeof req.params.id === 'string' ? req.params.id : '';

  if (!authToken || !authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sectionId)) {
    badRequest(res, 'Invalid section id format.');
    return;
  }

  const parsedBody = parseUpdateSectionBody(req.body);
  if (!parsedBody) {
    badRequest(
      res,
      'Invalid payload. Provide at least one field: status {pending, ready, accepted, rejected}, final_text string (<=100000 chars), or reference_text string (<=100000 chars).',
    );
    return;
  }

  const updatePayload = {
    ...(parsedBody.status ? { status: parsedBody.status } : {}),
    ...(Object.hasOwn(parsedBody, 'final_text') ? { final_text: parsedBody.final_text } : {}),
    ...(Object.hasOwn(parsedBody, 'reference_text')
      ? { reference_text: parsedBody.reference_text }
      : {}),
  };

  const supabase = createUserScopedSupabaseClient(authToken);
  const { data: updatedSection, error } = await supabase
    .from('sections')
    .update(updatePayload)
    .eq('id', sectionId)
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .maybeSingle();

  if (error) {
    serverError(res, 'Failed to update section.');
    return;
  }

  if (!updatedSection) {
    const ownerId = await getSectionOwnerId(sectionId);
    if (ownerId && ownerId !== authenticatedUser.id) {
      forbidden(res);
      return;
    }

    notFound(res);
    return;
  }

  res.status(200).json({
    success: true,
    data: updatedSection,
  });
});

const MAX_INSTRUCTION_LENGTH = 2000;

router.post('/sections/:id/instruct', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sectionId = typeof req.params.id === 'string' ? req.params.id : '';

  if (!authToken || !authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sectionId)) {
    badRequest(res, 'Invalid section id format.');
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : '';

  if (instruction.length === 0) {
    badRequest(res, 'Instruction is required.');
    return;
  }

  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    badRequest(res, `Instruction must be ${MAX_INSTRUCTION_LENGTH} characters or fewer.`);
    return;
  }

  const supabase = createUserScopedSupabaseClient(authToken);
  const { data: section, error: fetchError } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .eq('id', sectionId)
    .maybeSingle();

  if (fetchError) {
    serverError(res, 'Failed to fetch section.');
    return;
  }

  if (!section) {
    const ownerId = await getSectionOwnerId(sectionId);
    if (ownerId && ownerId !== authenticatedUser.id) {
      forbidden(res);
      return;
    }

    notFound(res);
    return;
  }

  const currentText = (section.final_text ?? section.corrected_text ?? section.original_text) as string;

  let result;
  try {
    result = await applySectionInstruction(currentText, instruction);
  } catch (aiError) {
    console.error('applySectionInstruction failed', {
      sectionId,
      error: aiError instanceof Error ? aiError.message : 'Unknown error',
    });
    serverError(res, 'AI instruction failed. Please try again.');
    return;
  }

  const { data: updatedSection, error: updateError } = await supabase
    .from('sections')
    .update({
      corrected_text: result.corrected_text,
      change_summary: result.change_summary,
      status: 'ready',
    })
    .eq('id', sectionId)
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .maybeSingle();

  if (updateError || !updatedSection) {
    serverError(res, 'Failed to update section after applying instruction.');
    return;
  }

  res.status(200).json({
    success: true,
    data: updatedSection,
  });
});

export { router as sectionsRouter };
