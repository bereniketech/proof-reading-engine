export function computeFKGradeLevel(text: string): number | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const sentences = cleaned.split(/[.!?]+\s*/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);

  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  if (wordCount < 10) return null;

  const syllableCount = words.reduce((total, word) => total + countSyllables(word), 0);

  const grade =
    0.39 * (wordCount / sentenceCount) +
    11.8 * (syllableCount / wordCount) -
    15.59;

  return Math.round(grade * 10) / 10;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.endsWith('e') ? w.slice(0, -1) : w;
  const vowelGroups = stripped.match(/[aeiouy]+/g);
  const count = vowelGroups ? vowelGroups.length : 1;
  return Math.max(count, 1);
}

export function fkGradeLabel(grade: number): string {
  if (grade <= 6) return 'Easy';
  if (grade <= 9) return 'Moderate';
  if (grade <= 12) return 'Difficult';
  return 'Very Difficult';
}
