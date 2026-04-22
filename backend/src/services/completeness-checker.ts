import OpenAI from 'openai';
import { createAdminSupabaseClient } from '../lib/supabase.js';

const COMPLETENESS_TIMEOUT_MS = 60_000;

export interface CompletenessResult {
  completeness_score: number;
  document_type: string;
  present_sections: string[];
  missing_sections: string[];
  optional_missing: string[];
}

interface SectionInput {
  position: number;
  section_type: string;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
}

interface RawCompletenessResponse {
  completeness_score?: unknown;
  present_sections?: unknown;
  missing_sections?: unknown;
  optional_missing?: unknown;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
}

function buildCompletenessPrompt(documentType: string, sectionSummary: string[]): string {
  return `You are a professional document structure analyst.

Document type: "${documentType}"
Section list (in order):
${JSON.stringify(sectionSummary, null, 2)}

Analyze which required sections for a "${documentType}" document are present and which are missing.
Return JSON only — no markdown, no explanation outside the JSON.

{
  "completeness_score": <integer 0-100>,
  "present_sections": [<titles of required sections that are present>],
  "missing_sections": [<titles of required sections that are NOT present>],
  "optional_missing": [<titles of optional sections that are NOT present>]
}`;
}

function parseCompletenessResponse(
  content: string | null | undefined,
  documentType: string,
): CompletenessResult {
  if (!content) {
    throw new Error('OpenAI returned an empty response for completeness check');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI completeness response was not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OpenAI completeness response must be a JSON object');
  }

  const candidate = parsed as RawCompletenessResponse;

  if (typeof candidate.completeness_score !== 'number') {
    throw new Error('OpenAI completeness response is missing completeness_score');
  }

  const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  };

  return {
    completeness_score: Math.max(0, Math.min(100, Math.round(candidate.completeness_score))),
    document_type: documentType,
    present_sections: toStringArray(candidate.present_sections),
    missing_sections: toStringArray(candidate.missing_sections),
    optional_missing: toStringArray(candidate.optional_missing),
  };
}

export async function checkCompleteness(
  sessionId: string,
  documentType: string,
  sections: SectionInput[],
): Promise<CompletenessResult> {
  const adminSupabase = createAdminSupabaseClient();

  const { data: session, error: fetchError } = await adminSupabase
    .from('sessions')
    .select('completeness_score, completeness_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch session: ${fetchError.message}`);
  }

  if (session.completeness_report !== null && session.completeness_score !== null) {
    return session.completeness_report as CompletenessResult;
  }

  const sectionSummary = [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const text = s.corrected_text ?? s.original_text;
      return s.section_type === 'heading'
        ? text.slice(0, 100)
        : `[paragraph: ${text.slice(0, 60)}…]`;
    });

  const prompt = buildCompletenessPrompt(documentType, sectionSummary);
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, COMPLETENESS_TIMEOUT_MS);

  let result: CompletenessResult;
  try {
    const completion = await client.chat.completions.create(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content;
    result = parseCompletenessResponse(raw, documentType);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const { error: updateError } = await adminSupabase
    .from('sessions')
    .update({
      completeness_score: result.completeness_score,
      completeness_report: result,
    })
    .eq('id', sessionId);

  if (updateError) {
    throw new Error(`Failed to cache completeness report: ${updateError.message}`);
  }

  return result;
}
