# Dirty Desk — Codebase Audit

## 1. How do I fetch today's dumps?

**Primary API endpoint (already exists):**
```
GET /api/desk/items?processed=false&limit=100
```

**Exact code path:**
1. `src/index.js` mounts `deskApiRoutes` at `/api/desk`
2. `src/routes/api/desk.js` → `router.get('/items', ...)`
3. Uses `@notionhq/client` to query the Notion database:
   ```js
   notion.databases.query({
     database_id: config.notion.databaseId,
     filter: { property: 'processed', checkbox: { equals: false } },
     sorts: [{ property: 'timestamp', direction: 'descending' }],
     page_size: limit,
   })
   ```
4. Results are normalized via `normalizeItem()` and returned as JSON: `{ items: [...], total: N }`

**Important:** This endpoint currently returns **all unprocessed items** (not filtered to "today"). For the Dirty Desk, we can either:
- Add a `?since=YYYY-MM-DD` filter to this endpoint (minimal backend change), **or**
- Fetch all unprocessed items and filter client-side by `timestamp`.

**No direct Drive/Notion queries from frontend** — the existing backend proxies everything. There is no Drive folder listing API; Drive files are linked per-item via `drive_file_id` + `file_url`.

---

## 2. What data fields are available?

From `src/routes/api/desk.js` → `normalizeItem(page)`:

| Field | Source | Type | Example |
|-------|--------|------|---------|
| `id` | `page.id` | string | Notion page UUID |
| `title` | `properties.title` | string | First 80 chars of text/caption |
| `type` | `properties.type` (select) | string | `audio`, `file`, `image`, `video`, `link`, `text`, `unknown` |
| `timestamp` | `properties.timestamp` (date) | ISO string | `2026-04-28T14:30:00.000Z` |
| `processed` | `properties.processed` (checkbox) | boolean | `false` |
| `raw_content` | `properties.raw_content` (rich_text) | string | Full text/caption (max 2000 chars) |
| `summary` | `properties.summary` (rich_text) | string | AI-generated 1-sentence summary |
| `tags` | `properties.tags` (multi_select) | string[] | `["ai", "productivity", "news"]` |
| `file_url` | `properties.file_url` (URL) | string | Google Drive `webViewLink` |
| `drive_file_id` | `properties.drive_file_id` (rich_text) | string | Google Drive file ID |
| `link_kind` | `properties.link_kind` (select) | string | `twitter`, `github`, `youtube`, `reddit`, `linkedin`, `article`, `producthunt`, `notion`, `figma`, `gdoc`, `markdown`, `link` |
| `link_url` | `properties.link_url` (URL) | string | Extracted URL from text |
| `og_title` | `properties.og_title` (rich_text) | string | OpenGraph title |
| `og_description` | `properties.og_description` (rich_text) | string | OpenGraph description |
| `og_image` | `properties.og_image` (URL) | string | OpenGraph image URL |
| `og_site` | `properties.og_site` (rich_text) | string | Site name (e.g. "GitHub") |
| `notion_url` | `page.url` | string | Direct link to Notion page |
| `last_edited` | `page.last_edited_time` | ISO string | Last edit timestamp |

**Bonus:** There is also a `PATCH /api/desk/items/:id` endpoint to mark `processed=true`, and `POST /api/desk/items/:id/unfurl` to retry OG metadata extraction.

---

## 3. What dump types exist?

**Core message types** (`src/utils/fileHelpers.js` → `detectMessageType`):
1. `audio` — voice messages & audio files
2. `file` — documents (PDFs, DOCX, TXT, etc.)
3. `image` — photos
4. `video` — videos
5. `link` — text containing `http(s)://`
6. `text` — plain text without URLs
7. `unknown` — fallback

**Link sub-types** (`src/services/link/linkService.js` → `classifyUrl`):
- `twitter` (twitter.com / x.com)
- `github` (github.com)
- `youtube` (youtube.com / youtu.be)
- `reddit` (reddit.com)
- `linkedin` (linkedin.com)
- `article` (medium.com / substack.com)
- `producthunt` (producthunt.com)
- `notion` (notion.so)
- `figma` (figma.com)
- `gdoc` (docs.google.com)
- `markdown` (`.md` / `.mdx` files)
- `link` — generic fallback

**File MIME types supported** (`src/utils/fileHelpers.js`):
- `audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/wav`
- `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- `video/mp4`
- `application/pdf`
- `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `text/plain`

---

## 4. What is the auth model?

**No user auth / login system exists.** The backend uses service-to-service auth via environment variables.

| Service | Auth Type | Env Vars |
|---------|-----------|----------|
| **Notion** | Integration token (secret) | `NOTION_TOKEN` |
| **Google Drive** | Service account JWT | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` |
| **Telegram** | Bot token + optional webhook secret | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` |
| **OpenAI** | API key | `OPENAI_API_KEY` |

**For the Dirty Desk frontend:**
- The React app will be served from the same Express origin (`localhost:3000`), so **no CORS issues**.
- It can call `/api/desk/items` directly — the backend already holds the Notion token.
- No auth token needed in the browser.

---

## 5. Where should the frontend live?

**Current state:**
- There is **already a working frontend** at `public/desk/index.html`
- It is served statically by Express (`app.use(express.static('public'))`)
- The `/desk` route (`src/routes/desk.js`) explicitly serves this file
- It is a single vanilla-JS file (~23KB) with a "lamp-lit desk" aesthetic (warm browns, serif fonts, scatter/stack/list/timeline views)
- It already fetches from `/api/desk/items`, supports keyboard shortcuts (j/k, d, o, f, 1-4), filtering, selection, and marking items done

**Recommendation:**
Build the new Dirty Desk as a **React + Vite app in a `frontend/` folder** at repo root, then build it into `public/desk/` (replacing the existing `index.html`). This gives us:
- Clean separation: React source in `frontend/`, static build output in `public/desk/`
- Zero changes to Express routing (`/desk` already works)
- Easy to iterate: `cd frontend && npm run dev` for local dev, `npm run build` to deploy

**Alternative (faster):** Just iterate on the existing `public/desk/index.html` vanilla JS file. It's already functional and dark-themed. However, the mission specifically asks for React + Vite + Tailwind, so the `frontend/` → `public/desk/` build pipeline is the right call.

**No new backend needed.** The existing `/api/desk/items` and `/api/desk/items/:id` endpoints cover read + mark-read operations. We only need to add a date filter (e.g. `?since=today`) if we want to strictly limit to today's dumps.
