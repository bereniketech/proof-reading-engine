import {
  Document,
  Paragraph,
  TextRun,
  InsertedTextRun,
  DeletedTextRun,
  Packer,
  HeadingLevel,
} from 'docx';

interface SectionData {
  position: number;
  section_type: string;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
  status: string;
}

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];

const HEADING_LEVEL_MAP: Record<number, HeadingLevelValue> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function resolveHeading(section: SectionData): HeadingLevelValue | undefined {
  if (section.section_type !== 'heading' || section.heading_level === null) {
    return undefined;
  }
  return HEADING_LEVEL_MAP[section.heading_level] ?? HeadingLevel.HEADING_2;
}

export async function buildTrackedChangesDocx(
  sections: SectionData[],
  authorName = 'AI Proofreader',
): Promise<Buffer> {
  const now = new Date().toISOString();

  const sorted = [...sections].sort((a, b) => a.position - b.position);

  const paragraphs = sorted.map((section, index): Paragraph => {
    const original = section.original_text;
    const corrected = section.corrected_text;
    const hasChange =
      corrected !== null && corrected.trim() !== original.trim();
    const heading = resolveHeading(section);

    if (!hasChange || !corrected) {
      return new Paragraph({
        heading,
        children: [new TextRun({ text: original })],
      });
    }

    return new Paragraph({
      heading,
      children: [
        new DeletedTextRun({
          id: index * 2,
          author: authorName,
          date: now,
          text: original,
        }),
        new InsertedTextRun({
          id: index * 2 + 1,
          author: authorName,
          date: now,
          text: corrected,
        }),
      ],
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
