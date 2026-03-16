import { parseDocx } from './docx.js';
import { parsePdf } from './pdf.js';
import { parseTxt } from './txt.js';
import type { Section } from './types.js';

export type ParseableFileType = 'docx' | 'pdf' | 'txt';

export async function parseDocumentByType(filePath: string, fileType: ParseableFileType): Promise<Section[]> {
  if (fileType === 'docx') {
    return parseDocx(filePath);
  }

  if (fileType === 'pdf') {
    return parsePdf(filePath);
  }

  return parseTxt(filePath);
}

export type { Section } from './types.js';
