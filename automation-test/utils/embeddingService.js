import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEmbedding, getBatchEmbeddings, isLlmAvailable } from './llmService.js';
import { fuzzySimilarity } from './similarity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', 'healed-locators', 'embedding-cache.json');

/**
 * Embedding-based semantic similarity service with disk cache.
 * Uses LLM embeddings for text comparison, with automatic
 * fallback to fuzzy string matching when LLM is unavailable.
 *
 * Disk cache avoids re-calling the API for the same text,
 * reducing cost and latency on repeated runs.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

let embeddingCache = {};

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      embeddingCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch {
    embeddingCache = {};
  }
}

function saveCache() {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(embeddingCache), 'utf-8');
}

loadCache();

/**
 * Cosine similarity between two vectors.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Similarity between -1 and 1
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Get embedding for text, using cache to avoid repeat API calls.
 *
 * @param {string} text
 * @returns {Promise<number[]|null>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function getCachedEmbedding(text) {
  if (!text || text.trim() === '') return null;

  const key = text.toLowerCase().trim();
  if (embeddingCache[key]) {
    return embeddingCache[key];
  }

  const embedding = await getEmbedding(key);
  if (embedding) {
    embeddingCache[key] = embedding;
    saveCache();
  }
  return embedding;
}

/**
 * Semantic similarity between two text strings using embeddings.
 * Falls back to fuzzy string matching if LLM is unavailable.
 *
 * @param {string} textA - First text
 * @param {string} textB - Second text
 * @returns {Promise<{score: number, method: string}>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function semanticSimilarity(textA, textB) {
  if (!textA && !textB) return { score: 1, method: 'both-empty' };
  if (!textA || !textB) return { score: 0, method: 'one-empty' };

  if (!isLlmAvailable()) {
    return { score: fuzzySimilarity(textA, textB), method: 'fuzzy-fallback' };
  }

  try {
    const [embA, embB] = await Promise.all([
      getCachedEmbedding(textA),
      getCachedEmbedding(textB),
    ]);

    if (embA && embB) {
      const cosine = cosineSimilarity(embA, embB);
      const normalized = (cosine + 1) / 2;
      return { score: normalized, method: 'embedding' };
    }
  } catch (error) {
    console.error(`  ⚠️ [Embedding] Error: ${error.message}, falling back to fuzzy`);
  }

  return { score: fuzzySimilarity(textA, textB), method: 'fuzzy-fallback' };
}

/**
 * Semantic similarity for nearby text arrays.
 * Joins arrays and compares as single text blocks.
 *
 * @param {string[]} nearbyA
 * @param {string[]} nearbyB
 * @returns {Promise<{score: number, method: string}>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function semanticNearbySimilarity(nearbyA, nearbyB) {
  if (!nearbyA?.length && !nearbyB?.length) return { score: 1, method: 'both-empty' };
  if (!nearbyA?.length || !nearbyB?.length) return { score: 0, method: 'one-empty' };

  const textA = nearbyA.join(' ');
  const textB = nearbyB.join(' ');
  return semanticSimilarity(textA, textB);
}

/**
 * Clear the embedding cache (for testing or reset).
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function clearEmbeddingCache() {
  embeddingCache = {};
  if (fs.existsSync(CACHE_PATH)) {
    fs.unlinkSync(CACHE_PATH);
  }
}

export function getEmbeddingCacheSize() {
  return Object.keys(embeddingCache).length;
}
