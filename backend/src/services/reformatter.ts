import { getLLMProvider } from './llm-provider.js';

export type ReformatType = 'table' | 'bullet_list' | 'questionnaire' | 'summary_box';

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

export async function reformatSection(text: string, format: ReformatType): Promise<string> {
  const llm = await getLLMProvider('reformat');
  const instruction = FORMAT_INSTRUCTIONS[format];

  const prompt = `${instruction}

Text to reformat:
"""
${text.slice(0, 6000)}
"""

Return the reformatted text only — no preamble, no explanation, no code fences.`;

  const result = await llm.chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.3 },
  );

  return result.trim();
}
