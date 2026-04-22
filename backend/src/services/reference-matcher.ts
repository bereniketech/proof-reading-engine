import OpenAI from 'openai';
import { createAdminSupabaseClient } from '../lib/supabase.js';
import {
  extractReferenceSections,
  findReferencesHeadingIndex,
  getSectionText,
  type Section,
} from './export.js';

const OPENAI_MODEL = 'gpt-4o';
const MATCHER_TIMEOUT_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 1_000;

const BODY_SECTION_TEXT_MAX = 800;
const REFERENCE_TEXT_MAX = 300;

export interface ReferenceMatchSummary {
  matchedSectionCount: number;
  totalReferencesLinked: number;
  noCitationsDetected: boolean;
}

interface GptMatchItem {
  section_id: string;
  cited_reference_positions: number[];
}

export class NoReferencesSectionError extends Error {
  constructor() {
    super('No references section found in this document.');
    this.name = 'NoReferencesSectionError';
  }
}

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openAIClient) {
    return openAIClient;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as { status?: unknown; code?: unknown; name?: unknown };
  if (err.status === 429 || err.code === 'rate_limit_exceeded') {
    return true;
  }
  return err.name === 'AbortError' || err.name === 'APIConnectionTimeoutError';
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildMatcherPrompt(
  entries: Array<{ position: number; text: string }>,
  bodySections: Section[],
): string {
  const referenceList = entries
    .map((e) => `[position=${e.position}] ${e.text.slice(0, REFERENCE_TEXT_MAX)}`)
    .join('\n');

  const sectionList = bodySections
    .map((s) => {
      const text = getSectionText(s).slice(0, BODY_SECTION_TEXT_MAX);
      return `section_id: "${s.id}"\ntext: ${JSON.stringify(text)}`;
    })
    .join('\n---\n');

  return [
    'REFERENCE LIST (use these position numbers in your output):',
    referenceList,
    '',
    'BODY SECTIONS (analyze each for in-text citation markers):',
    sectionList,
    '',
    'Return ONLY valid JSON with this exact shape:',
    '{"matches":[{"section_id":"<id>","cited_reference_positions":[<position numbers>]},...]}',
    '',
    'Rules:',
    '- Include every body section in the output, even if cited_reference_positions is empty.',
    '- Use ONLY position numbers from the reference list above.',
    '- Do not invent positions. If no citation is found, use an empty array.',
    '- Match any standard citation style: [1], (Author, Year), superscripts, et al., etc.',
  ].join('\n');
}

function parseGptOutput(content: string | null | undefined, validPositions: Set<number>): GptMatchItem[] {
  if (!content) {
    throw new Error('GPT returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('GPT response was not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('GPT response must be a JSON object');
  }

  const candidate = parsed as { matches?: unknown };
  if (!Array.isArray(candidate.matches)) {
    throw new Error('GPT response missing "matches" array');
  }

  return candidate.matches
    .filter((item): item is { section_id: string; cited_reference_positions: number[] } => {
      return (
        item !== null &&
        typeof item === 'object' &&
        typeof (item as { section_id?: unknown }).section_id === 'string' &&
        Array.isArray((item as { cited_reference_positions?: unknown }).cited_reference_positions)
      );
    })
    .map((item) => ({
      section_id: item.section_id,
      cited_reference_positions: item.cited_reference_positions.filter(
        (p): p is number => typeof p === 'number' && validPositions.has(p),
      ),
    }));
}

async function callGpt(prompt: string): Promise<string> {
  const client = getOpenAIClient();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, MATCHER_TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create(
        {
          model: OPENAI_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a citation analyst. Match body sections to the references they cite based on in-text citation markers.',
            },
            { role: 'user', content: prompt },
          ],
        },
        { signal: controller.signal },
      );

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('GPT returned an empty response');
      }
      return content;
    } catch (error: unknown) {
      lastError = error;
      if (attempt === MAX_RETRY_ATTEMPTS || !isRetryableError(error)) {
        break;
      }
      console.warn('Retrying reference matcher GPT call', { attempt: attempt + 1 });
      await delay(RETRY_DELAY_MS);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Reference matching GPT call failed${detail}`);
}

export async function suggestReferencesForSection(
  sectionId: string,
  sessionId: string,
): Promise<number[]> {
  const supabase = createAdminSupabaseClient();

  const { data: sections, error: fetchError } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (fetchError) throw new Error(`Failed to fetch sections: ${fetchError.message}`);

  const allSections = (sections ?? []) as Section[];
  const { entries } = extractReferenceSections(allSections);
  if (entries.length === 0) throw new NoReferencesSectionError();

  const targetSection = allSections.find((s) => s.id === sectionId);
  if (!targetSection) throw new Error('Section not found.');

  const validPositions = new Set(entries.map((e) => e.position));
  const prompt = buildMatcherPrompt(entries, [targetSection]);
  const rawContent = await callGpt(prompt);
  const matches = parseGptOutput(rawContent, validPositions);
  return matches.find((m) => m.section_id === sectionId)?.cited_reference_positions ?? [];
}

export async function matchReferencesToSections(sessionId: string): Promise<{
  summary: ReferenceMatchSummary;
  sections: Section[];
}> {
  const supabase = createAdminSupabaseClient();

  // 1. Fetch all sections ordered by position
  const { data: sections, error: fetchError } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch sections: ${fetchError.message}`);
  }

  const allSections = (sections ?? []) as Section[];

  // 2. Extract the references section
  const { headingPosition, entries } = extractReferenceSections(allSections);
  if (headingPosition === null) {
    throw new NoReferencesSectionError();
  }

  // 3. Build valid position set for hallucination guard
  const validPositions = new Set(entries.map((e) => e.position));

  // 4. Build body sections: exclude headings and all sections from the references heading onward
  const refHeadingIndex = findReferencesHeadingIndex(allSections);
  const bodySections = allSections.filter((s, idx) => {
    if (s.section_type === 'heading') return false;
    if (idx >= refHeadingIndex) return false;
    return true;
  });

  if (bodySections.length === 0) {
    return {
      summary: { matchedSectionCount: 0, totalReferencesLinked: 0, noCitationsDetected: true },
      sections: allSections,
    };
  }

  // 5. Build prompt, call GPT, parse result
  const prompt = buildMatcherPrompt(entries, bodySections);
  const rawContent = await callGpt(prompt);
  const matches = parseGptOutput(rawContent, validPositions);

  // Build lookup of sectionId → matched positions
  const matchMap = new Map<string, number[]>();
  for (const m of matches) {
    matchMap.set(m.section_id, m.cited_reference_positions);
  }

  // 6. Batch Supabase updates
  for (const section of bodySections) {
    const matched = matchMap.get(section.id) ?? [];
    const newReferenceText =
      matched.length > 0 ? JSON.stringify({ linked_reference_positions: matched }) : null;

    const { error: updateError } = await supabase
      .from('sections')
      .update({ reference_text: newReferenceText })
      .eq('id', section.id);

    if (updateError) {
      console.error('Failed to update reference_text for section', {
        sectionId: section.id,
        error: updateError.message,
      });
    }
  }

  // 7. Re-fetch all sections for a fresh response
  const { data: refreshed, error: refreshError } = await supabase
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (refreshError) {
    throw new Error(`Failed to re-fetch sections: ${refreshError.message}`);
  }

  const updatedSections = (refreshed ?? []) as Section[];

  // 8. Compute summary
  let matchedSectionCount = 0;
  let totalReferencesLinked = 0;

  for (const m of matches) {
    if (m.cited_reference_positions.length > 0) {
      matchedSectionCount += 1;
      totalReferencesLinked += m.cited_reference_positions.length;
    }
  }

  return {
    summary: {
      matchedSectionCount,
      totalReferencesLinked,
      noCitationsDetected: matchedSectionCount === 0,
    },
    sections: updatedSections,
  };
}
