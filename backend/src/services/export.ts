import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import { createAdminSupabaseClient } from '../lib/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/services/ (dev/tsx) and dist/services/ (prod build)
const FONT_DIR = path.resolve(__dirname, '../../fonts');

interface Section {
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

async function generatePdfBuffer(_session: Session, sections: Section[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  let page = pdfDoc.addPage([612, 792]); // Standard 8.5" x 11" letter

  const margins = { top: 72, bottom: 72, left: 72, right: 72 }; // 1" margins
  const pageWidth = 612 - margins.left - margins.right;
  const pageHeight = 792 - margins.top - margins.bottom;
  const lineHeight = 1.15;
  const paragraphSpacing = 12;

  let currentY = margins.top;

  let font: PDFFont;
  let boldFont: PDFFont;

  try {
    const regularBytes = await loadFontBytes('NotoSans-Regular.ttf');
    font = await pdfDoc.embedFont(regularBytes);
  } catch {
    // Fallback to built-in font if bundled font unavailable (Latin-only)
    font = await pdfDoc.embedFont('Helvetica');
  }

  // Use the same Unicode font for headings; differentiate by size only
  boldFont = font;

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
    const textToUse = section.status === 'rejected' ? section.original_text : section.final_text || section.corrected_text || section.original_text;

    let content: { type: 'heading' | 'paragraph'; text: string }[] = [];

    if (section.section_type === 'heading' && section.heading_level !== null) {
      content.push({ type: 'heading', text: textToUse });
    } else if (textToUse) {
      content.push({ type: 'paragraph', text: textToUse });
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

  return Buffer.from(await pdfDoc.save());
}

async function exportSession(sessionId: string): Promise<Buffer> {
  const data = await getSessionWithSections(sessionId);

  if (!data) {
    throw new Error('Session not found');
  }

  const validation = validateExportReadiness(data.sections);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid export state');
  }

  const buffer = await generatePdfBuffer(data.session, data.sections);
  return buffer;
}

export { exportSession };
export type { Session, Section };
