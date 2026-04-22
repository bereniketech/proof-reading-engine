import type { DocumentTypeValue } from './constants';

// ---------------------------------------------------------------------------
// Formula registry
// ---------------------------------------------------------------------------

export type ReadabilityFormula =
  | 'flesch_kincaid'   // default — general / consumer / journalism / marketing
  | 'gunning_fog'      // business, technical, professional docs
  | 'smog'             // medical, clinical, health — validated for healthcare text
  | 'coleman_liau'     // legal — character-based, stable on dense legal prose
  | 'ari';             // creative writing — handles unconventional punctuation well

// Map every document type to the formula best suited to its audience & style.
const FORMULA_MAP: Record<DocumentTypeValue, ReadabilityFormula> = {
  // General
  general:                'flesch_kincaid',
  // Academic & Research
  academic_paper:         'gunning_fog',
  thesis_dissertation:    'gunning_fog',
  research_proposal:      'gunning_fog',
  literature_review:      'gunning_fog',
  conference_abstract:    'gunning_fog',
  grant_proposal:         'gunning_fog',
  // Medical & Scientific
  medical_journal:        'smog',
  clinical_report:        'smog',
  patient_case_study:     'smog',
  lab_report:             'smog',
  scientific_review:      'smog',
  // Legal
  legal_document:         'coleman_liau',
  contract:               'coleman_liau',
  court_brief:            'coleman_liau',
  regulatory_filing:      'coleman_liau',
  policy_memo:            'coleman_liau',
  // Business & Professional
  business_report:        'gunning_fog',
  executive_summary:      'gunning_fog',
  business_proposal:      'gunning_fog',
  white_paper:            'gunning_fog',
  case_study:             'gunning_fog',
  press_release:          'flesch_kincaid',
  internal_memo:          'flesch_kincaid',
  // Technical
  technical_manual:       'gunning_fog',
  api_documentation:      'gunning_fog',
  user_guide:             'flesch_kincaid',
  software_spec:          'gunning_fog',
  engineering_report:     'gunning_fog',
  // Educational
  textbook_chapter:       'gunning_fog',
  lesson_plan:            'flesch_kincaid',
  student_essay:          'flesch_kincaid',
  // Journalism & Media
  news_article:           'flesch_kincaid',
  opinion_editorial:      'flesch_kincaid',
  feature_article:        'flesch_kincaid',
  blog_post:              'flesch_kincaid',
  newsletter:             'flesch_kincaid',
  // Marketing & Content
  marketing_copy:         'flesch_kincaid',
  product_description:    'flesch_kincaid',
  social_media_post:      'flesch_kincaid',
  email_correspondence:   'flesch_kincaid',
  pitch_deck_script:      'flesch_kincaid',
  // Creative Writing
  creative_writing:       'ari',
  short_story:            'ari',
  screenplay:             'ari',
  poetry:                 'ari',
  personal_essay:         'ari',
  // Government & Public Sector
  government_report:      'gunning_fog',
  environmental_impact:   'gunning_fog',
  public_comment:         'flesch_kincaid',
};

// Grade-level thresholds that define the label bands — tuned per formula and
// audience. Lower numbers = easier read for the intended audience.
interface LabelThresholds {
  easy: number;       // grade ≤ easy → "Easy"
  moderate: number;   // grade ≤ moderate → "Moderate"
  difficult: number;  // grade ≤ difficult → "Difficult", above → "Very Difficult"
}

const THRESHOLDS: Record<ReadabilityFormula, LabelThresholds> = {
  // General / journalism: grade 8 is the US newspaper standard
  flesch_kincaid: { easy: 8,  moderate: 11, difficult: 14 },
  // Business / technical: grade 12 is college-entry, acceptable for business
  gunning_fog:    { easy: 10, moderate: 13, difficult: 16 },
  // Medical: SMOG grade 10 is considered plain-language for healthcare
  smog:           { easy: 10, moderate: 13, difficult: 16 },
  // Legal: dense prose is expected; anything under 14 is accessible for legal
  coleman_liau:   { easy: 12, moderate: 16, difficult: 20 },
  // Creative: looser bands — style varies widely by intent
  ari:            { easy: 8,  moderate: 12, difficult: 16 },
};

// ---------------------------------------------------------------------------
// Shared text tokenisers
// ---------------------------------------------------------------------------

function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function tokenizeSentences(text: string): string[] {
  return text.split(/[.!?]+\s*/).filter((s) => s.trim().length > 0);
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.endsWith('e') ? w.slice(0, -1) : w;
  const vowelGroups = stripped.match(/[aeiouy]+/g);
  return Math.max(vowelGroups ? vowelGroups.length : 1, 1);
}

// A word is "complex" (polysyllabic) when it has ≥ 3 syllables.
function isComplexWord(word: string): boolean {
  return countSyllables(word) >= 3;
}

// ---------------------------------------------------------------------------
// Formula implementations — each returns a grade level (float)
// ---------------------------------------------------------------------------

// Flesch-Kincaid Grade Level
function fk(text: string): number {
  const words = tokenizeWords(text);
  const sentences = tokenizeSentences(text);
  const W = words.length;
  const S = Math.max(sentences.length, 1);
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  return 0.39 * (W / S) + 11.8 * (syllables / W) - 15.59;
}

// Gunning Fog Index
function gunningFog(text: string): number {
  const words = tokenizeWords(text);
  const sentences = tokenizeSentences(text);
  const W = words.length;
  const S = Math.max(sentences.length, 1);
  const complex = words.filter(isComplexWord).length;
  return 0.4 * (W / S + 100 * (complex / W));
}

// SMOG Grade (requires ≥ 30 sentences for accuracy; clamped gracefully below)
function smog(text: string): number {
  const words = tokenizeWords(text);
  const sentences = tokenizeSentences(text);
  const S = sentences.length;
  if (S < 3) return fk(text); // fall back for very short text
  const complex = words.filter(isComplexWord).length;
  // Scaled to any sentence count (original formula assumes exactly 30 sentences)
  const polysyllablesNormalized = complex * (30 / S);
  return 3.1291 + 1.0430 * Math.sqrt(polysyllablesNormalized);
}

// Coleman-Liau Index (character-based)
function colemanLiau(text: string): number {
  const words = tokenizeWords(text);
  const sentences = tokenizeSentences(text);
  const W = words.length;
  if (W === 0) return 0;
  const S = Math.max(sentences.length, 1);
  const letters = words.join('').replace(/[^a-zA-Z]/g, '').length;
  const L = (letters / W) * 100;   // avg letters per 100 words
  const SN = (S / W) * 100;        // avg sentences per 100 words
  return 0.0588 * L - 0.296 * SN - 15.8;
}

// Automated Readability Index
function ari(text: string): number {
  const words = tokenizeWords(text);
  const sentences = tokenizeSentences(text);
  const W = words.length;
  if (W === 0) return 0;
  const S = Math.max(sentences.length, 1);
  const chars = words.join('').replace(/[^a-zA-Z0-9]/g, '').length;
  return 4.71 * (chars / W) + 0.5 * (W / S) - 21.43;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ReadabilityResult {
  grade: number;
  label: string;
  formula: ReadabilityFormula;
  formulaLabel: string;
}

const FORMULA_LABELS: Record<ReadabilityFormula, string> = {
  flesch_kincaid: 'Flesch-Kincaid',
  gunning_fog:    'Gunning Fog',
  smog:           'SMOG',
  coleman_liau:   'Coleman-Liau',
  ari:            'ARI',
};

/**
 * Compute a readability grade for the given text using the formula appropriate
 * for the document type. Returns null when the text is too short to score.
 */
export function computeReadabilityScore(
  text: string,
  documentType: DocumentTypeValue | string = 'general',
): ReadabilityResult | null {
  const cleaned = text.trim();
  const words = tokenizeWords(cleaned);
  if (words.length < 10) return null;

  const formula: ReadabilityFormula =
    documentType in FORMULA_MAP
      ? FORMULA_MAP[documentType as DocumentTypeValue]
      : 'flesch_kincaid';

  const rawGrade = (() => {
    switch (formula) {
      case 'gunning_fog':   return gunningFog(cleaned);
      case 'smog':          return smog(cleaned);
      case 'coleman_liau':  return colemanLiau(cleaned);
      case 'ari':           return ari(cleaned);
      default:              return fk(cleaned);
    }
  })();

  const grade = Math.round(rawGrade * 10) / 10;
  const thresholds = THRESHOLDS[formula];
  const label =
    grade <= thresholds.easy     ? 'Easy'
    : grade <= thresholds.moderate  ? 'Moderate'
    : grade <= thresholds.difficult ? 'Difficult'
    : 'Very Difficult';

  return { grade, label, formula, formulaLabel: FORMULA_LABELS[formula] };
}

// ---------------------------------------------------------------------------
// Legacy shim — kept so existing call-sites that use the FK-only API still
// compile. New code should call computeReadabilityScore instead.
// ---------------------------------------------------------------------------

/** @deprecated Use computeReadabilityScore */
export function computeFKGradeLevel(text: string): number | null {
  const result = computeReadabilityScore(text, 'general');
  return result ? result.grade : null;
}

/** @deprecated Use computeReadabilityScore */
export function fkGradeLabel(grade: number): string {
  const t = THRESHOLDS.flesch_kincaid;
  if (grade <= t.easy)     return 'Easy';
  if (grade <= t.moderate) return 'Moderate';
  if (grade <= t.difficult) return 'Difficult';
  return 'Very Difficult';
}
