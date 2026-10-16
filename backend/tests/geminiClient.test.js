import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = 'test-gemini-key';
const { complete, isAiConfigured, AiUnavailableError } = await import('../src/ai/geminiClient.js');

test('Gemini request uses the server-side API key header and maps text/usage', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({
      modelVersion: 'gemini-test-version',
      candidates: [{ content: { parts: [{ text: '{"category":' }, { text: '"General Inquiry"}' }] } }],
      usageMetadata: { promptTokenCount: 23, candidatesTokenCount: 11 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await complete({ system: 'System rules', user: 'Ticket text', maxTokens: 300 });
    assert.match(captured.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent/);
    assert.equal(captured.options.headers['x-goog-api-key'], 'test-gemini-key');
    assert.equal(captured.url.includes('test-gemini-key'), false);
    assert.deepEqual(JSON.parse(captured.options.body), {
      systemInstruction: { parts: [{ text: 'System rules' }] },
      contents: [{ role: 'user', parts: [{ text: 'Ticket text' }] }],
      generationConfig: { maxOutputTokens: 300, responseMimeType: 'application/json' },
    });
    assert.deepEqual(result, {
      text: '{"category":\n"General Inquiry"}',
      usage: { input_tokens: 23, output_tokens: 11 },
      model: 'gemini-test-version',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing Gemini key reports an explicit unconfigured state', async () => {
  const { config } = await import('../src/config/env.js');
  const originalKey = config.ai.apiKey;
  config.ai.apiKey = '';
  try {
    assert.equal(isAiConfigured(), false);
    await assert.rejects(complete({ system: 'rules', user: 'input' }), {
      name: 'AiUnavailableError',
      message: 'GEMINI_API_KEY is not configured',
    });
  } finally {
    config.ai.apiKey = originalKey;
  }
});

test('Gemini credential and quota errors become safe actionable messages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  try {
    await assert.rejects(complete({ system: 'rules', user: 'input' }), (error) => {
      assert.ok(error instanceof AiUnavailableError);
      assert.match(error.message, /rejected the API key or API access/);
      assert.doesNotMatch(error.message, /test-gemini-key/);
      return true;
    });

    globalThis.fetch = async () => new Response('{}', { status: 429 });
    await assert.rejects(complete({ system: 'rules', user: 'input' }), /free-tier quota or rate limit/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini model configuration errors identify the setting to verify', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  try {
    await assert.rejects(complete({ system: 'rules', user: 'input' }), /model was not found; check GEMINI_MODEL/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
