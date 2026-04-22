import { getLLMProvider } from '../services/llm-provider.js';
import type { Section } from './types.js';

const SYSTEM_PROMPT = `You are a document structure analyser.
Given raw text extracted from a document, split it into an ordered list of sections.
Each section is either a "heading" (title, section label, subtitle) or a "paragraph" (body content, captions, lists, references, etc.).

Rules:
- Never split a single logical heading across multiple items — if a title wraps across lines, keep it as one heading.
- Do not merge distinct section headings (e.g. "Abstract" and "Introduction" must remain separate).
- Preserve every word from the input; do not paraphrase, correct, or omit any text.
- Return ONLY a JSON array with this exact shape, no markdown fences:
  [{"section_type":"heading"|"paragraph","text":"..."},...]`;

interface RawSegment {
  section_type: 'heading' | 'paragraph';
  text: string;
}

function isRawSegment(v: unknown): v is RawSegment {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (obj['section_type'] === 'heading' || obj['section_type'] === 'paragraph') &&
    typeof obj['text'] === 'string';
}

export async function segmentWithAI(rawText: string): Promise<Section[]> {
  const provider = await getLLMProvider('segmentation');

  const response = await provider.chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: rawText },
    ],
    { temperature: 0, jsonMode: true },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new Error(`AI segmenter returned non-JSON response: ${response.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI segmenter response is not a JSON array');
  }

  const sections: Section[] = [];
  let position = 0;

  for (const item of parsed) {
    if (!isRawSegment(item)) continue;
    const text = item.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    sections.push({
      position,
      section_type: item.section_type,
      heading_level: item.section_type === 'heading' ? 1 : null,
      original_text: text,
    });
    position += 1;
  }

  return sections;
}
