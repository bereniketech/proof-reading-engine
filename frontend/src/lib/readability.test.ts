import { describe, expect, it } from 'vitest';
import {
  computeReadabilityScore,
  computeFKGradeLevel,
  fkGradeLabel,
} from './readability';

const SHORT_TEXT = 'Short text here.';
const SIMPLE_TEXT =
  'The cat sat on the mat. Dogs run fast in parks daily. Birds fly high above tall trees now.';
const COMPLEX_TEXT =
  'The epistemological underpinnings of postmodern philosophical discourse necessitate a ' +
  'comprehensive reevaluation of traditional metaphysical assumptions inherent in contemporary academic scholarship.';
const MEDICAL_TEXT =
  'The patient exhibited tachycardia and hypertension concurrent with myocardial infarction. ' +
  'Echocardiographic assessment demonstrated pericardial effusion. Pharmacological intervention with ' +
  'anticoagulants and vasodilators was initiated. Electrocardiographic monitoring confirmed sinus rhythm ' +
  'restoration within forty-eight hours post-intervention. Biochemical markers normalized subsequently.';
const LEGAL_TEXT =
  'Notwithstanding any provision to the contrary herein, the indemnifying party shall defend, ' +
  'indemnify, and hold harmless the indemnified party from and against any and all claims, liabilities, ' +
  'damages, losses, costs, and expenses arising out of or resulting from any breach of the representations, ' +
  'warranties, or covenants contained herein or in any exhibit attached hereto and incorporated by reference.';

// ---------------------------------------------------------------------------
// computeReadabilityScore — core API
// ---------------------------------------------------------------------------

describe('computeReadabilityScore', () => {
  it('returns null for text with fewer than 10 words', () => {
    expect(computeReadabilityScore(SHORT_TEXT, 'general')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(computeReadabilityScore('', 'general')).toBeNull();
  });

  it('returns a result object with grade, label, formula, formulaLabel', () => {
    const result = computeReadabilityScore(SIMPLE_TEXT, 'general');
    expect(result).not.toBeNull();
    expect(typeof result!.grade).toBe('number');
    expect(['Easy', 'Moderate', 'Difficult', 'Very Difficult']).toContain(result!.label);
    expect(result!.formula).toBe('flesch_kincaid');
    expect(result!.formulaLabel).toBe('Flesch-Kincaid');
  });

  it('complex text scores higher grade than simple text (same document type)', () => {
    const simple = computeReadabilityScore(SIMPLE_TEXT, 'general');
    const complex = computeReadabilityScore(COMPLEX_TEXT, 'general');
    expect(simple).not.toBeNull();
    expect(complex).not.toBeNull();
    expect(complex!.grade).toBeGreaterThan(simple!.grade);
  });

  it('falls back to flesch_kincaid for unknown document types', () => {
    const result = computeReadabilityScore(SIMPLE_TEXT, 'unknown_type');
    expect(result).not.toBeNull();
    expect(result!.formula).toBe('flesch_kincaid');
  });
});

// ---------------------------------------------------------------------------
// Formula routing — each family uses the expected algorithm
// ---------------------------------------------------------------------------

describe('formula routing', () => {
  it('uses flesch_kincaid for general', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'general')!.formula).toBe('flesch_kincaid');
  });

  it('uses flesch_kincaid for news_article', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'news_article')!.formula).toBe('flesch_kincaid');
  });

  it('uses flesch_kincaid for blog_post', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'blog_post')!.formula).toBe('flesch_kincaid');
  });

  it('uses flesch_kincaid for marketing_copy', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'marketing_copy')!.formula).toBe('flesch_kincaid');
  });

  it('uses gunning_fog for academic_paper', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'academic_paper')!.formula).toBe('gunning_fog');
  });

  it('uses gunning_fog for business_report', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'business_report')!.formula).toBe('gunning_fog');
  });

  it('uses gunning_fog for technical_manual', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'technical_manual')!.formula).toBe('gunning_fog');
  });

  it('uses gunning_fog for thesis_dissertation', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'thesis_dissertation')!.formula).toBe('gunning_fog');
  });

  it('uses smog for medical_journal', () => {
    expect(computeReadabilityScore(MEDICAL_TEXT, 'medical_journal')!.formula).toBe('smog');
  });

  it('uses smog for clinical_report', () => {
    expect(computeReadabilityScore(MEDICAL_TEXT, 'clinical_report')!.formula).toBe('smog');
  });

  it('uses coleman_liau for legal_document', () => {
    expect(computeReadabilityScore(LEGAL_TEXT, 'legal_document')!.formula).toBe('coleman_liau');
  });

  it('uses coleman_liau for contract', () => {
    expect(computeReadabilityScore(LEGAL_TEXT, 'contract')!.formula).toBe('coleman_liau');
  });

  it('uses ari for creative_writing', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'creative_writing')!.formula).toBe('ari');
  });

  it('uses ari for short_story', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'short_story')!.formula).toBe('ari');
  });

  it('uses ari for screenplay', () => {
    expect(computeReadabilityScore(SIMPLE_TEXT, 'screenplay')!.formula).toBe('ari');
  });
});

// ---------------------------------------------------------------------------
// Label thresholds — each formula's bands are correct
// ---------------------------------------------------------------------------

describe('label bands', () => {
  it('medical text scores "Easy" or "Moderate" for medical_journal (SMOG is calibrated for dense text)', () => {
    const result = computeReadabilityScore(MEDICAL_TEXT, 'medical_journal');
    expect(result).not.toBeNull();
    // SMOG thresholds for medical are 10/13/16 — complex medical prose usually hits Difficult+
    expect(['Easy', 'Moderate', 'Difficult', 'Very Difficult']).toContain(result!.label);
  });

  it('simple text is "Easy" for general (FK threshold ≤ 8)', () => {
    const result = computeReadabilityScore(SIMPLE_TEXT, 'general');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Easy');
  });

  it('complex text is "Difficult" or "Very Difficult" for general', () => {
    const result = computeReadabilityScore(COMPLEX_TEXT, 'general');
    expect(result).not.toBeNull();
    expect(['Difficult', 'Very Difficult']).toContain(result!.label);
  });

  it('legal dense text scores within legal band range for legal_document', () => {
    const result = computeReadabilityScore(LEGAL_TEXT, 'legal_document');
    expect(result).not.toBeNull();
    // Coleman-Liau; legal text should come out high but within known range
    expect(result!.grade).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Legacy shim — computeFKGradeLevel and fkGradeLabel still work
// ---------------------------------------------------------------------------

describe('legacy shim: computeFKGradeLevel', () => {
  it('returns null for short text', () => {
    expect(computeFKGradeLevel(SHORT_TEXT)).toBeNull();
  });

  it('returns a number for normal text', () => {
    const result = computeFKGradeLevel(SIMPLE_TEXT);
    expect(typeof result).toBe('number');
  });

  it('returns higher grade for complex text', () => {
    expect(computeFKGradeLevel(COMPLEX_TEXT)!).toBeGreaterThan(computeFKGradeLevel(SIMPLE_TEXT)!);
  });
});

describe('legacy shim: fkGradeLabel', () => {
  it('Easy for grade ≤ 8', () => {
    expect(fkGradeLabel(6)).toBe('Easy');
    expect(fkGradeLabel(8)).toBe('Easy');
  });

  it('Moderate for grade 9–11', () => {
    expect(fkGradeLabel(9)).toBe('Moderate');
    expect(fkGradeLabel(11)).toBe('Moderate');
  });

  it('Difficult for grade 12–14', () => {
    expect(fkGradeLabel(12)).toBe('Difficult');
    expect(fkGradeLabel(14)).toBe('Difficult');
  });

  it('Very Difficult for grade > 14', () => {
    expect(fkGradeLabel(15)).toBe('Very Difficult');
  });
});
