const fetch = require('node-fetch');
const logger = require('../../utils/logger');

const KIND_RULES = [
  [/twitter\.com|x\.com/, 'twitter'],
  [/github\.com/, 'github'],
  [/youtube\.com|youtu\.be/, 'youtube'],
  [/instagram\.com/, 'instagram'],
  [/tiktok\.com/, 'tiktok'],
  [/reddit\.com/, 'reddit'],
  [/linkedin\.com/, 'linkedin'],
  [/medium\.com|substack\.com/, 'article'],
  [/producthunt\.com/, 'producthunt'],
  [/notion\.so/, 'notion'],
  [/figma\.com/, 'figma'],
  [/docs\.google\.com/, 'gdoc'],
  [/\.(md|mdx)($|\?)/, 'markdown'],
];

function classifyUrl(url) {
  try {
    for (const [pattern, kind] of KIND_RULES) {
      if (pattern.test(url)) return kind;
    }
    return 'link';
  } catch {
    return 'link';
  }
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

// For Instagram/social captions that arrive as full caption text,
// extract the first meaningful sentence (up to 120 chars).
function cleanSocialTitle(raw) {
  if (!raw) return null;
  const decoded = decodeHtmlEntities(raw);
  // Strip @handle prefix pattern "Name on Platform: "caption""
  const withoutHandle = decoded.replace(/^.+? on \w+:\s*[""]?/i, '').replace(/[""]$/, '').trim();
  const text = withoutHandle || decoded;
  // First non-empty line or first sentence
  const firstLine = text.split(/\n/)[0].trim();
  const trimmed = firstLine.length > 10 ? firstLine : text.replace(/\n+/g, ' ').trim();
  return trimmed.length > 120 ? trimmed.slice(0, 117) + '…' : trimmed;
}

function extractOg(html) {
  const get = (prop) => {
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"'<>]+)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
    return m ? decodeHtmlEntities(m[1].trim()) : null;
  };

  const rawTitle = get('og:title') || get('twitter:title') ||
    decodeHtmlEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()) || null;

  return {
    title: cleanSocialTitle(rawTitle),
    description: get('og:description') || get('twitter:description') || null,
    image: get('og:image') || get('twitter:image') || null,
    siteName: get('og:site_name') || null,
  };
}

async function unfurlUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DumpBot/1.0)' },
      redirect: 'follow',
      timeout: 8000,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;
    const html = await res.text();
    return extractOg(html);
  } catch (err) {
    logger.warn(`linkService: unfurl failed ${url} — ${err.message}`);
    return null;
  }
}

function extractFirstUrl(text) {
  const m = text && text.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : null;
}

async function enrichLink(rawContent) {
  const url = extractFirstUrl(rawContent);
  if (!url) return null;

  const kind = classifyUrl(url);
  const og = await unfurlUrl(url);

  return {
    link_kind: kind,
    link_url: url,
    og_title: og?.title || null,
    og_description: og?.description || null,
    og_image: og?.image || null,
    og_site: og?.siteName || null,
  };
}

module.exports = { enrichLink, classifyUrl, extractFirstUrl };
