const config = require('../../config');
const logger = require('../../utils/logger');

let _gemini = null;

function getGemini() {
  if (!config.gemini.enabled || !config.gemini.apiKey) return null;
  if (_gemini) return _gemini;
  const { GoogleGenAI } = require('@google/genai');
  _gemini = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return _gemini;
}

async function transcribeAudio(buffer, mimeType) {
  // Gemini supports audio inline; encode as base64
  const ai = getGemini();
  if (!ai) return null;
  try {
    const base64 = buffer.toString('base64');
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            { text: 'Transcribe this audio exactly as spoken. Return only the transcript text.' },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
    });
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    logger.info('AI: transcription complete');
    return text || null;
  } catch (err) {
    logger.error(`AI: transcription failed — ${err.message}`);
    return null;
  }
}

async function generateSummaryAndTags(text) {
  const ai = getGemini();
  if (!ai || !text) return { summary: null, tags: [] };
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            {
              text: `You are a personal knowledge assistant. Return valid JSON with keys: summary (1 sentence), tags (array of 3-5 lowercase strings).\n\n${text.slice(0, 3000)}`,
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(raw);
    logger.info('AI: summary + tags generated');
    return { summary: parsed.summary || null, tags: parsed.tags || [] };
  } catch (err) {
    logger.error(`AI: summary/tags failed — ${err.message}`);
    return { summary: null, tags: [] };
  }
}

module.exports = { transcribeAudio, generateSummaryAndTags };
