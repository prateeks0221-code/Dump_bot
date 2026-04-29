const axios = require('axios');
const path = require('path');   // ADDED
const config = require('../../config');

const BASE = `https://api.telegram.org/bot${config.telegram.token}`;
const FILE_BASE = `https://api.telegram.org/file/bot${config.telegram.token}`;

async function getFileBuffer(fileId) {
  const { data } = await axios.get(`${BASE}/getFile`, { params: { file_id: fileId } });
  const filePath = data.result.file_path;
  const res = await axios.get(`${FILE_BASE}/${filePath}`, { responseType: 'arraybuffer' });
  
  return {
    buffer: Buffer.from(res.data),
    filePath,
    filename: path.basename(filePath),   // ADDED: e.g. "file_123.mp4"
  };
}

async function sendMessage(chatId, text) {
  return axios.post(`${BASE}/sendMessage`, { chat_id: chatId, text });
}

async function setWebhook(url, secret) {
  return axios.post(`${BASE}/setWebhook`, {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
  });
}

module.exports = { getFileBuffer, sendMessage, setWebhook };