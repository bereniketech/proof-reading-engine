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

// ── Step 1: deterministic block splitting ────────────────────────────────────

/**
 * Split raw extracted text into blocks. Boundaries are:
 *   - One or more blank lines
 *   - A known section label glued to the end of the previous line
 *     (e.g. pdf-parse gives "...Questionnaire Study \n \nAbstract \n...")
 *
 * This runs before the LLM so the model never has to decide where one section
 * ends and the next begins — it only has to classify each block.
 */
function splitIntoBlocks(rawText: string): string[] {
  const sortedLabels = [...KNOWN_SECTION_LABELS].sort((a, b) => b.length - a.length);
  const escaped = sortedLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Insert a newline before any known label that is glued to the end of a line
  // without its own blank-line separator (handles pdf-parse line wrapping).
  const endGlueRe = new RegExp(`(\\S)[ \\t]+(${escaped.join('|')})$`, 'gim');
  const deglued = rawText.replace(endGlueRe, '$1\n$2');

  // Ensure a blank line precedes each line that is exactly a known section label
  const lines = deglued.split('\n');
  const spaced: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (KNOWN_SECTION_LABELS.has(trimmed) && spaced.length > 0 && spaced.at(-1) !== '') {
      spaced.push('');
    }
    spaced.push(line);
  }

  // Split on blank lines to get raw blocks, then normalize each block's whitespace
  const rawBlocks = spaced
    .join('\n')
    .split(/\n[ \t]*\n/)
    .map((b) => b.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Split any block that starts with a known label followed by more content
  // (e.g. "Abstract Caring for a child..." → ["Abstract", "Caring for a child..."])
  const labelStartRe = new RegExp(
    `^(${escaped.join('|')})(\\s+\\S.*)$`,
    'i',
  );
  const finalBlocks: string[] = [];
  for (const block of rawBlocks) {
    const m = labelStartRe.exec(block);
    if (m) {
      finalBlocks.push(m[1].trim());
      finalBlocks.push(m[2].trim());
    } else {
      finalBlocks.push(block);
    }
  }
  return finalBlocks;
}

// ── Step 2: LLM classification ───────────────────────────────────────────────

const CLASSIFY_SYSTEM = `You are a document structure classifier.
You will receive a JSON array of text blocks extracted from a document.
For each block, decide if it is a "heading" (document title, section label, subtitle, subheading) or a "paragraph" (body text, list items, references, captions).
Return a JSON array of the same length with objects {"section_type":"heading"|"paragraph","text":"<original text unchanged>"}.
Preserve every character of the input text exactly. Do not merge, split, reorder, or omit blocks.`;

interface RawSegment {
  section_type: 'heading' | 'paragraph';
  text: string;
}

function isRawSegment(v: unknown): v is RawSegment {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    (obj['section_type'] === 'heading' || obj['section_type'] === 'paragraph') &&
    typeof obj['text'] === 'string'
  );
}

export async function segmentWithAI(rawText: string): Promise<Section[]> {
  const blocks = splitIntoBlocks(rawText);
  if (blocks.length === 0) return [];

  const provider = await getLLMProvider('segmentation');

  const response = await provider.chat(
    [
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user', content: JSON.stringify(blocks) },
    ],
    { temperature: 0, jsonMode: true },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new Error(`AI segmenter returned non-JSON: ${response.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed) || parsed.length !== blocks.length) {
    throw new Error(
      `AI segmenter returned ${Array.isArray(parsed) ? parsed.length : 'non-array'} items for ${blocks.length} blocks`,
    );
  }

  const sections: Section[] = [];
  let position = 0;

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!isRawSegment(item)) continue;
    const text = item.text.trim();
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
