import { describe, expect, it } from 'vitest';
import { computeFKGradeLevel, fkGradeLabel } from './readability';

describe('computeFKGradeLevel', () => {
  it('returns null for text with fewer than 10 words', () => {
    expect(computeFKGradeLevel('Short text here.')).toBeNull();
  });

  it('returns a number for a normal paragraph', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. ' +
      'This sentence adds more words to reach the minimum threshold for scoring.';
    const result = computeFKGradeLevel(text);
    expect(typeof result).toBe('number');
    expect(result).not.toBeNull();
  });

  it('returns null for empty string', () => {
    expect(computeFKGradeLevel('')).toBeNull();
  });

  it('returns a higher grade for complex text', () => {
    const simple = 'The cat sat on the mat. Dogs run fast in parks daily. Birds fly high above tall trees now.';
    const complex =
      'The epistemological underpinnings of postmodern philosophical discourse necessitate a comprehensive ' +
      'reevaluation of traditional metaphysical assumptions inherent in contemporary academic scholarship.';
    const simpleGrade = computeFKGradeLevel(simple);
    const complexGrade = computeFKGradeLevel(complex);
    expect(simpleGrade).not.toBeNull();
    expect(complexGrade).not.toBeNull();
    expect(complexGrade!).toBeGreaterThan(simpleGrade!);
  });
});

describe('fkGradeLabel', () => {
  it('returns Easy for grade <= 6', () => {
    expect(fkGradeLabel(5)).toBe('Easy');
    expect(fkGradeLabel(6)).toBe('Easy');
  });

  it('returns Moderate for grade 7-9', () => {
    expect(fkGradeLabel(7)).toBe('Moderate');
    expect(fkGradeLabel(9)).toBe('Moderate');
  });

  it('returns Difficult for grade 10-12', () => {
    expect(fkGradeLabel(10)).toBe('Difficult');
    expect(fkGradeLabel(12)).toBe('Difficult');
  });

  it('returns Very Difficult for grade > 12', () => {
    expect(fkGradeLabel(13)).toBe('Very Difficult');
  });
});
