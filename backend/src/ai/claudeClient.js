import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';

let client = null;

export function isAiConfigured() {
  return Boolean(config.ai.apiKey);
}

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: config.ai.apiKey,
      timeout: config.ai.timeoutMs,
      maxRetries: 0, // we manage retries ourselves (bounded)
    });
  }
  return client;
}

export class AiUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

// Bounded retry with exponential backoff for transient provider failures only.
export async function complete({ system, user, maxTokens = 700 }) {
  if (!isAiConfigured()) throw new AiUnavailableError('ANTHROPIC_API_KEY is not configured');

  const attempts = Math.max(1, config.ai.maxRetries + 1);
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const msg = await getClient().messages.create({
        model: config.ai.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return {
        text,
        usage: {
          input_tokens: msg.usage?.input_tokens ?? null,
          output_tokens: msg.usage?.output_tokens ?? null,
        },
        model: msg.model,
      };
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.response?.status;
      const retryable = RETRYABLE_STATUS.has(status) || err?.name === 'APIConnectionTimeoutError' || err?.code === 'ETIMEDOUT';
      if (!retryable || i === attempts - 1) break;
      const backoff = Math.min(8000, 500 * 2 ** i) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  const status = lastError?.status;
  if (status === 401) throw new AiUnavailableError('AI provider rejected credentials');
  if (status === 429) throw new AiUnavailableError('AI provider rate limit exceeded');
  throw new AiUnavailableError(`AI call failed: ${lastError?.message || 'unknown error'}`);
}

// Robust JSON extraction: models sometimes wrap JSON in prose/code fences.
export function parseJsonOutput(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const braceStart = candidate.indexOf('{');
    const braceEnd = candidate.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      try {
        return JSON.parse(candidate.slice(braceStart, braceEnd + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
