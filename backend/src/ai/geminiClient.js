import { config } from '../config/env.js';

export function isAiConfigured() {
  return Boolean(config.ai.apiKey);
}

export class AiUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function requestGemini({ system, user, maxTokens }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.model)}:generateContent`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.ai.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
  } catch (error) {
    error.retryable = true;
    throw error;
  }

  if (!response.ok) {
    const error = new Error('Gemini request failed');
    error.status = response.status;
    throw error;
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts
    ?.filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('Gemini returned no text candidate');

  return {
    text,
    usage: {
      input_tokens: result.usageMetadata?.promptTokenCount ?? null,
      output_tokens: result.usageMetadata?.candidatesTokenCount ?? null,
    },
    model: result.modelVersion || config.ai.model,
  };
}

export async function complete({ system, user, maxTokens = 700 }) {
  if (!isAiConfigured()) throw new AiUnavailableError('GEMINI_API_KEY is not configured');

  const attempts = Math.max(1, config.ai.maxRetries + 1);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestGemini({ system, user, maxTokens });
    } catch (error) {
      lastError = error;
      const retryable = RETRYABLE_STATUS.has(error?.status)
        || error?.retryable
        || error?.code === 'ECONNRESET'
        || error?.code === 'ECONNREFUSED';
      if (!retryable || attempt === attempts - 1) break;
      const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  if (lastError?.status === 401 || lastError?.status === 403) {
    throw new AiUnavailableError('Google Gemini rejected the API key or API access');
  }
  if (lastError?.status === 404) {
    throw new AiUnavailableError('Google Gemini model was not found; check GEMINI_MODEL');
  }
  if (lastError?.status === 429) {
    throw new AiUnavailableError('Google Gemini free-tier quota or rate limit was reached');
  }
  if (!lastError?.status && !lastError?.retryable) {
    throw new AiUnavailableError('Google Gemini returned an invalid response');
  }
  throw new AiUnavailableError('Google Gemini is temporarily unavailable. Please try again.');
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
