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

// PDF link/citation artifacts introduced by pdf-parse: a unicode replacement
// character (U+FFFD) followed by a short word, optionally " +N".
// e.g. "...stress levels. �Springer +1" or "�PubMed"
const ARTIFACT_RE = /\s*�\S{0,30}(?:\s+\+\d+)?\s*$/g;

// Standalone artifact block: a lone word (possibly + number suffix) with no
// sentence punctuation that escaped onto its own line without the FFFD prefix.
// e.g. "Springer +1" or "PubMed" on a line by itself.
const STANDALONE_ARTIFACT_RE = /^\w{2,30}(?:\s+\+\d+)?$/;

// ── Step 1: deterministic block splitting ────────────────────────────────────

/**
 * Split raw extracted text into blocks. Boundaries are:
 *   - One or more blank lines
 *   - A known section label that sits alone on a line glued to the end of the
 *     previous line by the PDF parser (e.g. "...Questionnaire Study Abstract")
 *
 * Heuristic sub-heading detection then further splits any block whose lines
 * start with a title-case phrase (no terminal sentence punctuation, ≥ 2 words,
 * short enough to be a heading) — catching sub-headings that have no blank line
 * in the PDF source.
 *
 * This runs before the LLM so the model only has to classify, not segment.
 */

// Words that are not capitalization signals (articles, preps, conjunctions)
const NON_CONTENT_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is', 'it',
  'vs', 'via', 'per', 'with', 'from', 'into', 'onto', 'upon',
]);

function isTitleCaseHeading(text: string): boolean {
  // Must be short enough to be a heading (≤ 100 chars) and not end with sentence punctuation
  if (text.length > 100 || /[.?!]$/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length < 2) return false;

  let capitalizedContent = 0;
  let contentWords = 0;
  for (const [index, word] of words.entries()) {
    const clean = word.replace(/[^A-Za-z]/g, '');
    if (!clean) continue;
    const lower = clean.toLowerCase();
    const isContent = index === 0 || index === words.length - 1 || !NON_CONTENT_WORDS.has(lower);
    if (isContent) {
      contentWords += 1;
      if (/^[A-Z]/.test(clean)) capitalizedContent += 1;
    }
  }
  return contentWords > 0 && capitalizedContent / contentWords >= 0.75;
}

function hasBodyText(lines: string[]): boolean {
  // A group contains body text when any line is a long sentence or ends with
  // terminal punctuation — distinguishing it from a block of headings only.
  return lines.some((l) => {
    const t = l.trim();
    return t.length > 60 || /[.?!]$/.test(t);
  });
}

/**
 * Given the lines of a single blank-separated block (not yet whitespace-
 * normalized), split them further at any line that looks like a heading and
 * is immediately preceded by body text (no blank line between them in the PDF).
 * The heading line is emitted as its own single-line group.
 */
function splitLinesOnInternalHeadings(lines: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      current.push(line);
      continue;
    }

    const nonEmpty = current.filter((l) => l.trim().length > 0);

    if (isTitleCaseHeading(trimmed)) {
      if (nonEmpty.length === 0) {
        // No real content yet — this heading starts the block.
        current.push(line);
      } else if (hasBodyText(current)) {
        // Heading follows body text — split here.
        groups.push(current);
        groups.push([line]); // heading alone
        current = [];
      } else {
        // Heading follows other headings (e.g. wrapped title lines) — keep together.
        current.push(line);
      }
    } else {
      // Body text line. If the only real content so far is a single heading,
      // flush that heading as its own group before starting the body.
      if (nonEmpty.length === 1 && isTitleCaseHeading(nonEmpty[0]?.trim() ?? '')) {
        groups.push(current);
        current = [line];
      } else {
        current.push(line);
      }
    }
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

function stripArtifacts(text: string): string {
  return text.replace(ARTIFACT_RE, '').trim();
}

function splitIntoBlocks(rawText: string): string[] {
  const sortedLabels = [...KNOWN_SECTION_LABELS].sort((a, b) => b.length - a.length);
  const escaped = sortedLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Insert a newline before a known label at end-of-line ONLY when the content
  // preceding the label on that line is substantial (≥ 30 chars). This deglues
  // labels that pdf-parse wrapped onto a paragraph line, while leaving compound
  // headings like "Descriptive Findings" or "Research Design" intact.
  const endGlueRe = new RegExp(`(\\S)[ \\t]+(${escaped.join('|')})$`, 'gim');
  const deglued = rawText.replace(endGlueRe, (match, prefix, label, offset, str) => {
    const lineStart = str.lastIndexOf('\n', offset) + 1;
    const linePrefix = str.slice(lineStart, offset + prefix.length);
    if (linePrefix.trim().length >= 30) {
      return `${prefix}\n${label}`;
    }
    return match;
  });

  // Ensure a blank line precedes each line that IS EXACTLY a known section label.
  const lines = deglued.split('\n');
  const spaced: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (KNOWN_SECTION_LABELS.has(trimmed) && spaced.length > 0 && spaced.at(-1) !== '') {
      spaced.push('');
    }
    spaced.push(line);
  }

  // Split on blank lines → line groups → detect internal headings → normalize.
  const lineGroups = spaced
    .join('\n')
    .split(/\n[ \t]*\n/)
    .map((chunk) => chunk.split('\n'));

  const rawBlocks: string[] = [];
  for (const group of lineGroups) {
    const subGroups = splitLinesOnInternalHeadings(group);
    for (const sub of subGroups) {
      const normalized = sub
        .join('\n')
        .replace(/[ \t]*\n[ \t]*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalized) rawBlocks.push(normalized);
    }
  }

  // Split a block starting with a known label followed by more content, but
  // skip the split when the remainder starts lowercase (sentence continuation:
  // "Participants were recruited..." should NOT split off "Participants").
  const labelStartRe = new RegExp(`^(${escaped.join('|')})(\\s+\\S.*)$`, 'i');
  const finalBlocks: string[] = [];
  for (const block of rawBlocks) {
    const cleaned = stripArtifacts(block);
    if (!cleaned) continue;
    // Drop standalone citation link artifacts that have no FFFD prefix, e.g.
    // "Springer +1" or "PubMed" appearing alone on a line after a page-break.
    if (STANDALONE_ARTIFACT_RE.test(cleaned) && !KNOWN_SECTION_LABELS.has(cleaned.toLowerCase())) continue;

    const m = labelStartRe.exec(cleaned);
    if (m && m[1] && m[2]) {
      const rest = m[2].trim();
      const firstWord = rest.split(/\s+/)[0] ?? '';
      if (!/^[a-z]/.test(firstWord)) {
        finalBlocks.push(m[1].trim());
        finalBlocks.push(rest);
        continue;
      }
    }
    finalBlocks.push(cleaned);
  }

  // Merge orphaned continuations: a block starting with a lowercase letter,
  // colon, or semicolon is a fragment left by a label split (e.g. "include:
  // Routine screening...") or a page-break mid-sentence → append to previous.
  const merged: string[] = [];
  for (const block of finalBlocks) {
    const firstChar = block.trimStart()[0] ?? '';
    const isContinuation =
      /^[a-z]/.test(firstChar) || firstChar === ':' || firstChar === ';';
    if (isContinuation && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${block}`.replace(/\s+/g, ' ');
    } else {
      merged.push(block);
    }
  }

  return merged;
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
