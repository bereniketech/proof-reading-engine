import { getLLMProvider } from './llm-provider.js';

const SCORE_TIMEOUT_MS = 20_000;

function computeSentenceLengthVarianceScore(sentences: string[]): number {
  if (sentences.length < 2) return 100;
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  return Math.max(0, Math.min(100, Math.round(100 - variance)));
}

function computeBurstinessScore(sentences: string[]): number {
  if (sentences.length < 2) return 100;
  const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const variance = wordCounts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / wordCounts.length;
  return Math.max(0, Math.min(100, Math.round(100 - Math.sqrt(variance) * 5)));
}

function computeVocabularyRichnessScore(words: string[]): number {
  if (words.length === 0) return 50;
  const unique = new Set(words.map((w) => w.toLowerCase()));
  const ttr = unique.size / words.length;
  return Math.max(0, Math.min(100, Math.round((1 - ttr) * 143)));
}

function computePunctuationPatternScore(text: string): number {
  const allPunctuation = (text.match(/[.,;:!?'"()\-–—]/g) ?? []).length;
  if (allPunctuation === 0) return 50;
  const richPunctuation = (text.match(/[–—;]/g) ?? []).length;
  const ratio = richPunctuation / allPunctuation;
  return Math.max(0, Math.min(100, Math.round((1 - ratio * 10) * 100)));
}

export function computeHeuristicScore(text: string): number {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const words = text.split(/\s+/).filter(Boolean);

  const sentenceLengthVariance = computeSentenceLengthVarianceScore(sentences);
  const burstiness = computeBurstinessScore(sentences);
  const vocabularyRichness = computeVocabularyRichnessScore(words);
  const punctuationPattern = computePunctuationPatternScore(text);

  return Math.round((sentenceLengthVariance + burstiness + vocabularyRichness + punctuationPattern) / 4);
}

export interface ScoreSectionResult {
  score: number | null;
  humanizedText: string | null;
}

export async function scoreSectionWithAI(text: string, heuristicScore: number): Promise<ScoreSectionResult> {
  const llm = await getLLMProvider('scoring');
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), SCORE_TIMEOUT_MS);

  const systemPrompt = [
    'You are an AI content detector and editor.',
    'Given a text passage and its heuristic AI-likelihood score (0-100):',
    '1. Return a score integer 0-100 for how likely the text is AI-written (100=definitely AI, 0=definitely human).',
    '   Consider: uniform sentence structure, lack of personal voice, overly formal transitions, generic phrasing.',
    '2. If the score is 61 or above, also return a "humanized" field: rewrite the text to sound authentically human',
    '   by varying sentence length, adding burstiness, enriching vocabulary, preserving meaning and domain terms.',
    '   If the score is 60 or below, set "humanized" to null.',
    'Return valid JSON only: {"score": number, "humanized": string | null}',
  ].join(' ');

  try {
    const content = await llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Heuristic score: ${heuristicScore}\n\nText:\n${text}` },
      ],
      { temperature: 0.3, jsonMode: true, signal: controller.signal },
    );

    // Strip markdown code fences that some models wrap JSON in
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as { score?: unknown; humanized?: unknown };

    const score = parsed.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new Error('Invalid score from LLM');
    }

    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
    const humanized =
      typeof parsed.humanized === 'string' && parsed.humanized.trim().length > 0
        ? parsed.humanized.trim()
        : null;

    return { score: clampedScore, humanizedText: humanized };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

const MIN_WORDS_TO_SCORE = 10;

export async function scoreSection(text: string): Promise<ScoreSectionResult> {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WORDS_TO_SCORE) return { score: null, humanizedText: null };

  const heuristic = computeHeuristicScore(text);
  const { score: llmScore, humanizedText } = await scoreSectionWithAI(text, heuristic);
  if (llmScore === null) return { score: null, humanizedText: null };
  return { score: Math.round(heuristic * 0.35 + llmScore * 0.65), humanizedText };
}
