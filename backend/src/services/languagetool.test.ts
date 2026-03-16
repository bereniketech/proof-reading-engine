import { proofreadSectionWithLanguageTool, ProofreadSectionInput } from './languagetool';

describe('proofreadSectionWithLanguageTool', () => {
  it('applies grammar corrections and returns summary', async () => {
    const input: ProofreadSectionInput = {
      originalText: 'This are bad sentence.',
    };
    const result = await proofreadSectionWithLanguageTool(input);
    expect(result.corrected_text).not.toBe(input.originalText);
    expect(result.change_summary).toBe('Grammar corrections via LanguageTool');
  });
});
