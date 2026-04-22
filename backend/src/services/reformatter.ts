import OpenAI from 'openai';

export type ReformatType = 'table' | 'bullet_list' | 'questionnaire' | 'summary_box';

const OPENAI_MODEL = 'gpt-4o';

const FORMAT_INSTRUCTIONS: Record<ReformatType, string> = {
  table:
    'Convert this text into a Markdown table. Extract key data points as rows and columns. Preserve all information.',
  bullet_list:
    'Convert this text into a clear Markdown bullet list. Each bullet = one distinct point. Preserve all information.',
  questionnaire:
    'Convert this text into a Q&A questionnaire format. Generate questions from the content and provide the answers from the text.',
  summary_box:
    'Rewrite this text as a concise summary box: a bold title line followed by 3–5 key takeaways as bullet points.',
};

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openAIClient) return openAIClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}

/**
 * Reformat a section's text into the requested format using GPT-4o.
 * Returns the reformatted text only (no markdown wrapper).
 */
export async function reformatSection(text: string, format: ReformatType): Promise<string> {
  const client = getOpenAIClient();
  const instruction = FORMAT_INSTRUCTIONS[format];

  const prompt = `${instruction}

Text to reformat:
"""
${text.slice(0, 6000)}
"""

Return the reformatted text only — no preamble, no explanation, no code fences.`;

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  return completion.choices[0]?.message?.content?.trim() ?? '';
}
