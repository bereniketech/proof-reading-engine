import OpenAI from 'openai';

const OPENAI_MODEL = 'gpt-4o';
const SCORE_TIMEOUT_MS = 20_000;

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openAIClient) return openAIClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}

function computeSentenceLengthVarianceScore(sentences: string[]): number {
  if (sentences.length < 2) return 100;
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  // Low variance → high AI score. Normalize: variance 0 = 100, variance >= 100 = 0
  return Math.max(0, Math.min(100, Math.round(100 - variance)));
}

function computeBurstinessScore(sentences: string[]): number {
  if (sentences.length < 2) return 100;
  const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const variance = wordCounts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / wordCounts.length;
  // Low variance (low burstiness) → high AI score
  return Math.max(0, Math.min(100, Math.round(100 - Math.sqrt(variance) * 5)));
}

function computeVocabularyRichnessScore(words: string[]): number {
  if (words.length === 0) return 50;
  const unique = new Set(words.map((w) => w.toLowerCase()));
  const ttr = unique.size / words.length;
  // Low TTR → high AI score. TTR of 1.0 → 0, TTR of 0.3 → 100
  const score = Math.max(0, Math.min(100, Math.round((1 - ttr) * 143)));
  return score;
}

function computePunctuationPatternScore(text: string): number {
  const allPunctuation = (text.match(/[.,;:!?'"()\-–—]/g) ?? []).length;
  if (allPunctuation === 0) return 50;
  const richPunctuation = (text.match(/[–—;]/g) ?? []).length;
  const ratio = richPunctuation / allPunctuation;
  // Low ratio of rich punctuation → high AI score
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

export async function scoreSectionWithAI(text: string, heuristicScore: number): Promise<number> {
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), SCORE_TIMEOUT_MS);

  const systemPrompt = [
    'You are an AI content detector.',
    'Given a text passage and its heuristic AI-likelihood score (0-100), return a single integer 0-100',
    'representing how likely the text was written by an AI (100 = definitely AI, 0 = definitely human).',
    'Consider: uniform sentence structure, lack of personal voice, overly formal transitions, generic phrasing.',
    'Return valid JSON only: {"score": number}',
  ].join(' ');

  try {
    const completion = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Heuristic score: ${heuristicScore}\n\nText:\n${text}`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const content = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as { score?: unknown };
    const score = parsed.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new Error('Invalid score from OpenAI');
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function scoreSection(text: string): Promise<number> {
  const heuristic = computeHeuristicScore(text);
  const gpt = await scoreSectionWithAI(text, heuristic);
  return Math.round(heuristic * 0.35 + gpt * 0.65);
}
