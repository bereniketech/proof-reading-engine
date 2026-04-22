import type { Request, Response } from 'express';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient, createUserScopedSupabaseClient } from '../lib/supabase.js';
import { applySectionInstruction } from '../services/openai.js';
import { matchReferencesToSections, suggestReferencesForSection, NoReferencesSectionError } from '../services/reference-matcher.js';
import { humanizeSection } from '../services/humanizer.js';
import { reformatSection, type ReformatType } from '../services/reformatter.js';
import { suggestSection, insertSection } from '../services/section-inserter.js';

type SectionType = 'heading' | 'paragraph';
type InsertPlacement = 'above' | 'below';
type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';

interface AuthenticatedUser {
  id: string;
}

interface UpdateSectionBody {
  status?: SectionStatus;
  final_text?: string;
  reference_text?: string;
}

interface CreateSectionBody {
  anchor_section_id: string;
  placement: InsertPlacement;
  section_type: SectionType;
  heading_level: number | null;
  text: string;
}

interface SplitSectionBody {
  top_text: string;
  bottom_text: string;
  bottom_section_type: SectionType;
  bottom_heading_level: number | null;
}

interface SectionRow {
  id: string;
  session_id: string;
  position: number;
  section_type: SectionType;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
  reference_text: string | null;
  final_text: string | null;
  change_summary: string | null;
  ai_score: number | null;
  humanized_text: string | null;
  reformatted_text: string | null;
  reformat_type: string | null;
  status: SectionStatus;
  created_at: string;
  updated_at: string;
}

const sectionTypes = new Set<SectionType>(['heading', 'paragraph']);
const insertPlacements = new Set<InsertPlacement>(['above', 'below']);
const sectionStatuses = new Set<SectionStatus>(['pending', 'ready', 'accepted', 'rejected']);
const uuidV4LikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SECTION_TEXT_LENGTH = 100_000;

const router = Router();
let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
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

function parseCreateSectionBody(body: unknown): CreateSectionBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const anchorSectionId =
    typeof candidate.anchor_section_id === 'string'
      ? candidate.anchor_section_id
      : typeof candidate.insert_after_section_id === 'string'
        ? candidate.insert_after_section_id
        : '';
  const placement =
    typeof candidate.placement === 'string' ? (candidate.placement as InsertPlacement) : 'below';
  const sectionType =
    typeof candidate.section_type === 'string' ? (candidate.section_type as SectionType) : null;
  const rawText = typeof candidate.text === 'string' ? candidate.text.trim() : '';
  const rawHeadingLevel = candidate.heading_level;

  if (!isUuid(anchorSectionId)) {
    return null;
  }

  if (!insertPlacements.has(placement)) {
    return null;
  }

  if (!sectionType || !sectionTypes.has(sectionType)) {
    return null;
  }

  if (rawText.length === 0 || rawText.length > MAX_SECTION_TEXT_LENGTH) {
    return null;
  }

  let headingLevel: number | null = null;
  if (sectionType === 'heading') {
    if (rawHeadingLevel === null || typeof rawHeadingLevel === 'undefined') {
      headingLevel = 2;
    } else if (
      typeof rawHeadingLevel === 'number' &&
      Number.isInteger(rawHeadingLevel) &&
      rawHeadingLevel >= 1 &&
      rawHeadingLevel <= 6
    ) {
      headingLevel = rawHeadingLevel;
    } else {
      return null;
    }
  }

  return {
    anchor_section_id: anchorSectionId,
    placement,
    section_type: sectionType,
    heading_level: headingLevel,
    text: rawText,
  };
}

function parseSplitSectionBody(body: unknown): SplitSectionBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const topText = typeof candidate.top_text === 'string' ? candidate.top_text.trim() : '';
  const bottomText = typeof candidate.bottom_text === 'string' ? candidate.bottom_text.trim() : '';
  const bottomSectionType =
    typeof candidate.bottom_section_type === 'string'
      ? (candidate.bottom_section_type as SectionType)
      : null;
  const rawBottomHeadingLevel = candidate.bottom_heading_level;

  if (topText.length === 0 || topText.length > MAX_SECTION_TEXT_LENGTH) {
    return null;
  }

  if (bottomText.length === 0 || bottomText.length > MAX_SECTION_TEXT_LENGTH) {
    return null;
  }

  if (!bottomSectionType || !sectionTypes.has(bottomSectionType)) {
    return null;
  }

  let bottomHeadingLevel: number | null = null;
  if (bottomSectionType === 'heading') {
    if (
      typeof rawBottomHeadingLevel === 'number' &&
      Number.isInteger(rawBottomHeadingLevel) &&
      rawBottomHeadingLevel >= 1 &&
      rawBottomHeadingLevel <= 6
    ) {
      bottomHeadingLevel = rawBottomHeadingLevel;
    } else if (rawBottomHeadingLevel === null || typeof rawBottomHeadingLevel === 'undefined') {
      bottomHeadingLevel = 2;
    } else {
      return null;
    }
  }

  return {
    top_text: topText,
    bottom_text: bottomText,
    bottom_section_type: bottomSectionType,
    bottom_heading_level: bottomHeadingLevel,
  };
}

function parseLinkedReferencePositions(referenceText: string | null): number[] {
  if (!referenceText) {
    return [];
  }

  try {
    const parsed = JSON.parse(referenceText) as { linked_reference_positions?: unknown };
    if (!Array.isArray(parsed.linked_reference_positions)) {
      return [];
    }

    const positions = new Set<number>();
    for (const rawPosition of parsed.linked_reference_positions) {
      if (typeof rawPosition !== 'number' || !Number.isFinite(rawPosition)) {
        continue;
      }

      positions.add(Math.trunc(rawPosition));
    }

    return Array.from(positions.values()).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function serializeLinkedReferencePositions(positions: number[]): string {
  return JSON.stringify({
    linked_reference_positions: Array.from(new Set(positions)).sort((a, b) => a - b),
  });
}

async function fetchOrderedSessionSections(sessionId: string): Promise<SectionRow[]> {
  const client = getAdminClient();
  const { data, error } = await client
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (error) {
    throw new Error('Failed to fetch session sections.');
  }

  return (data ?? []) as SectionRow[];
}

async function fetchSectionById(sectionId: string): Promise<SectionRow | null> {
  const client = getAdminClient();
  const { data, error } = await client
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
    )
    .eq('id', sectionId)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to fetch section.');
  }

  return (data as SectionRow | null) ?? null;
}

async function shiftSectionPositionsForInsert(sessionId: string, startingPosition: number): Promise<void> {
  const client = getAdminClient();
  const { data, error } = await client
    .from('sections')
    .select('id, position')
    .eq('session_id', sessionId)
    .gte('position', startingPosition)
    .order('position', { ascending: false });

  if (error) {
    throw new Error('Failed to prepare section positions for insertion.');
  }

  for (const section of data ?? []) {
    const currentSection = section as { id: string; position: number };
    const { error: updateError } = await client
      .from('sections')
      .update({ position: currentSection.position + 1 })
      .eq('id', currentSection.id);

    if (updateError) {
      throw new Error('Failed to shift section positions.');
    }
  }
}

async function insertSectionAtPosition(
  sessionId: string,
  position: number,
  sectionType: SectionType,
  headingLevel: number | null,
  text: string,
): Promise<SectionRow> {
  const client = getAdminClient();
  const { data, error } = await client
    .from('sections')
    .insert({
      session_id: sessionId,
      position,
      section_type: sectionType,
      heading_level: sectionType === 'heading' ? headingLevel : null,
      original_text: text,
      corrected_text: text,
      reference_text: null,
      final_text: null,
      change_summary: null,
      status: 'ready',
    })
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error('Failed to create section.');
  }

  return data as SectionRow;
}

async function resequenceSessionSections(sessionId: string): Promise<SectionRow[]> {
  const client = getAdminClient();
  const sections = await fetchOrderedSessionSections(sessionId);

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section || section.position === index) {
      continue;
    }

    const { error } = await client
      .from('sections')
      .update({ position: index })
      .eq('id', section.id);

    if (error) {
      throw new Error('Failed to resequence section positions.');
    }
  }

  return fetchOrderedSessionSections(sessionId);
}

async function remapReferenceLinks(
  previousSections: SectionRow[],
  nextSections: SectionRow[],
  aliasBySectionId: Map<string, string> = new Map(),
): Promise<void> {
  const client = getAdminClient();
  const previousSectionIdByPosition = new Map<number, string>();
  const nextPositionBySectionId = new Map<string, number>();

  for (const section of previousSections) {
    previousSectionIdByPosition.set(section.position, section.id);
  }

  for (const section of nextSections) {
    nextPositionBySectionId.set(section.id, section.position);
  }

  for (const previousSection of previousSections) {
    if (!nextPositionBySectionId.has(previousSection.id)) {
      continue;
    }

    const nextPositions = parseLinkedReferencePositions(previousSection.reference_text)
      .map((position) => previousSectionIdByPosition.get(position) ?? null)
      .map((sectionId) => (sectionId ? aliasBySectionId.get(sectionId) ?? sectionId : null))
      .map((sectionId) => (sectionId ? nextPositionBySectionId.get(sectionId) ?? null : null))
      .filter((position): position is number => typeof position === 'number');

    const nextReferenceText =
      nextPositions.length > 0 ? serializeLinkedReferencePositions(nextPositions) : null;

    if (nextReferenceText === previousSection.reference_text) {
      continue;
    }

    const { error } = await client
      .from('sections')
      .update({ reference_text: nextReferenceText })
      .eq('id', previousSection.id);

    if (error) {
      throw new Error('Failed to update reference links after reordering sections.');
    }
  }
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
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, reformatted_text, reformat_type, status, created_at, updated_at',
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
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
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
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
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
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
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
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
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

router.post('/sessions/:sessionId/sections', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : '';

  if (!authToken || !authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sessionId)) {
    badRequest(res, 'Invalid session id format.');
    return;
  }

  const parsedBody = parseCreateSectionBody(req.body);
  if (!parsedBody) {
    badRequest(
      res,
      'Invalid payload. Provide anchor_section_id UUID, placement {above|below}, section_type {heading|paragraph}, text string (1-100000 chars), and heading_level 1-6 for headings.',
    );
    return;
  }

  const ownerId = await getSessionOwnerId(sessionId);
  if (!ownerId) {
    notFound(res);
    return;
  }

  if (ownerId !== authenticatedUser.id) {
    forbidden(res);
    return;
  }

  try {
    const previousSections = await fetchOrderedSessionSections(sessionId);
    const anchorSection = previousSections.find((section) => section.id === parsedBody.anchor_section_id);

    if (!anchorSection) {
      badRequest(res, 'anchor_section_id was not found in this session.');
      return;
    }

    const nextPosition =
      parsedBody.placement === 'above' ? anchorSection.position : anchorSection.position + 1;
    await shiftSectionPositionsForInsert(sessionId, nextPosition);
    const insertedSection = await insertSectionAtPosition(
      sessionId,
      nextPosition,
      parsedBody.section_type,
      parsedBody.heading_level,
      parsedBody.text,
    );

    const nextSections = await fetchOrderedSessionSections(sessionId);
    await remapReferenceLinks(previousSections, nextSections);
    const finalSections = await fetchOrderedSessionSections(sessionId);

    res.status(200).json({
      success: true,
      data: {
        inserted_section_id: insertedSection.id,
        sections: finalSections,
      },
    });
  } catch (error) {
    serverError(res, error instanceof Error ? error.message : 'Failed to create section.');
  }
});

router.post('/sections/:id/split', async (req: Request, res: Response) => {
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

  const parsedBody = parseSplitSectionBody(req.body);
  if (!parsedBody) {
    badRequest(
      res,
      'Invalid payload. Provide top_text and bottom_text strings (1-100000 chars), plus bottom_section_type {heading|paragraph} and heading_level 1-6 for heading sections.',
    );
    return;
  }

  const ownerId = await getSectionOwnerId(sectionId);
  if (ownerId && ownerId !== authenticatedUser.id) {
    forbidden(res);
    return;
  }

  if (!ownerId) {
    notFound(res);
    return;
  }

  try {
    const currentSection = await fetchSectionById(sectionId);
    if (!currentSection) {
      notFound(res);
      return;
    }

    const sessionId = currentSection.session_id;
    const previousSections = await fetchOrderedSessionSections(sessionId);
    await shiftSectionPositionsForInsert(sessionId, currentSection.position + 1);

    const client = getAdminClient();
    const { error: updateError } = await client
      .from('sections')
      .update({
        original_text: parsedBody.top_text,
        corrected_text: parsedBody.top_text,
        final_text: null,
        change_summary: null,
        status: 'ready',
      })
      .eq('id', currentSection.id);

    if (updateError) {
      serverError(res, 'Failed to update the original section during split.');
      return;
    }

    const insertedSection = await insertSectionAtPosition(
      sessionId,
      currentSection.position + 1,
      parsedBody.bottom_section_type,
      parsedBody.bottom_heading_level,
      parsedBody.bottom_text,
    );

    const nextSections = await fetchOrderedSessionSections(sessionId);
    await remapReferenceLinks(previousSections, nextSections);
    const finalSections = await fetchOrderedSessionSections(sessionId);

    res.status(200).json({
      success: true,
      data: {
        updated_section_id: currentSection.id,
        inserted_section_id: insertedSection.id,
        sections: finalSections,
      },
    });
  } catch (error) {
    serverError(res, error instanceof Error ? error.message : 'Failed to split section.');
  }
});

const MAX_MERGE_COUNT = 20;

router.post('/sessions/:sessionId/merge-sections', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : '';

  if (!authToken || !authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sessionId)) {
    badRequest(res, 'Invalid session id format.');
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const rawIds = body?.section_ids;

  if (!Array.isArray(rawIds) || rawIds.length < 2) {
    badRequest(res, 'section_ids must be an array of at least 2 section IDs.');
    return;
  }

  if (rawIds.length > MAX_MERGE_COUNT) {
    badRequest(res, `Cannot merge more than ${MAX_MERGE_COUNT} sections at once.`);
    return;
  }

  const sectionIds: string[] = [];
  for (const rawId of rawIds) {
    if (typeof rawId !== 'string' || !isUuid(rawId)) {
      badRequest(res, 'All section_ids must be valid UUIDs.');
      return;
    }
    sectionIds.push(rawId);
  }

  const uniqueIds = Array.from(new Set(sectionIds));
  if (uniqueIds.length < 2) {
    badRequest(res, 'section_ids must contain at least 2 distinct section IDs.');
    return;
  }

  const ownerId = await getSessionOwnerId(sessionId);
  if (!ownerId) {
    notFound(res);
    return;
  }

  if (ownerId !== authenticatedUser.id) {
    forbidden(res);
    return;
  }

  try {
    const previousSections = await fetchOrderedSessionSections(sessionId);
    const sectionsToMerge = previousSections.filter((section) => uniqueIds.includes(section.id));

    if (sectionsToMerge.length !== uniqueIds.length) {
      badRequest(res, 'One or more section IDs were not found in this session.');
      return;
    }

    const sorted = [...sectionsToMerge].sort((a, b) => a.position - b.position);
    const surviving = sorted[0];

    if (!surviving) {
      badRequest(res, 'Unable to determine which section should survive the merge.');
      return;
    }

    const deleteIds = sorted.slice(1).map((section) => section.id);
    const mergedOriginalText = sorted.map((section) => section.original_text).join('\n\n');
    const mergedCorrectedText = sorted
      .map((section) => section.final_text ?? section.corrected_text ?? section.original_text)
      .join('\n\n');

    const client = getAdminClient();
    const { error: updateError } = await client
      .from('sections')
      .update({
        original_text: mergedOriginalText,
        corrected_text: mergedCorrectedText,
        final_text: null,
        change_summary: null,
        status: 'ready',
      })
      .eq('id', surviving.id);

    if (updateError) {
      serverError(res, 'Failed to update merged section.');
      return;
    }

    const { error: deleteError } = await client
      .from('sections')
      .delete()
      .in('id', deleteIds);

    if (deleteError) {
      serverError(res, 'Failed to remove merged sections.');
      return;
    }

    const resequencedSections = await resequenceSessionSections(sessionId);
    const aliasBySectionId = new Map<string, string>();

    for (const section of sorted) {
      aliasBySectionId.set(section.id, surviving.id);
    }

    await remapReferenceLinks(previousSections, resequencedSections, aliasBySectionId);
    const finalSections = await fetchOrderedSessionSections(sessionId);

    res.status(200).json({
      success: true,
      data: {
        merged_section_id: surviving.id,
        sections: finalSections,
      },
    });
  } catch (error) {
    serverError(res, error instanceof Error ? error.message : 'Failed to merge sections.');
  }
});

router.post('/sections/:id/suggest-references', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sectionId = typeof req.params.id === 'string' ? req.params.id : '';

  if (!authToken || !authenticatedUser) { unauthorized(res); return; }
  if (!isUuid(sectionId)) { badRequest(res, 'Invalid section id format.'); return; }

  const supabase = createUserScopedSupabaseClient(authToken);
  const { data: section, error: fetchError } = await supabase
    .from('sections')
    .select('id, session_id')
    .eq('id', sectionId)
    .single();

  if (fetchError || !section) { notFound(res); return; }

  const ownerId = await getSessionOwnerId((section as { session_id: string }).session_id);
  if (!ownerId || ownerId !== authenticatedUser.id) { forbidden(res); return; }

  try {
    const positions = await suggestReferencesForSection(sectionId, (section as { session_id: string }).session_id);
    res.status(200).json({ success: true, data: { suggested_positions: positions } });
  } catch (error) {
    if (error instanceof NoReferencesSectionError) { badRequest(res, error.message); return; }
    serverError(res, error instanceof Error ? error.message : 'AI suggestion failed.');
  }
});

router.post('/sessions/:sessionId/match-references', async (req: Request, res: Response) => {
  const authToken = getVerifiedAccessToken(res);
  const authenticatedUser = getAuthenticatedUser(res);
  const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : '';

  if (!authToken || !authenticatedUser) {
    unauthorized(res);
    return;
  }

  if (!isUuid(sessionId)) {
    badRequest(res, 'Invalid session id format.');
    return;
  }

  const ownerId = await getSessionOwnerId(sessionId);
  if (!ownerId) {
    notFound(res);
    return;
  }

  if (ownerId !== authenticatedUser.id) {
    forbidden(res);
    return;
  }

  const rawStyle = (req.body as Record<string, unknown>)?.reference_style;
  const referenceStyle = ['apa', 'mla', 'chicago', 'ieee', 'vancouver'].includes(rawStyle as string)
    ? (rawStyle as 'apa' | 'mla' | 'chicago' | 'ieee' | 'vancouver')
    : 'apa';

  try {
    const result = await matchReferencesToSections(sessionId, referenceStyle);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof NoReferencesSectionError) {
      badRequest(res, error.message);
      return;
    }
    serverError(res, error instanceof Error ? error.message : 'Reference matching failed.');
  }
});

router.post('/sections/:id/humanize', async (req: Request, res: Response) => {
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
  const { data: section, error: fetchError } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
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

  const typedSection = section as SectionRow;
  const aiScore = typedSection.ai_score;

  if (aiScore === null || aiScore < 61) {
    badRequest(res, 'Humanize is only available for sections with an AI score of 61 or above.');
    return;
  }

  const textToHumanize = typedSection.corrected_text ?? typedSection.original_text;

  let humanizedText: string;
  try {
    humanizedText = await humanizeSection(textToHumanize, aiScore);
  } catch (aiError) {
    console.error('humanizeSection failed', {
      sectionId,
      error: aiError instanceof Error ? aiError.message : 'Unknown error',
    });
    serverError(res, 'Humanization failed. Please try again.');
    return;
  }

  const { data: updatedSection, error: updateError } = await supabase
    .from('sections')
    .update({ humanized_text: humanizedText })
    .eq('id', sectionId)
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
    )
    .maybeSingle();

  if (updateError || !updatedSection) {
    serverError(res, 'Failed to save humanized text.');
    return;
  }

  res.status(200).json({
    success: true,
    data: updatedSection,
  });
});

// POST /api/sections/:id/reformat
router.post('/sections/:id/reformat', async (req: Request, res: Response) => {
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
  const format = typeof body?.format === 'string' ? (body.format as ReformatType) : null;
  const VALID_FORMATS: ReformatType[] = ['table', 'bullet_list', 'questionnaire', 'summary_box'];

  if (!format || !VALID_FORMATS.includes(format)) {
    badRequest(res, 'format is required');
    return;
  }

  const supabase = createUserScopedSupabaseClient(authToken);
  const { data: section, error: fetchError } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, status, created_at, updated_at',
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

  const typedSection = section as SectionRow;
  const sourceText = typedSection.corrected_text ?? typedSection.original_text;

  let reformatted: string;
  try {
    reformatted = await reformatSection(sourceText, format);
  } catch (aiError) {
    console.error('reformatSection failed', {
      sectionId,
      format,
      error: aiError instanceof Error ? aiError.message : 'Unknown error',
    });
    serverError(res, 'Reformat failed. Please try again.');
    return;
  }

  const { data: updatedSection, error: updateError } = await supabase
    .from('sections')
    .update({ reformatted_text: reformatted, reformat_type: format })
    .eq('id', sectionId)
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, ai_score, humanized_text, reformatted_text, reformat_type, status, created_at, updated_at',
    )
    .maybeSingle();

  if (updateError || !updatedSection) {
    serverError(res, 'Failed to save reformatted text.');
    return;
  }

  res.status(200).json({
    success: true,
    data: updatedSection,
  });
});

// POST /api/sessions/:id/sections/suggest
router.post('/sessions/:id/sections/suggest', async (req: Request, res: Response) => {
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

  const body = req.body as Record<string, unknown> | undefined;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';

  if (title.length === 0) {
    badRequest(res, 'title is required');
    return;
  }

  const ownerId = await getSessionOwnerId(sessionId);
  if (!ownerId) {
    notFound(res);
    return;
  }

  if (ownerId !== authenticatedUser.id) {
    forbidden(res);
    return;
  }

  const sections = await fetchOrderedSessionSections(sessionId);

  try {
    const suggestion = await suggestSection(sessionId, title, sections);
    res.status(200).json({ success: true, data: suggestion });
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Suggestion failed');
  }
});

// POST /api/sessions/:id/sections/insert
router.post('/sessions/:id/sections/insert', async (req: Request, res: Response) => {
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

  const body = req.body as Record<string, unknown> | undefined;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const rawPosition = body?.position;
  const content = typeof body?.content === 'string' ? body.content : '';

  if (title.length === 0) {
    badRequest(res, 'title is required');
    return;
  }

  const position =
    typeof rawPosition === 'number' && Number.isFinite(rawPosition) && rawPosition >= 0
      ? Math.trunc(rawPosition)
      : 0;

  const ownerId = await getSessionOwnerId(sessionId);
  if (!ownerId) {
    notFound(res);
    return;
  }

  if (ownerId !== authenticatedUser.id) {
    forbidden(res);
    return;
  }

  try {
    await insertSection(sessionId, title, position, content);
    const finalSections = await fetchOrderedSessionSections(sessionId);
    res.status(200).json({ success: true, data: { session_id: sessionId, sections: finalSections } });
  } catch (err) {
    serverError(res, err instanceof Error ? err.message : 'Insert failed');
  }
});

export { router as sectionsRouter };
