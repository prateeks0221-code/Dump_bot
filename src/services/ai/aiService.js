const { Readable } = require('stream');
const config = require('../../config');
const logger = require('../../utils/logger');

let _openai = null;

function getOpenAI() {
  if (!config.openai.enabled || !config.openai.apiKey) return null;
  if (_openai) return _openai;
  const { OpenAI } = require('openai');
  _openai = new OpenAI({ apiKey: config.openai.apiKey });
  return _openai;
}

async function transcribeAudio(buffer, mimeType) {
  const openai = getOpenAI();
  if (!openai) return null;
  try {
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'mp3';
    const file = new File([buffer], `audio.${ext}`, { type: mimeType });
    const res = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    logger.info('AI: transcription complete');
    return res.text;
  } catch (err) {
    logger.error(`AI: transcription failed — ${err.message}`);
    return null;
  }
}

async function generateSummaryAndTags(text) {
  const openai = getOpenAI();
  if (!openai || !text) return { summary: null, tags: [] };
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a personal knowledge assistant. Return JSON with keys: summary (1 sentence), tags (array of 3-5 lowercase strings).',
        },
        { role: 'user', content: text.slice(0, 3000) },
      ],
      response_format: { type: 'json_object' },
    });
    const parsed = JSON.parse(res.choices[0].message.content);
    logger.info('AI: summary + tags generated');
    return { summary: parsed.summary || null, tags: parsed.tags || [] };
  } catch (err) {
    logger.error(`AI: summary/tags failed — ${err.message}`);
    return { summary: null, tags: [] };
  }
}

module.exports = { transcribeAudio, generateSummaryAndTags };
