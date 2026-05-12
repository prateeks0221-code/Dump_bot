/**
 * L2 Context Generation Engine
 *
 * Builds a text corpus from ALL available item fields, then runs structured
 * L2 analysis via LLM fallback cascade:
 *   Gemini → Groq → Cerebras → OpenRouter → minimal fallback
 *
 * Returns structured L2 JSON per item.
 */

const config  = require('../../config');
const logger  = require('../../utils/logger');

// ─── Text corpus builder ────────────────────────────────────────────────────

/**
 * Assemble every available text signal from an item into one corpus string.
 * Labelled sections so the LLM knows what each part is.
 */
function buildCorpus(item) {
  const parts = [];

  const add = (label, value) => {
    if (value && typeof value === 'string' && value.trim()) {
      parts.push(`[${label}]\n${value.trim()}`);
    }
  };

  add('TITLE',       item.og_title      || item.title);
  add('TYPE',        [item.type, item.link_kind].filter(Boolean).join(' / '));
  add('SOURCE_URL',  item.link_url      || item.file_url);
  add('SITE',        item.og_site);
  add('TAGS',        item.tags?.join(', '));
  add('SUMMARY',     item.summary);
  add('DESCRIPTION', item.og_description);
  add('CONTENT',     item.raw_content?.slice(0, 3000));
  add('TRANSCRIPT',  item.transcript?.slice(0, 3000));  // populated by audio enrichment

  if (item.reel_links?.length) {
    add('REEL_LINKS', item.reel_links.map((l) => `${l.label}: ${l.url}`).join('\n'));
  }

  return parts.join('\n\n');
}

// ─── Explicit link extractor ────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

const LINK_TYPE_MAP = [
  [/github\.com/i,         'repo'],
  [/youtube\.com|youtu\.be/i, 'video'],
  [/twitter\.com|x\.com/i,'social'],
  [/instagram\.com/i,     'social'],
  [/arxiv\.org/i,         'paper'],
  [/docs\.|documentation\./i, 'doc'],
  [/notion\.so/i,         'doc'],
  [/figma\.com/i,         'design'],
  [/reddit\.com/i,        'social'],
  [/linkedin\.com/i,      'social'],
  [/medium\.com|substack\.com/i, 'article'],
  [/npmjs\.com/i,         'package'],
  [/pypi\.org/i,          'package'],
];

function classifyLinkType(url) {
  for (const [re, type] of LINK_TYPE_MAP) {
    if (re.test(url)) return type;
  }
  return 'article';
}

function extractExplicitLinks(corpus, existingUrl) {
  const found = [...new Set((corpus.match(URL_RE) || []))];
  return found
    .filter((u) => u !== existingUrl)
    .slice(0, 20)
    .map((url) => ({
      url,
      link_type: classifyLinkType(url),
      context: 'extracted from content',
      already_in_system: false,
      suggested_action: 'create_new_item',
    }));
}

// ─── LLM fallback cascade ───────────────────────────────────────────────────

function buildPrompt(corpus, itemId) {
  return `You are an L2 Context Generation Engine. Analyze this content item and return ONLY valid JSON.

ITEM ID: ${itemId}

CONTENT CORPUS:
${corpus.slice(0, 4000)}

Return this exact JSON structure (fill every field, use null for unknowns):
{
  "item_id": "${itemId}",
  "l2_status": "completed",
  "semantic_summary": {
    "one_line": "one sentence summary",
    "detailed": "3-5 sentences of deeper context",
    "key_insight": "non-obvious takeaway"
  },
  "entities": [
    {"name": "...", "type": "person|org|tech|concept|tool|place", "salience": 0.0, "mentions": 0}
  ],
  "relationships": [
    {"source": "...", "relation": "...", "target": "...", "evidence": "quoted text", "confidence": 0.0}
  ],
  "content_analysis": {
    "sentiment": "positive|negative|neutral|mixed",
    "technical_depth": "high|medium|low",
    "actionable_items": ["..."],
    "contradictions_found": [],
    "knowledge_gaps": []
  },
  "cross_references": [],
  "raw_extractions": {
    "word_count": 0,
    "key_phrases": ["..."]
  }
}`;
}

async function tryGemini(prompt) {
  if (!config.gemini?.apiKey) throw new Error('no key');
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: prompt,
    generationConfig: { responseMimeType: 'application/json' },
  });
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty response');
  return text;
}

async function tryOpenAICompat(apiUrl, apiKey, model, prompt) {
  if (!apiKey) throw new Error('no key');
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty response');
  return text;
}

async function callLLMCascade(prompt, itemId) {
  const cascade = [
    {
      name: 'Gemini',
      fn: () => tryGemini(prompt),
    },
    {
      name: 'Groq',
      fn: () => tryOpenAICompat(
        'https://api.groq.com/openai/v1/chat/completions',
        config.llm?.groqKey,
        'llama-3.1-70b-versatile',
        prompt,
      ),
    },
    {
      name: 'Cerebras',
      fn: () => tryOpenAICompat(
        'https://api.cerebras.ai/v1/chat/completions',
        config.llm?.cerebrasKey,
        'llama-3.1-70b',
        prompt,
      ),
    },
    {
      name: 'OpenRouter',
      fn: () => tryOpenAICompat(
        'https://openrouter.ai/api/v1/chat/completions',
        config.llm?.openrouterKey,
        'meta-llama/llama-3.1-8b-instruct:free',
        prompt,
      ),
    },
  ];

  for (const { name, fn } of cascade) {
    try {
      const raw = await fn();
      // Strip markdown fences if any provider wraps output
      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(clean);
      logger.info(`L2: generated via ${name} for ${itemId}`);
      return { parsed, provider: name };
    } catch (err) {
      logger.warn(`L2: ${name} failed — ${err.message}`);
    }
  }

  // Hard fallback — minimal structure, no LLM
  return {
    parsed: null,
    provider: 'none',
  };
}

// ─── Main export ────────────────────────────────────────────────────────────

async function generateL2(item) {
  const corpus = buildCorpus(item);

  if (!corpus.trim()) {
    return {
      item_id:   item.id,
      l2_status: 'no_content',
      provider:  'none',
      error:     'No extractable text in this item',
    };
  }

  const prompt                = buildPrompt(corpus, item.id);
  const explicitLinks         = extractExplicitLinks(corpus, item.link_url || item.file_url);
  const { parsed, provider }  = await callLLMCascade(prompt, item.id);

  if (!parsed) {
    return {
      item_id:   item.id,
      l2_status: 'llm_unavailable',
      provider:  'none',
      corpus_preview: corpus.slice(0, 300),
      embedded_links_discovered: explicitLinks,
    };
  }

  // Merge explicit link extraction into LLM output
  parsed.embedded_links_discovered = [
    ...(parsed.embedded_links_discovered || []),
    ...explicitLinks,
  ].slice(0, 20);

  // Enrich word count if LLM skipped it
  if (!parsed.raw_extractions) parsed.raw_extractions = {};
  parsed.raw_extractions.word_count =
    parsed.raw_extractions.word_count || corpus.split(/\s+/).length;

  parsed.provider    = provider;
  parsed.l2_status   = 'completed';

  return parsed;
}

module.exports = { generateL2, buildCorpus };
