import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * Unified LLM client supporting OpenAI API and Ollama (local).
 * Auto-detects provider from environment variables.
 * Falls back gracefully when no API key is configured.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

let client = null;
let provider = 'none';
let chatModel = null;
let embeddingModel = null;
let initialized = false;

function initClient() {
  if (initialized) return;
  initialized = true;

  const ollamaUrl = process.env.OLLAMA_URL;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey && openaiKey !== 'sk-proj-xxxxxxxxxxxxxxxxxxxx') {
    client = new OpenAI({ apiKey: openaiKey });
    provider = 'openai';
    chatModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    console.log('  🤖 [LLM] Provider: OpenAI (' + chatModel + ')');
  } else if (ollamaUrl) {
    client = new OpenAI({
      baseURL: `${ollamaUrl}/v1`,
      apiKey: 'ollama',
    });
    provider = 'ollama';
    chatModel = process.env.OLLAMA_MODEL || 'llama3.2';
    embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    console.log('  🤖 [LLM] Provider: Ollama (' + chatModel + ')');
  } else {
    provider = 'none';
    console.log('  🤖 [LLM] No LLM provider configured. Falling back to static scoring.');
  }
}

/**
 * Check if LLM is available and configured.
 *
 * @returns {boolean}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function isLlmAvailable() {
  initClient();
  return provider !== 'none';
}

/**
 * Send a chat completion request to the LLM.
 *
 * @param {string} systemPrompt - System message
 * @param {string} userPrompt - User message
 * @param {object} options - temperature, max_tokens, response_format
 * @returns {Promise<string|null>} Response text or null if unavailable
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function chatCompletion(systemPrompt, userPrompt, options = {}) {
  initClient();
  if (!client) return null;

  try {
    const params = {
      model: chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens ?? 2000,
    };

    if (options.response_format) {
      params.response_format = options.response_format;
    }

    const response = await client.chat.completions.create(params);
    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error(`  ❌ [LLM] Chat error: ${error.message}`);
    return null;
  }
}

/**
 * Generate text embeddings for semantic similarity.
 *
 * @param {string} text - Input text to embed
 * @returns {Promise<number[]|null>} Embedding vector or null
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function getEmbedding(text) {
  initClient();
  if (!client) return null;

  try {
    const response = await client.embeddings.create({
      model: embeddingModel,
      input: text,
    });
    return response.data[0]?.embedding || null;
  } catch (error) {
    console.error(`  ❌ [LLM] Embedding error: ${error.message}`);
    return null;
  }
}

/**
 * Batch generate embeddings for multiple texts.
 *
 * @param {string[]} texts - Array of texts
 * @returns {Promise<number[][]|null>} Array of embedding vectors
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function getBatchEmbeddings(texts) {
  initClient();
  if (!client) return null;

  try {
    const response = await client.embeddings.create({
      model: embeddingModel,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  } catch (error) {
    console.error(`  ❌ [LLM] Batch embedding error: ${error.message}`);
    return null;
  }
}

export { provider, chatModel, embeddingModel };
