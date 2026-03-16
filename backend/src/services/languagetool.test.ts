import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { proofreadSectionWithLanguageTool, type ProofreadSectionInput } from './languagetool.js';

describe('proofreadSectionWithLanguageTool', () => {
  it('applies grammar corrections and returns summary', async () => {
    const input: ProofreadSectionInput = {
      originalText: 'This are bad sentence.',
    };

    const result = await proofreadSectionWithLanguageTool(input, {
      runCheck: async () => ({
        data: {
          matches: [
            {
              offset: 5,
              length: 3,
              replacements: [{ value: 'is' }],
            },
          ],
        },
      }),
    });

    assert.equal(result.corrected_text, 'This is bad sentence.');
    assert.equal(result.change_summary, 'Grammar corrections via LanguageTool');
  });
});
