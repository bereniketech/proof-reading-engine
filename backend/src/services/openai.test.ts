import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySectionInstruction,
  openAIServiceInternals,
  proofreadSectionWithOpenAI,
  type ProofreadResult,
  type ProofreadSectionInput,
} from './openai.js';

const sampleSection: ProofreadSectionInput = {
  originalText: 'this are sample sentence.',
  sectionType: 'paragraph',
  headingLevel: null,
};

describe('openai service internals', () => {
  it('parses a valid JSON response payload', () => {
    const result = openAIServiceInternals.parseProofreadResult(
      '{"corrected_text":"This is a sample sentence.","change_summary":"Fixed subject-verb agreement."}',
    );

    assert.deepEqual(result, {
      corrected_text: 'This is a sample sentence.',
      change_summary: 'Fixed subject-verb agreement.',
    });
  });

  it('throws on invalid JSON payloads', () => {
    assert.throws(() => {
      openAIServiceInternals.parseProofreadResult('not-json');
    }, /valid JSON/);
  });

  it('marks rate limit and timeout errors as retryable', () => {
    assert.equal(openAIServiceInternals.isRetryableLLMError({ status: 429 }), true);
    assert.equal(openAIServiceInternals.isRetryableLLMError({ name: 'AbortError' }), true);
    assert.equal(openAIServiceInternals.isRetryableLLMError({ name: 'Error' }), false);
  });
});

describe('proofreadSectionWithOpenAI', () => {
  it('returns result when first attempt succeeds', async () => {
    const result = await proofreadSectionWithOpenAI(sampleSection, {
      runProofread: async (): Promise<ProofreadResult> => ({
        corrected_text: 'This is a sample sentence.',
        change_summary: 'Fixed grammar.',
      }),
    });

    assert.deepEqual(result, {
      corrected_text: 'This is a sample sentence.',
      change_summary: 'Fixed grammar.',
    });
  });

  it('retries once on retryable failure', async () => {
    let attemptCount = 0;

    const result = await proofreadSectionWithOpenAI(sampleSection, {
      maxRetryAttempts: 1,
      retryDelayMs: 0,
      runProofread: async (): Promise<ProofreadResult> => {
        attemptCount += 1;

        if (attemptCount === 1) {
          const rateLimitError = new Error('rate limited') as Error & { status: number };
          rateLimitError.status = 429;
          throw rateLimitError;
        }

        return {
          corrected_text: 'This is a sample sentence.',
          change_summary: 'Retried after rate limit.',
        };
      },
    });

    assert.equal(attemptCount, 2);
    assert.equal(result.change_summary, 'Retried after rate limit.');
  });

  it('throws immediately on non-retryable failure', async () => {
    let attemptCount = 0;

    await assert.rejects(
      proofreadSectionWithOpenAI(sampleSection, {
        maxRetryAttempts: 1,
        retryDelayMs: 0,
        runProofread: async (): Promise<ProofreadResult> => {
          attemptCount += 1;
          throw new Error('non-retryable');
        },
      }),
      /OpenAI proofreading failed after retry: non-retryable/,
    );

    assert.equal(attemptCount, 1);
  });
});

describe('applySectionInstruction', () => {
  it('retries once on retryable failure', async () => {
    let attemptCount = 0;

    const result = await applySectionInstruction('References text', 'Convert to APA format', {
      maxRetryAttempts: 1,
      retryDelayMs: 0,
      runInstruction: async (): Promise<ProofreadResult> => {
        attemptCount += 1;

        if (attemptCount === 1) {
          const abortedError = new Error('Request was aborted.') as Error & { name: string };
          abortedError.name = 'AbortError';
          throw abortedError;
        }

        return {
          corrected_text: 'Formatted APA references.',
          change_summary: 'Converted references to APA style.',
        };
      },
    });

    assert.equal(attemptCount, 2);
    assert.equal(result.change_summary, 'Converted references to APA style.');
  });

  it('returns a helpful timeout message after retries are exhausted', async () => {
    await assert.rejects(
      applySectionInstruction('Long references text', 'Convert to APA format', {
        maxRetryAttempts: 0,
        retryDelayMs: 0,
        runInstruction: async (): Promise<ProofreadResult> => {
          const abortedError = new Error('Request was aborted.') as Error & { name: string };
          abortedError.name = 'AbortError';
          throw abortedError;
        },
      }),
      /timed out on this section/,
    );
  });
});
