import OpenAI from 'openai';
import { createAdminSupabaseClient } from '../lib/supabase.js';

const TONE_TIMEOUT_MS = 60_000;
const SECTION_CHAR_LIMIT = 500;

export interface SectionToneResult {
  section_id: string;
  position: number;
  tone_label: string;
  tone_score: number;
  is_outlier: boolean;
}

export interface ToneCheckResult {
  consistency_score: number;
  dominant_tone: string;
  sections: SectionToneResult[];
}

interface SectionInput {
  id: string;
  position: number;
  corrected_text: string | null;
  original_text: string;
}

interface RawSectionTone {
  section_id?: unknown;
  position?: unknown;
  tone_label?: unknown;
  tone_score?: unknown;
  is_outlier?: unknown;
}

interface RawToneResponse {
  dominant_tone?: unknown;
  consistency_score?: unknown;
  sections?: unknown;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
}

function buildTonePrompt(
  sectionTexts: Array<{ id: string; position: number; text: string }>,
): string {
  return `You are a professional document editor analyzing writing tone consistency.

Analyze the tone of each section below and return a JSON object only — no markdown.

Sections:
${JSON.stringify(sectionTexts, null, 2)}

Return exactly this JSON structure:
{
  "dominant_tone": "<the most common tone across all sections>",
  "consistency_score": <integer 0-100, where 100 = perfectly consistent tone throughout>,
  "sections": [
    {
      "section_id": "<id from input>",
      "position": <position from input>,
      "tone_label": "<one of: formal | informal | neutral | persuasive | academic | conversational | technical>",
      "tone_score": <integer 0-100, alignment to dominant_tone>,
      "is_outlier": <boolean — true if tone_score < 50>
    }
  ]
}`;
}

function parseToneResponse(content: string | null | undefined): ToneCheckResult {
  if (!content) {
    throw new Error('OpenAI returned an empty response for tone check');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI tone response was not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OpenAI tone response must be a JSON object');
  }

  const candidate = parsed as RawToneResponse;

  if (
    typeof candidate.dominant_tone !== 'string' ||
    typeof candidate.consistency_score !== 'number' ||
    !Array.isArray(candidate.sections)
  ) {
    throw new Error('OpenAI tone response is missing required fields');
  }

  const sections: SectionToneResult[] = candidate.sections
    .filter((s: unknown): s is RawSectionTone => typeof s === 'object' && s !== null)
    .map((s: RawSectionTone) => ({
      section_id: typeof s.section_id === 'string' ? s.section_id : '',
      position: typeof s.position === 'number' ? s.position : 0,
      tone_label: typeof s.tone_label === 'string' ? s.tone_label : 'neutral',
      tone_score: typeof s.tone_score === 'number' ? Math.max(0, Math.min(100, Math.round(s.tone_score))) : 0,
      is_outlier: typeof s.is_outlier === 'boolean' ? s.is_outlier : false,
    }));

  return {
    dominant_tone: candidate.dominant_tone,
    consistency_score: Math.max(0, Math.min(100, Math.round(candidate.consistency_score))),
    sections,
  };
}

export async function runToneCheck(
  sessionId: string,
  sections: SectionInput[],
): Promise<ToneCheckResult> {
  const adminSupabase = createAdminSupabaseClient();

  const { data: session, error: fetchError } = await adminSupabase
    .from('sessions')
    .select('tone_consistency_score, tone_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch session: ${fetchError.message}`);
  }

  if (session.tone_report !== null && session.tone_consistency_score !== null) {
    return session.tone_report as ToneCheckResult;
  }

  const sectionTexts = [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      position: s.position,
      text: (s.corrected_text ?? s.original_text).slice(0, SECTION_CHAR_LIMIT),
    }));

  const prompt = buildTonePrompt(sectionTexts);
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, TONE_TIMEOUT_MS);

  let result: ToneCheckResult;
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
    result = parseToneResponse(raw);
  } finally {
    clearTimeout(timeoutHandle);
  }

  for (const s of result.sections) {
    await adminSupabase
      .from('sections')
      .update({ tone_label: s.tone_label, tone_score: s.tone_score })
      .eq('id', s.section_id);
  }

  const { error: updateError } = await adminSupabase
    .from('sessions')
    .update({
      tone_consistency_score: result.consistency_score,
      tone_report: result,
    })
    .eq('id', sessionId);

  if (updateError) {
    throw new Error(`Failed to cache tone report: ${updateError.message}`);
  }

  return result;
}
