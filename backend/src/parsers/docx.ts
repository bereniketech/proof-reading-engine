import mammoth from 'mammoth';
import type { Section } from './types.js';

const blockMatcher = /<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;

function decodeHtmlText(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function parseDocx(filePath: string): Promise<Section[]> {
  const result = await mammoth.convertToHtml({ path: filePath });
  const sections: Section[] = [];
  let position = 0;

  for (const match of result.value.matchAll(blockMatcher)) {
    const tag = match[1]?.toLowerCase();
    const text = decodeHtmlText(match[2] ?? '');

    if (!tag || !text) {
      continue;
    }

    const headingMatch = /^h([1-6])$/.exec(tag);
    sections.push({
      position,
      section_type: headingMatch ? 'heading' : 'paragraph',
      heading_level: headingMatch ? Number(headingMatch[1]) : null,
      original_text: text,
    });

    position += 1;
  }

  return sections;
}
