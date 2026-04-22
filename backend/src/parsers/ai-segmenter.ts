import { getLLMProvider } from '../services/llm-provider.js';
import type { Section } from './types.js';

const KNOWN_SECTION_LABELS = new Set([
  'abstract', 'introduction', 'background', 'literature review', 'related work',
  'methodology', 'method', 'methods', 'materials and methods', 'research design',
  'participants', 'procedure', 'instrument', 'measures', 'data analysis',
  'results', 'findings', 'discussion', 'conclusion', 'conclusions',
  'implications', 'limitations', 'future work', 'recommendations',
  'references', 'bibliography', 'works cited', 'acknowledgements', 'acknowledgments',
  'appendix', 'appendices', 'supplementary material', 'objectives of the study',
]);

const SYSTEM_PROMPT = `You are a document structure analyser.
Given raw text extracted from a document (PDF or plain text), split it into an ordered list of sections.
Each section is either a "heading" (document title, section label, subtitle) or a "paragraph" (body content, lists, references, captions, etc.).

Rules:
1. TITLE WRAPPING — A document title that wraps across multiple lines is ONE heading. Join the lines into a single heading item.
2. BLANK LINE = BOUNDARY — A blank line always separates two distinct sections. Never merge content across a blank line.
3. NO MERGING OF DISTINCT HEADINGS — Two different section labels must be two separate heading items.
4. PRESERVE ALL TEXT — Do not paraphrase, correct, or omit any content from the input.
5. OUTPUT FORMAT — Return ONLY a valid JSON array, no markdown fences, no extra keys:
   [{"section_type":"heading"|"paragraph","text":"..."},...]`;

/**
 * Ensure every known section label is on its own line with a blank line before
 * it, so the LLM always sees a clear structural boundary.
 *
 * Handles two cases:
 *  1. Label is already its own line — just insert blank line before it.
 *  2. Label is glued at the END of a preceding line with no newline
 *     (e.g. pdf-parse gives "...Questionnaire Study Abstract") — split there.
 *     We only do this for single-word labels to avoid false positives inside
 *     body sentences.
 */
function preProcessText(text: string): string {
  // Sort longest-first so multi-word labels match before their sub-words.
  const sortedLabels = [...KNOWN_SECTION_LABELS].sort((a, b) => b.length - a.length);
  const escaped = sortedLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Split a known label off the end of the line it is glued to.
  // Uses the `m` flag so ^ and $ match per-line, making it reliable regardless
  // of whether the label is mid-string or at the very end of the full text.
  // The label must be preceded by a non-whitespace char to avoid splitting
  // lines that ARE already just the label on its own.
  const endGlueRe = new RegExp(`(\\S)[ \\t]+(${escaped.join('|')})$`, 'gim');
  const split = text.replace(endGlueRe, '$1\n$2');

  // Ensure a blank line precedes every line that is exactly a known label.
  const lines = split.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (KNOWN_SECTION_LABELS.has(trimmed) && out.length > 0 && out.at(-1) !== '') {
      out.push('');
    }
    out.push(line);
  }

  return out.join('\n');
}

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
      { role: 'user', content: preProcessText(rawText) },
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
