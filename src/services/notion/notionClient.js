const { Client } = require('@notionhq/client');
const config = require('../../config');

let _client = null;

function getNotion() {
  if (_client) return _client;
  _client = new Client({ auth: config.notion.token });
  return _client;
}

module.exports = { getNotion };
