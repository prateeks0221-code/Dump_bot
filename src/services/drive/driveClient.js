const { google } = require('googleapis');
const config = require('../../config');

let _drive = null;

function getDrive() {
  if (_drive) return _drive;
  const auth = new google.auth.JWT({
    email: config.google.clientEmail,
    key: config.google.privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

module.exports = { getDrive };
