const { customAlphabet } = require('nanoid');

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const MIME_TO_EXT = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

function detectMessageType(msg) {
  if (msg.voice) return 'audio';
  if (msg.audio) return 'audio';
  if (msg.document) return 'file';
  if (msg.photo) return 'image';
  if (msg.video) return 'video';
  if (msg.text && /https?:\/\//.test(msg.text)) return 'link';
  if (msg.text) return 'text';
  return 'unknown';
}

function driveSubfolder(mimeType, type) {
  if (type === 'audio' || (mimeType && mimeType.startsWith('audio/'))) return 'audio';
  if (
    type === 'image' ||
    type === 'video' ||
    (mimeType && (mimeType.startsWith('image/') || mimeType.startsWith('video/')))
  )
    return 'assets';
  return 'docs';
}

function buildFileName(type, mimeType, originalName) {
  const ts = Date.now();
  const id = nanoid();
  const ext =
    MIME_TO_EXT[mimeType] ||
    (originalName && originalName.includes('.') ? originalName.split('.').pop() : 'bin');
  return `${ts}_${type}_${id}.${ext}`;
}

module.exports = { detectMessageType, driveSubfolder, buildFileName };
