import axios from 'axios';

export interface ProofreadSectionInput {
  originalText: string;
  referenceText?: string | null;
  sectionType?: 'heading' | 'paragraph';
  headingLevel?: number | null;
}

export interface ProofreadResult {
  corrected_text: string;
  change_summary: string;
}

interface LanguageToolResponse {
  data: {
    matches?: Array<{ offset: number; length: number; replacements: Array<{ value: string }> }>;
  };
}

interface ProofreadOptions {
  runCheck?: (params: URLSearchParams) => Promise<LanguageToolResponse>;
}

const LANGUAGETOOL_API_URL =
  process.env.LANGUAGETOOL_API_URL || 'https://api.languagetool.org/v2/check';
const LANGUAGETOOL_TIMEOUT_MS = 15000;

function applyCorrections(
  text: string,
  matches: Array<{ offset: number; length: number; replacements: Array<{ value: string }> }>
): string {
  // Sort matches in reverse order to avoid offset shifting
  const sorted = [...matches].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const match of sorted) {
    if (
      Array.isArray(match.replacements) &&
      match.replacements.length > 0 &&
      match.replacements[0] &&
      typeof match.replacements[0].value === 'string'
    ) {
      const replacement = match.replacements[0].value;
      result =
        result.slice(0, match.offset) +
        replacement +
        result.slice(match.offset + match.length);
    }
  }
  return result;
}

export async function proofreadSectionWithLanguageTool(
  section: ProofreadSectionInput,
  options: ProofreadOptions = {},
): Promise<ProofreadResult> {
  const params = new URLSearchParams();
  params.append('text', section.originalText);
  params.append('language', 'en-US');

  const runCheck =
    options.runCheck ??
    (async (payload: URLSearchParams): Promise<LanguageToolResponse> =>
      axios.post(LANGUAGETOOL_API_URL, payload, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: LANGUAGETOOL_TIMEOUT_MS,
      }));

  const response = await runCheck(params);

  const matches = response.data.matches || [];
  const corrected = applyCorrections(section.originalText, matches);

  return {
    corrected_text: corrected,
    change_summary: 'Grammar corrections via LanguageTool',
  };
}
