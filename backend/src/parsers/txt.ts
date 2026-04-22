import { readFile } from 'node:fs/promises';
import { segmentWithAI } from './ai-segmenter.js';
import type { Section } from './types.js';

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isAllCapsHeading(text: string): boolean {
  if (text.length === 0 || text.length > 120) {
    return false;
  }

  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) {
    return false;
  }

  return letters === letters.toUpperCase();
}

export async function parseTxt(filePath: string): Promise<Section[]> {
  const content = await readFile(filePath, 'utf8');

  try {
    return await segmentWithAI(content);
  } catch (err) {
    console.warn('[parseTxt] AI segmentation failed, falling back to heuristics:', err);
  }

  // ── Heuristic fallback ────────────────────────────────────────────────────
  const rawBlocks = content.split(/\r?\n\s*\r?\n/g);
  const sections: Section[] = [];
  let position = 0;

  for (const rawBlock of rawBlocks) {
    const text = normalizeText(rawBlock);
    if (!text) {
      continue;
    }

    const heading = isAllCapsHeading(text);
    sections.push({
      position,
      section_type: heading ? 'heading' : 'paragraph',
      heading_level: heading ? 1 : null,
      original_text: text,
    });

    position += 1;
  }

  return sections;
}
