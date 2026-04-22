/**
 * LLM-agnostic chat completion layer.
 *
 * Provider: LLM_PROVIDER=anthropic (default) | openai
 *
 * Models are chosen per task profile. Override via env if needed:
 *   LLM_MODEL_PROOFREADING   — precise correction, structured JSON  (claude-opus-4-7 / gpt-4o)
 *   LLM_MODEL_SCORING        — AI detection, analytical JSON         (claude-opus-4-7 / gpt-4o)
 *   LLM_MODEL_REVIEW         — holistic document analysis, JSON      (claude-opus-4-7 / gpt-4o)
 *   LLM_MODEL_HUMANIZATION   — creative prose rewriting              (claude-sonnet-4-6 / gpt-4o)
 *   LLM_MODEL_SECTION        — section suggestion + content gen      (claude-sonnet-4-6 / gpt-4o)
 *   LLM_MODEL_REFORMAT       — structural reformatting               (claude-sonnet-4-6 / gpt-4o)
 *   LLM_MODEL_CHAT           — conversational assistant (streaming)  (claude-sonnet-4-6 / gpt-4o)
 *   LLM_MODEL_TONE           — tone classification, JSON             (claude-haiku-4-5 / gpt-4o-mini)
 *   LLM_MODEL_COMPLETENESS   — structure analysis, JSON              (claude-haiku-4-5 / gpt-4o-mini)
 *   LLM_MODEL_CITATIONS      — claim classification, JSON            (claude-haiku-4-5 / gpt-4o-mini)
 *   LLM_MODEL_REFERENCES     — reference matching, JSON              (claude-haiku-4-5 / gpt-4o-mini)
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  /** Request JSON object output (provider-best-effort). */
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  stream(messages: ChatMessage[], options?: Omit<ChatOptions, 'jsonMode'>): AsyncGenerator<string>;
}

/** Named task profiles that select the right model for the job. */
export type TaskProfile =
  | 'proofreading'   // precise correction + JSON — needs strongest model
  | 'scoring'        // AI detection analysis + JSON — needs strong reasoning
  | 'review'         // full doc quality analysis + JSON — needs deep comprehension
  | 'humanization'   // creative prose rewriting — needs high-quality generation
  | 'section'        // section suggestion + scaffold content — balanced
  | 'reformat'       // structural reformatting — balanced
  | 'chat'           // conversational assistant (streaming) — balanced
  | 'tone'           // per-section tone classification — fast, cheap
  | 'completeness'   // doc structure completeness check — fast, cheap
  | 'citations'      // claim/citation classification — fast, cheap
  | 'references';    // reference matching — fast, cheap

// ── Per-provider model defaults ───────────────────────────────────────────────

const MODEL_DEFAULTS: Record<string, Record<TaskProfile, string>> = {
  anthropic: {
    // Tasks requiring deep reasoning, precise instruction-following, structured JSON
    proofreading: 'claude-opus-4-7',
    scoring: 'claude-opus-4-7',
    review: 'claude-opus-4-7',
    // Tasks requiring high-quality text generation / balanced capability
    humanization: 'claude-sonnet-4-6',
    section: 'claude-sonnet-4-6',
    reformat: 'claude-sonnet-4-6',
    chat: 'claude-sonnet-4-6',
    // High-volume classification tasks — fast and cheap
    tone: 'claude-haiku-4-5',
    completeness: 'claude-haiku-4-5',
    citations: 'claude-haiku-4-5',
    references: 'claude-haiku-4-5',
  },
  openai: {
    proofreading: 'gpt-4o',
    scoring: 'gpt-4o',
    review: 'gpt-4o',
    humanization: 'gpt-4o',
    section: 'gpt-4o',
    reformat: 'gpt-4o',
    chat: 'gpt-4o',
    tone: 'gpt-4o-mini',
    completeness: 'gpt-4o-mini',
    citations: 'gpt-4o-mini',
    references: 'gpt-4o-mini',
  },
};

const MODEL_ENV_KEYS: Record<TaskProfile, string> = {
  proofreading: 'LLM_MODEL_PROOFREADING',
  scoring: 'LLM_MODEL_SCORING',
  review: 'LLM_MODEL_REVIEW',
  humanization: 'LLM_MODEL_HUMANIZATION',
  section: 'LLM_MODEL_SECTION',
  reformat: 'LLM_MODEL_REFORMAT',
  chat: 'LLM_MODEL_CHAT',
  tone: 'LLM_MODEL_TONE',
  completeness: 'LLM_MODEL_COMPLETENESS',
  citations: 'LLM_MODEL_CITATIONS',
  references: 'LLM_MODEL_REFERENCES',
};

// ── Anthropic ────────────────────────────────────────────────────────────────

async function buildAnthropicClient() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  return new Anthropic({ apiKey });
}

function makeAnthropicProvider(
  client: Awaited<ReturnType<typeof buildAnthropicClient>>,
  model: string,
): LLMProvider {
  return {
    async chat(messages, options = {}) {
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const userMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const response = await client.messages.create(
        {
          model,
          max_tokens: 4096,
          temperature: options.temperature ?? 0.3,
          ...(system ? { system } : {}),
          messages: userMessages,
        },
        { signal: options.signal },
      );

      const block = response.content[0];
      return block?.type === 'text' ? block.text : '';
    },

    async *stream(messages, options = {}) {
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const userMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const stream = client.messages.stream(
        {
          model,
          max_tokens: 4096,
          temperature: options.temperature ?? 0.5,
          ...(system ? { system } : {}),
          messages: userMessages,
        },
        { signal: options.signal },
      );

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    },
  };
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function buildOpenAIClient() {
  const { default: OpenAI } = await import('openai');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function makeOpenAIProvider(
  client: Awaited<ReturnType<typeof buildOpenAIClient>>,
  model: string,
): LLMProvider {
  return {
    async chat(messages, options = {}) {
      const completion = await client.chat.completions.create(
        {
          model,
          temperature: options.temperature ?? 0.3,
          response_format: options.jsonMode ? { type: 'json_object' } : undefined,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        { signal: options.signal },
      );
      return completion.choices[0]?.message?.content ?? '';
    },

    async *stream(messages, options = {}) {
      const openAIStream = await client.chat.completions.create(
        {
          model,
          temperature: options.temperature ?? 0.5,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        },
        { signal: options.signal },
      );

      for await (const chunk of openAIStream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) yield token;
      }
    },
  };
}

// ── Factory ──────────────────────────────────────────────────────────────────

interface ProviderSet {
  providers: Record<TaskProfile, LLMProvider>;
}

let providerSetPromise: Promise<ProviderSet> | null = null;

async function buildProviderSet(): Promise<ProviderSet> {
  const providerName = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
  const defaults = MODEL_DEFAULTS[providerName] ?? MODEL_DEFAULTS['anthropic'];

  const resolveModel = (profile: TaskProfile): string =>
    process.env[MODEL_ENV_KEYS[profile]] ?? (defaults as Record<TaskProfile, string>)[profile];

  const profiles: TaskProfile[] = [
    'proofreading', 'scoring', 'review', 'humanization',
    'section', 'reformat', 'chat', 'tone', 'completeness', 'citations', 'references',
  ];

  if (providerName === 'openai') {
    const client = await buildOpenAIClient();
    return {
      providers: Object.fromEntries(
        profiles.map((p) => [p, makeOpenAIProvider(client, resolveModel(p))]),
      ) as Record<TaskProfile, LLMProvider>,
    };
  }

  const client = await buildAnthropicClient();
  return {
    providers: Object.fromEntries(
      profiles.map((p) => [p, makeAnthropicProvider(client, resolveModel(p))]),
    ) as Record<TaskProfile, LLMProvider>,
  };
}

export async function getLLMProvider(profile: TaskProfile): Promise<LLMProvider> {
  if (!providerSetPromise) providerSetPromise = buildProviderSet();
  const { providers } = await providerSetPromise;
  return providers[profile];
}
