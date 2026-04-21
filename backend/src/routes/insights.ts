import type { Request, Response } from 'express';
import { Router } from 'express';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';

interface AuthenticatedUser { id: string; }

function getAuthenticatedUser(res: Response): AuthenticatedUser | null {
  const user = res.locals.user;
  return user && typeof user.id === 'string' ? { id: user.id } : null;
}

function getVerifiedAccessToken(res: Response): string | null {
  const token = res.locals.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean { return uuidPattern.test(v); }

// ── Pure metric functions ──────────────────────────────────────

function getWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;
  const vowelGroups = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','was','are','were','be','been','being','have','has','had','do',
  'does','did','will','would','shall','should','may','might','must','can','could',
  'not','no','nor','so','yet','both','either','neither','each','few','more',
  'most','other','some','such','than','that','these','they','this','those','we',
  'i','you','he','she','it','its','my','our','your','his','her','their','which',
  'who','whom','what','when','where','why','how','all','any','as','if','into',
  'about','above','after','before','between','through','during','while','then',
]);

const AUTHORITY_WORDS = new Set(['must','shall','require','mandate','establish','assert','determine','conclude','demonstrate','prove','evidence','verify','confirm','define']);
const CONFIDENCE_WORDS = new Set(['clearly','certainly','definitely','proven','evidence','demonstrates','confirms','established','undoubtedly','obviously','precisely','exactly','specifically']);
const URGENCY_WORDS = new Set(['immediately','urgent','critical','deadline','now','asap','priority','crucial','essential','imperative','emergency','time-sensitive']);

const POSITIVE_WORDS = new Set(['good','great','excellent','outstanding','beneficial','positive','improve','enhance','effective','successful','valuable','important','significant','clear','strong']);
const NEGATIVE_WORDS = new Set(['bad','poor','weak','fail','error','problem','issue','concern','risk','difficult','unclear','incorrect','wrong','inadequate','insufficient']);

function computeQualityScore(sections: Array<{ status: string }>): number {
  if (sections.length === 0) return 0;
  const count = sections.filter((s) => s.status === 'accepted' || s.status === 'ready').length;
  return Math.round((count / sections.length) * 100);
}

function computeGrammarScore(sections: Array<{ original_text: string; corrected_text: string | null }>): number {
  if (sections.length === 0) return 100;
  const withDiff = sections.filter((s) => s.corrected_text && s.corrected_text !== s.original_text).length;
  return Math.round((1 - withDiff / sections.length) * 100);
}

function computeTone(words: string[]): { authority: number; confidence: number; urgency: number } {
  const total = Math.max(words.length, 1);
  const normalize = (count: number): number => Math.min(100, Math.round((count / total) * 2000));
  return {
    authority: normalize(words.filter((w) => AUTHORITY_WORDS.has(w)).length),
    confidence: normalize(words.filter((w) => CONFIDENCE_WORDS.has(w)).length),
    urgency: normalize(words.filter((w) => URGENCY_WORDS.has(w)).length),
  };
}

function computeVocabularyDiversity(words: string[]): number {
  if (words.length === 0) return 0;
  const ratio = new Set(words).size / words.length;
  return Math.min(10, Math.round(ratio * 20 * 10) / 10);
}

function computeLexicalDensity(words: string[]): number {
  if (words.length === 0) return 0;
  const contentWords = words.filter((w) => !STOPWORDS.has(w));
  return Math.round((contentWords.length / words.length) * 100);
}

function computeSentiment(words: string[]): { positive: number; neutral: number; negative: number } {
  const pos = words.filter((w) => POSITIVE_WORDS.has(w)).length;
  const neg = words.filter((w) => NEGATIVE_WORDS.has(w)).length;
  const total = Math.max(words.length, 1);
  const posP = Math.round((pos / total) * 100);
  const negP = Math.round((neg / total) * 100);
  return { positive: posP, negative: negP, neutral: Math.max(0, 100 - posP - negP) };
}

function computeReadability(text: string, words: string[]): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (words.length === 0 || sentences.length === 0) return 50;
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const score = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Router ────────────────────────────────────────────────────

export const insightsRouter = Router();

insightsRouter.get('/sessions/:id/insights', async (req: Request, res: Response): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);
  if (!user || !accessToken) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const { id } = req.params;
  if (!id || !isUuid(id)) { res.status(400).json({ success: false, error: 'Invalid session ID' }); return; }

  const supabase = createUserScopedSupabaseClient(accessToken);

  // Verify session ownership
  const { data: session, error: sessionError } = await supabase
    .from('sessions').select('id, user_id').eq('id', id).single();

  if (sessionError || !session) { res.status(404).json({ success: false, error: 'Session not found' }); return; }
  if (session.user_id !== user.id) { res.status(403).json({ success: false, error: 'Forbidden' }); return; }

  // Fetch sections
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('original_text, corrected_text, final_text, status')
    .eq('session_id', id);

  if (sectionsError) { res.status(500).json({ success: false, error: sectionsError.message }); return; }
  if (!sections || sections.length === 0) { res.status(422).json({ success: false, error: 'No sections found' }); return; }

  const allText = sections
    .map((s) => s.final_text ?? s.corrected_text ?? s.original_text)
    .join(' ');
  const words = getWords(allText);

  res.status(200).json({
    success: true,
    data: {
      quality_score: computeQualityScore(sections),
      grammar_score: computeGrammarScore(sections),
      tone: computeTone(words),
      vocabulary_diversity: computeVocabularyDiversity(words),
      lexical_density: computeLexicalDensity(words),
      sentiment: computeSentiment(words),
      word_count: words.length,
      readability_score: computeReadability(allText, words),
    },
  });
});
