const { Readable } = require('stream');
const axios = require('axios');          // npm install axios
const FormData = require('form-data');   // npm install form-data
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

/* ------------------------------------------------------------------ */
/*  NEW: Local faster-whisper STT service (your RTX 3050)             */
/* ------------------------------------------------------------------ */
async function transcribeViaLocalSTT(buffer, filename, mimeType) {
  const sttUrl = process.env.STT_SERVICE_URL; // e.g. https://abc.ngrok.io
  if (!sttUrl) return null;

  try {
    const form = new FormData();
    form.append('file', buffer, {
      filename: filename || `media.${mimeType.split('/')[1] || 'bin'}`,
      contentType: mimeType,
    });

    const { data } = await axios.post(`${sttUrl}/transcribe`, form, {
      headers: form.getHeaders(),
      timeout: 300000,        // 5 min for long videos
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.info('AI: local STT transcription complete');
    return data.transcript || data.markdown || null;
  } catch (err) {
    logger.error(`AI: local STT failed — ${err.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  PATCHED: Audio transcription (voice messages, audio files)        */
/* ------------------------------------------------------------------ */
async function transcribeAudio(buffer, mimeType, filename = null) {
  // 1st priority: your local GPU service (works for audio + video)
  const local = await transcribeViaLocalSTT(buffer, filename, mimeType);
  if (local) return local;

  // 2nd priority: OpenAI Whisper API (fallback)
  const openai = getOpenAI();
  if (!openai) return null;

  try {
    const ext = mimeType.includes('ogg') ? 'ogg'
              : mimeType.includes('mp4') ? 'mp4'
              : 'mp3';
    const file = new File([buffer], filename || `audio.${ext}`, { type: mimeType });

    const res = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    logger.info('AI: OpenAI transcription complete');
    return res.text;
  } catch (err) {
    logger.error(`AI: transcription failed — ${err.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  NEW: Video transcription (no OpenAI fallback for video files)     */
/* ------------------------------------------------------------------ */
async function transcribeVideo(buffer, mimeType, filename) {
  // OpenAI Whisper API doesn't accept raw video; local STT is required
  const local = await transcribeViaLocalSTT(buffer, filename, mimeType);
  if (local) return local;

  logger.warn('AI: no local STT available for video; skipping transcription');
  return null;
}

/* ------------------------------------------------------------------ */
/*  UNCHANGED: GPT summary + tags                                     */
/* ------------------------------------------------------------------ */
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

module.exports = {
  transcribeAudio,
  transcribeVideo,        // NEW
  generateSummaryAndTags,
};