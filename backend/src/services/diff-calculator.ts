export interface MetricComparison {
  a: number | null;
  b: number | null;
  delta: number | null;
}

export interface DiffReport {
  session_a: { id: string; filename: string; created_at: string };
  session_b: { id: string; filename: string; created_at: string };
  metrics: {
    ai_score_avg: MetricComparison;
    readability_avg: MetricComparison;
    tone_consistency: MetricComparison;
    word_count: { a: number; b: number; delta: number };
    acceptance_rate: { a: number; b: number; delta: number };
  };
}

export interface SessionRow {
  id: string;
  filename: string;
  created_at: string;
  tone_consistency_score: number | null;
}

export interface SectionRow {
  ai_score: number | null;
  corrected_text: string | null;
  original_text: string;
  status: string;
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
}

function wordCount(sections: SectionRow[]): number {
  return sections.reduce((total, s) => {
    const text = s.corrected_text ?? s.original_text;
    return total + text.split(/\s+/).filter((w) => w.length > 0).length;
  }, 0);
}

function acceptanceRate(sections: SectionRow[]): number {
  const relevant = sections.filter((s) => s.corrected_text !== null);
  if (relevant.length === 0) return 0;
  const accepted = relevant.filter((s) => s.status === 'accepted').length;
  return Math.round((accepted / relevant.length) * 100);
}

function delta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((b - a) * 10) / 10;
}

export function calculateDiff(
  sessionA: SessionRow,
  sectionsA: SectionRow[],
  sessionB: SessionRow,
  sectionsB: SectionRow[],
): DiffReport {
  const aiA = avg(sectionsA.map((s) => s.ai_score));
  const aiB = avg(sectionsB.map((s) => s.ai_score));

  const wcA = wordCount(sectionsA);
  const wcB = wordCount(sectionsB);

  const arA = acceptanceRate(sectionsA);
  const arB = acceptanceRate(sectionsB);

  const tcA = sessionA.tone_consistency_score;
  const tcB = sessionB.tone_consistency_score;

  return {
    session_a: { id: sessionA.id, filename: sessionA.filename, created_at: sessionA.created_at },
    session_b: { id: sessionB.id, filename: sessionB.filename, created_at: sessionB.created_at },
    metrics: {
      ai_score_avg: { a: aiA, b: aiB, delta: delta(aiA, aiB) },
      readability_avg: { a: null, b: null, delta: null },
      tone_consistency: { a: tcA, b: tcB, delta: delta(tcA, tcB) },
      word_count: { a: wcA, b: wcB, delta: wcB - wcA },
      acceptance_rate: { a: arA, b: arB, delta: arB - arA },
    },
  };
}
