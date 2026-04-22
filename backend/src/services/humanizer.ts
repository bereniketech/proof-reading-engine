import { getLLMProvider } from './llm-provider.js';
import { computeHeuristicScore } from './ai-scorer.js';

const HUMANIZE_TIMEOUT_MS = 60_000;

export async function humanizeSection(text: string, aiScore: number): Promise<string> {
  const heuristicScore = computeHeuristicScore(text);
  const llm = await getLLMProvider('humanization');
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
    const content = await llm.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `AI score: ${aiScore}/100. Heuristic score: ${heuristicScore}/100.\n\nText to humanize:\n${text}`,
        },
      ],
      { temperature: 0.8, signal: controller.signal },
    );

    if (!content.trim()) {
      throw new Error('LLM returned empty humanization');
    }
    return content.trim();
  } finally {
    clearTimeout(timeoutHandle);
  }
}
