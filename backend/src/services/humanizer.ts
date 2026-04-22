import OpenAI from 'openai';
import { computeHeuristicScore } from './ai-scorer.js';

const OPENAI_MODEL = 'gpt-4o';
const HUMANIZE_TIMEOUT_MS = 60_000;

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openAIClient) return openAIClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}

export async function humanizeSection(text: string, aiScore: number): Promise<string> {
  const heuristicScore = computeHeuristicScore(text);
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), HUMANIZE_TIMEOUT_MS);

  const systemPrompt = [
    'You are a skilled editor who rewrites AI-generated text to sound authentically human.',
    'Rewrite the provided text by:',
    '- Varying sentence length (mix short and long sentences)',
    '- Adding natural burstiness (some sentences very short, others longer)',
    '- Enriching vocabulary with synonyms and less common word choices',
    '- Adding personal, specific, or concrete details where natural',
    '- Reducing overly formal or generic transitions',
    '- Preserving the original meaning, domain-specific terminology, and tone',
    'Return the rewritten text only, with no explanation or preamble.',
  ].join(' ');

  try {
    const completion = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0.8,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `AI score: ${aiScore}/100. Heuristic score: ${heuristicScore}/100.\n\nText to humanize:\n${text}`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const content = completion.choices[0]?.message?.content ?? '';
    if (!content.trim()) {
      throw new Error('OpenAI returned empty humanization');
    }
    return content.trim();
  } finally {
    clearTimeout(timeoutHandle);
  }
}
