/**
 * Gemini text-embedding-004 wrapper.
 * Returns Float32Array of 768 dims per input string.
 * Batches up to 100 texts per API call.
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

const EMBED_MODEL = 'text-embedding-004';

/**
 * Embed a single string. Returns Float32Array (768 dims) or null on failure.
 */
async function embedText(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    const ai     = getClient();
    const result = await ai.models.embedContent({
      model:   EMBED_MODEL,
      content: text.slice(0, 2000), // Gemini embed limit
    });
    const values = result?.embedding?.values;
    if (!values) return null;
    return new Float32Array(values);
  } catch (err) {
    logger.warn(`embedder: failed — ${err.message}`);
    return null;
  }
}

/**
 * Embed multiple strings. Returns array of Float32Array | null (same length as input).
 * Gemini batchEmbedContents processes up to 100 items.
 */
async function embedBatch(texts) {
  if (!texts.length) return [];
  const ai = getClient();

  // Process in chunks of 100
  const CHUNK = 100;
  const results = [];

  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk  = texts.slice(i, i + CHUNK);
    try {
      const res = await ai.models.batchEmbedContents({
        model:    EMBED_MODEL,
        requests: chunk.map((t) => ({
          content: (t || '').slice(0, 2000),
        })),
      });
      const embeddings = res?.embeddings || [];
      for (const emb of embeddings) {
        results.push(emb?.values ? new Float32Array(emb.values) : null);
      }
    } catch (err) {
      logger.warn(`embedder: batch chunk failed — ${err.message}`);
      for (let j = 0; j < chunk.length; j++) results.push(null);
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
