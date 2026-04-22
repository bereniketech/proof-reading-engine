import { readFile } from 'node:fs/promises';
import pdf from 'pdf-parse';
import { segmentWithAI } from './ai-segmenter.js';
import type { Section } from './types.js';

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

const KNOWN_SECTION_HEADINGS = new Set([
  'abstract', 'introduction', 'background', 'literature review', 'related work',
  'methodology', 'method', 'methods', 'materials and methods', 'research design',
  'participants', 'procedure', 'instrument', 'measures', 'data analysis',
  'results', 'findings', 'discussion', 'conclusion', 'conclusions',
  'implications', 'limitations', 'future work', 'recommendations',
  'references', 'bibliography', 'works cited', 'acknowledgements', 'acknowledgments',
  'appendix', 'appendices', 'supplementary material',
]);

const ARTICLES_PREPS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is', 'it',
  'vs', 'via', 'per',
]);

function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/);
  if (words.length < 2) {
    return false;
  }

  let capitalizedContent = 0;
  let contentWords = 0;

  for (const [index, word] of words.entries()) {
    const clean = word.replace(/[^A-Za-z]/g, '');
    if (!clean) {
      continue;
    }

    const lower = clean.toLowerCase();
    const isContentWord = index === 0 || index === words.length - 1 || !ARTICLES_PREPS.has(lower);

    if (isContentWord) {
      contentWords += 1;
      if (/^[A-Z]/.test(clean)) {
        capitalizedContent += 1;
      }
    }
  }

  return contentWords > 0 && capitalizedContent / contentWords >= 0.75;
}

function isLikelyHeading(text: string): boolean {
  if (text.length === 0 || text.length > 120) {
    return false;
  }

  const allCaps = /^[A-Z0-9\s.,:;()\-/'"&]+$/.test(text) && /[A-Z]/.test(text);
  if (allCaps) {
    return true;
  }

  if (/^\d+(\.\d+)*\s+[A-Z].{0,90}$/.test(text)) {
    return true;
  }

  // Match known academic section headings (possibly with a subtitle after a colon/dash/paren)
  const normalized = (text.split(/[:(–-]/)[0] ?? '').trim().toLowerCase();
  if (KNOWN_SECTION_HEADINGS.has(normalized)) {
    return true;
  }

  // Title-case line with no terminal sentence punctuation — likely a document title or section heading
  if (!text.endsWith('.') && !text.endsWith('?') && !text.endsWith('!') && isTitleCase(text)) {
    return true;
  }

  return false;
}

function extractRawText(pdfText: string): string {
  return pdfText
    .split(/\r?\n/)
    .map((line: string) => normalizeLine(line))
    .join('\n');
}

export async function parsePdf(filePath: string): Promise<Section[]> {
  const buffer = await readFile(filePath);
  const parsed = await pdf(buffer);
  const rawText = extractRawText(parsed.text);

  try {
    return await segmentWithAI(rawText);
  } catch (err) {
    console.warn('[parsePdf] AI segmentation failed, falling back to heuristics:', err);
  }

  // ── Heuristic fallback ────────────────────────────────────────────────────
  const lines = rawText.split('\n');

  const sections: Section[] = [];
  let position = 0;
  let paragraphBuffer: string[] = [];

  const flushParagraphBuffer = (): void => {
    const paragraphText = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (!paragraphText) {
      paragraphBuffer = [];
      return;
    }

    sections.push({
      position,
      section_type: 'paragraph',
      heading_level: null,
      original_text: paragraphText,
    });
    position += 1;
    paragraphBuffer = [];
  };

  for (const line of lines) {
    if (!line) {
      flushParagraphBuffer();
      continue;
    }

    if (isLikelyHeading(line)) {
      flushParagraphBuffer();

      // Merge into the previous heading only when it looks like a wrapped title
      // line: previous heading has no terminal punctuation AND is not a known
      // standalone section heading (e.g. "Abstract", "Introduction").
      const prev = sections.at(-1);
      const prevNormalized = prev ? (prev.original_text.split(/[:(–-]/)[0] ?? '').trim().toLowerCase() : '';
      const prevIsKnownHeading = KNOWN_SECTION_HEADINGS.has(prevNormalized);
      if (
        prev &&
        prev.section_type === 'heading' &&
        !prevIsKnownHeading &&
        !/[.!?]$/.test(prev.original_text)
      ) {
        prev.original_text = `${prev.original_text} ${line}`;
      } else {
        sections.push({
          position,
          section_type: 'heading',
          heading_level: null,
          original_text: line,
        });
        position += 1;
      }
      continue;
    }

    paragraphBuffer = [...paragraphBuffer, line];
  }

  flushParagraphBuffer();
  return sections;
}
