import { getLLMProvider } from './llm-provider.js';
import { createAdminSupabaseClient } from '../lib/supabase.js';

const REVIEW_TIMEOUT_MS = 60_000;
const DOCUMENT_CHAR_LIMIT = 12_000;

export interface ReviewReport {
  score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

interface SectionSummary {
  position: number;
  section_type: string;
  corrected_text: string | null;
  original_text: string;
}

function buildDocumentText(sections: SectionSummary[]): string {
  return [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => s.corrected_text ?? s.original_text)
    .join('\n\n');
}

function buildReviewPrompt(documentText: string): string {
  return `You are a professional document reviewer. Analyze the following document and provide a JSON response only — no markdown, no explanation outside the JSON.

Document:
"""
${documentText.slice(0, DOCUMENT_CHAR_LIMIT)}
"""

Respond with exactly this JSON structure:
{
  "score": <integer 0-100 representing overall document quality>,
  "strengths": [<3-5 specific strengths as strings>],
  "weaknesses": [<3-5 specific weaknesses as strings>],
  "recommendations": [<3-5 actionable recommendations as strings>]
}`;
}

function parseReviewReport(content: string | null | undefined): ReviewReport {
  if (!content) {
    throw new Error('LLM returned an empty response for document review');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('LLM review response was not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM review response must be a JSON object');
  }

  const candidate = parsed as {
    score?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
    recommendations?: unknown;
  };

  if (
    typeof candidate.score !== 'number' ||
    !Array.isArray(candidate.strengths) ||
    !Array.isArray(candidate.weaknesses) ||
    !Array.isArray(candidate.recommendations)
  ) {
    throw new Error('LLM review response is missing required fields');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(candidate.score))),
    strengths: candidate.strengths.filter((s): s is string => typeof s === 'string'),
    weaknesses: candidate.weaknesses.filter((s): s is string => typeof s === 'string'),
    recommendations: candidate.recommendations.filter((s): s is string => typeof s === 'string'),
  };
}

export async function reviewDocument(
  sessionId: string,
  sections: SectionSummary[],
): Promise<ReviewReport> {
  const adminSupabase = createAdminSupabaseClient();

  const { data: session, error: fetchError } = await adminSupabase
    .from('sessions')
    .select('review_score, review_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch session: ${fetchError.message}`);
  }

  if (session.review_report !== null && session.review_score !== null) {
    return session.review_report as ReviewReport;
  }

  const documentText = buildDocumentText(sections);
  const prompt = buildReviewPrompt(documentText);

  const llm = await getLLMProvider('review');
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, REVIEW_TIMEOUT_MS);

  let report: ReviewReport;
  try {
    const raw = await llm.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, jsonMode: true, signal: controller.signal },
    );
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    report = parseReviewReport(cleaned);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const { error: updateError } = await adminSupabase
    .from('sessions')
    .update({ review_score: report.score, review_report: report })
    .eq('id', sessionId);

  if (updateError) {
    throw new Error(`Failed to cache review: ${updateError.message}`);
  }

  return report;
}
