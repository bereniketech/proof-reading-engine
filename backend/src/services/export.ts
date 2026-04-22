import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import { createAdminSupabaseClient } from '../lib/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/services/ (dev/tsx) and dist/services/ (prod build)
const FONT_DIR = path.resolve(__dirname, '../../fonts');
export const REFERENCE_HEADING_TEXTS = new Set(['references', 'bibliography', 'works cited']);

type ReferenceStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'vancouver';

interface ExportOptions {
  referenceStyle?: ReferenceStyle;
}

export interface ReferenceSection {
  position: number;
  text: string;
}

export interface Section {
  id: string;
  session_id: string;
  position: number;
  section_type: string;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
  reference_text: string | null;
  final_text: string | null;
  change_summary: string | null;
  status: 'pending' | 'ready' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

interface Session {
  id: string;
  user_id: string;
  filename: string;
  file_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function getSectionText(section: Section): string {
  const textToUse =
    section.status === 'rejected'
      ? section.original_text
      : section.final_text || section.corrected_text || section.original_text;

  return textToUse.trim();
}

export function findReferencesHeadingIndex(sections: Section[]): number {
  return sections.findIndex((section) => {
    if (section.section_type !== 'heading') {
      return false;
    }

    // Strip subtitles after colon, dash, or opening paren before matching
    const baseText = (normalizeText(getSectionText(section)).split(/[:(–-]/)[0] ?? '').trim();
    return REFERENCE_HEADING_TEXTS.has(baseText);
  });
}

export function extractReferenceSections(sections: Section[]): { headingPosition: number | null; entries: ReferenceSection[] } {
  const headingIndex = findReferencesHeadingIndex(sections);
  if (headingIndex < 0) {
    return {
      headingPosition: null,
      entries: [],
    };
  }

  const heading = sections[headingIndex];
  if (!heading) {
    return {
      headingPosition: null,
      entries: [],
    };
  }

  const entries: ReferenceSection[] = [];

  for (let i = headingIndex + 1; i < sections.length; i += 1) {
    const section = sections[i];
    if (!section) {
      continue;
    }

    if (section.section_type === 'heading') {
      break;
    }

    const text = getSectionText(section);
    if (!text) {
      continue;
    }

    entries.push({
      position: section.position,
      text,
    });
  }

  return {
    headingPosition: heading.position,
    entries,
  };
}

function parseLinkedReferencePositions(referenceText: string | null): number[] {
  if (!referenceText) {
    return [];
  }

  try {
    const parsed = JSON.parse(referenceText) as { linked_reference_positions?: unknown };
    if (!Array.isArray(parsed.linked_reference_positions)) {
      return [];
    }

    const uniquePositions = new Set<number>();
    for (const rawPosition of parsed.linked_reference_positions) {
      if (typeof rawPosition !== 'number' || !Number.isFinite(rawPosition)) {
        continue;
      }

      uniquePositions.add(Math.trunc(rawPosition));
    }

    return Array.from(uniquePositions.values());
  } catch {
    return [];
  }
}

function buildReferenceOrdinalLookup(entries: ReferenceSection[]): Map<number, number> {
  const lookup = new Map<number, number>();

  entries.forEach((entry, index) => {
    lookup.set(entry.position, index + 1);
  });

  return lookup;
}

function createCitationSuffix(referenceStyle: ReferenceStyle, ordinals: number[]): string {
  if (ordinals.length === 0) {
    return '';
  }

  const sortedUnique = Array.from(new Set(ordinals)).sort((a, b) => a - b);

  if (referenceStyle === 'ieee') {
    return sortedUnique.map((ordinal) => `[${ordinal}]`).join(' ');
  }

  if (referenceStyle === 'vancouver') {
    return `(${sortedUnique.join(', ')})`;
  }

  return `(${sortedUnique.map((ordinal) => `Ref ${ordinal}`).join('; ')})`;
}

function formatReferenceEntry(referenceStyle: ReferenceStyle, ordinal: number, text: string): string {
  if (referenceStyle === 'ieee') {
    return `[${ordinal}] ${text}`;
  }

  if (referenceStyle === 'vancouver') {
    return `${ordinal}. ${text}`;
  }

  return `${ordinal}. ${text}`;
}

async function getSessionWithSections(
  sessionId: string,
): Promise<{ session: Session; sections: Section[] } | null> {
  const adminClient = createAdminSupabaseClient();

  const { data: session, error: sessionError } = await adminClient
    .from('sessions')
    .select('id, user_id, filename, file_type, status, created_at, updated_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return null;
  }

  const { data: sections, error: sectionsError } = await adminClient
    .from('sections')
    .select(
      'id, session_id, position, section_type, heading_level, original_text, corrected_text, reference_text, final_text, change_summary, status, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError || !sections) {
    return null;
  }

  return { session, sections };
}

function getFontSizeForHeadingLevel(level: number | null): number {
  if (!level || level <= 1) return 16;
  if (level === 2) return 14;
  if (level === 3) return 12;
  return 11;
}

function validateExportReadiness(sections: Section[]): { valid: boolean; error?: string } {
  const pendingSections = sections.filter((s) => s.status === 'pending');
  if (pendingSections.length > 0) {
    return {
      valid: false,
      error: `Cannot export: ${pendingSections.length} section(s) still pending proofreading`,
    };
  }
  return { valid: true };
}

async function loadFontBytes(filename: string): Promise<Uint8Array> {
  return readFile(path.join(FONT_DIR, filename));
}

async function generatePdfBuffer(_session: Session, sections: Section[], options: ExportOptions): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  let page = pdfDoc.addPage([612, 792]); // Standard 8.5" x 11" letter
  const referenceStyle = options.referenceStyle ?? 'apa';

  const margins = { top: 72, bottom: 72, left: 72, right: 72 }; // 1" margins
  const pageWidth = 612 - margins.left - margins.right;
  const pageHeight = 792 - margins.top - margins.bottom;
  const lineHeight = 1.15;
  const paragraphSpacing = 12;

  let currentY = margins.top;

  let font: PDFFont;

  try {
    const regularBytes = await loadFontBytes('NotoSans-Regular.ttf');
    font = await pdfDoc.embedFont(regularBytes);
  } catch {
    // Fallback to built-in font if bundled font unavailable (Latin-only)
    font = await pdfDoc.embedFont('Helvetica');
  }

  // Use the same Unicode font for headings; differentiate by size only
  const boldFont = font;

  const extractedReferences = extractReferenceSections(sections);
  const referenceEntries = extractedReferences.entries;
  const referenceOrdinalLookup = buildReferenceOrdinalLookup(referenceEntries);
  const referencePositions = new Set(referenceEntries.map((entry) => entry.position));
  const referencesHeadingPosition = extractedReferences.headingPosition;

  function getWrappedLines(text: string, fontSize: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  function checkPageBreak(requiredHeight: number): void {
    if (currentY + requiredHeight > margins.top + pageHeight) {
      page = pdfDoc.addPage([612, 792]);
      currentY = margins.top;
    }
  }

  for (const section of sections) {
    if (referencesHeadingPosition !== null && section.position === referencesHeadingPosition) {
      continue;
    }

    if (referencePositions.has(section.position)) {
      continue;
    }

    const textToUse = getSectionText(section);

    const content: Array<{ type: 'heading' | 'paragraph'; text: string }> = [];

    if (section.section_type === 'heading' && section.heading_level !== null) {
      content.push({ type: 'heading', text: textToUse });
    } else if (textToUse) {
      let paragraphText = textToUse;
      const linkedPositions = parseLinkedReferencePositions(section.reference_text);
      const linkedOrdinals = linkedPositions
        .map((position) => referenceOrdinalLookup.get(position))
        .filter((ordinal): ordinal is number => typeof ordinal === 'number');
      const citationSuffix = createCitationSuffix(referenceStyle, linkedOrdinals);

      if (citationSuffix.length > 0) {
        paragraphText = `${paragraphText} ${citationSuffix}`;
      }

      content.push({ type: 'paragraph', text: paragraphText });
    }

    for (const item of content) {
      if (item.type === 'heading') {
        const fontSize = getFontSizeForHeadingLevel(section.heading_level);
        const lines = getWrappedLines(item.text, fontSize, pageWidth);
        const estimatedHeight = lines.length * fontSize * lineHeight + paragraphSpacing;

        checkPageBreak(estimatedHeight);

        for (const line of lines) {
          page.drawText(line, {
            x: margins.left,
            y: 792 - currentY - fontSize,
            size: fontSize,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          currentY += fontSize * lineHeight;
        }
        currentY += paragraphSpacing;
      } else {
        const fontSize = 11;
        const lines = getWrappedLines(item.text, fontSize, pageWidth);
        const estimatedHeight = lines.length * fontSize * lineHeight + paragraphSpacing;

        checkPageBreak(estimatedHeight);

        for (const line of lines) {
          page.drawText(line, {
            x: margins.left,
            y: 792 - currentY - fontSize,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
          currentY += fontSize * lineHeight;
        }
        currentY += paragraphSpacing;
      }
    }
  }

  if (referenceEntries.length > 0) {
    const headingText = 'References';
    const headingFontSize = 14;
    const headingLines = getWrappedLines(headingText, headingFontSize, pageWidth);
    const headingHeight = headingLines.length * headingFontSize * lineHeight + paragraphSpacing;

    checkPageBreak(headingHeight);

    for (const line of headingLines) {
      page.drawText(line, {
        x: margins.left,
        y: 792 - currentY - headingFontSize,
        size: headingFontSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      currentY += headingFontSize * lineHeight;
    }

    currentY += paragraphSpacing;

    for (const entry of referenceEntries) {
      const ordinal = referenceOrdinalLookup.get(entry.position);
      if (!ordinal) {
        continue;
      }

      const formattedEntry = formatReferenceEntry(referenceStyle, ordinal, entry.text);
      const fontSize = 10;
      const lines = getWrappedLines(formattedEntry, fontSize, pageWidth);
      const estimatedHeight = lines.length * fontSize * lineHeight + 8;

      checkPageBreak(estimatedHeight);

      for (const line of lines) {
        page.drawText(line, {
          x: margins.left,
          y: 792 - currentY - fontSize,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        currentY += fontSize * lineHeight;
      }

      currentY += 8;
    }
  }

  return Buffer.from(await pdfDoc.save());
}

async function exportSession(sessionId: string, options: ExportOptions = {}): Promise<Buffer> {
  const data = await getSessionWithSections(sessionId);

  if (!data) {
    throw new Error('Session not found');
  }

  const validation = validateExportReadiness(data.sections);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid export state');
  }

  const buffer = await generatePdfBuffer(data.session, data.sections, options);
  return buffer;
}

export { exportSession };
export type { Session, ReferenceStyle, ExportOptions };
