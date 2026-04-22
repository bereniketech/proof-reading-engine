import { readFile } from 'node:fs/promises';
import pdf from 'pdf-parse';
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
  return KNOWN_SECTION_HEADINGS.has(normalized);
}

export async function parsePdf(filePath: string): Promise<Section[]> {
  const buffer = await readFile(filePath);
  const parsed = await pdf(buffer);

  const lines = parsed.text
    .split(/\r?\n/)
    .map((line: string) => normalizeLine(line));

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
      sections.push({
        position,
        section_type: 'heading',
        heading_level: null,
        original_text: line,
      });
      position += 1;
      continue;
    }

    paragraphBuffer = [...paragraphBuffer, line];
  }

  flushParagraphBuffer();
  return sections;
}
