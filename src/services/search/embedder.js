/**
 * Gemini gemini-embedding-001 wrapper.
 * Returns Float32Array of 3072 dims per input string.
 * Concurrent batching — 8 parallel calls per round.
 */
const logger = require('../../utils/logger');

let _genai = null;

function getClient() {
  if (_genai) return _genai;
  const { GoogleGenAI } = require('@google/genai');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set — embedder unavailable');
  _genai = new GoogleGenAI({ apiKey });
  return _genai;
}

// gemini-embedding-001 is the stable embedding model available via @google/genai SDK v1.x
// text-embedding-004 is NOT accessible via this SDK (v1beta endpoint only, different SDK)
const EMBED_MODEL = 'gemini-embedding-001';

/**
 * Embed a single string. Returns Float32Array (3072 dims) or null on failure.
 */
async function embedText(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    const ai     = getClient();
    const result = await ai.models.embedContent({
      model:    EMBED_MODEL,
      contents: text.slice(0, 2000), // 'contents' param, not 'content'
    });
    // SDK v1.x: result.embeddings[0].values
    const values = result?.embeddings?.[0]?.values;
    if (!values) return null;
    return new Float32Array(values);
  } catch (err) {
    logger.warn(`embedder: failed — ${err.message}`);
    return null;
  }
}

/**
 * Embed multiple strings. Returns array of Float32Array | null (same length as input).
 * Uses individual embedContent calls with concurrency cap of 8 (rate-limit safe).
 */
async function embedBatch(texts) {
  if (!texts.length) return [];

  const CONCURRENCY = 8;
  const results = new Array(texts.length).fill(null);

  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const slice = texts.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map((t) => embedText(t))
    );
    for (let j = 0; j < settled.length; j++) {
      results[i + j] = settled[j].status === 'fulfilled' ? settled[j].value : null;
    }
  }
  return results;
}

/**
 * Cosine similarity between two Float32Arrays.
 */
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

module.exports = { embedText, embedBatch, cosineSim };
