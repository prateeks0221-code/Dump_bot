# Dump_bot 🤖

A production-ready personal data ingestion backend.  
Send anything to your Telegram bot — text, voice, images, files, links — and it lands automatically in **Google Drive** and **Notion**, optionally transcribed and tagged by AI.

---

## Architecture

```
Telegram Message
      │
      ▼
Express Webhook
      │
   type detect
      │
  ┌───┴────────────────────┐
  │                        │
Drive Upload            Notion Entry
(Master_Dump/)    {title, type, timestamp,
                   file_url, raw_content,
                   message_id, drive_file_id}
      │                        │
      │                  AI Enrichment
      │               (Whisper + GPT-4o-mini)
      │                        │
      └─────── Notion Poller (30s) ──────────┐
                    │ Story assigned?         │
                    ▼                         │
          Stories/{Name}/{subfolder}/    Master_Dump/
```

---

## Features

- **Telegram webhook** — text, voice, audio, image, video, file, link
- **Google Drive** — all files land in `Master_Dump/`; auto-moved to `Stories/{Name}/{audio|assets|docs}/` when a Story is assigned in Notion
- **Notion database** — one entry per message; idempotent (deduped by `message_id`)
- **Safe patching** — never overwrites user-edited fields (title, tags, summary, story)
- **AI optional** — Whisper transcription for voice; GPT-4o-mini summary + tags
- **Notion poller** — detects Story relation changes and syncs Drive file location
- **Clean filenames** — `{timestamp}_{type}_{nanoid8}.{ext}`

---

## Stack

| Layer | Tech |
|---|---|
| Server | Node.js 18 + Express |
| Bot | Telegram Bot API (webhook) |
| Storage | Google Drive API v3 (service account) |
| Database | Notion API + `@notionhq/client` |
| AI | OpenAI Whisper + GPT-4o-mini (optional) |
| Desk | React + Vite + Tailwind (dark UI) |
| Logs | Winston |

---

## Project Structure

```
src/
├── index.js                        # Bootstrap, webhook register, poller start
├── config/index.js                 # All env vars
├── routes/
│   ├── telegram.js                 # POST /telegram/webhook
│   ├── health.js                   # GET /health
│   ├── desk.js                     # Serves the Desk UI
│   └── api/desk.js                 # REST API for Desk data
├── controllers/
│   └── telegramController.js       # Core ingestion flow
├── services/
│   ├── telegram/telegramClient.js  # getFile, sendMessage, setWebhook
│   ├── drive/
│   │   ├── driveClient.js          # JWT singleton
│   │   └── driveService.js         # upload / move / folder creation
│   ├── notion/
│   │   ├── notionClient.js         # SDK singleton
│   │   ├── notionService.js        # CRUD, safe-patch, poller queries
│   │   └── notionPoller.js         # Polling loop → Drive sync
│   ├── link/linkService.js         # OG unfurl + link classification
│   └── ai/aiService.js             # Whisper + GPT tagging
└── utils/
    ├── logger.js                   # Winston
    └── fileHelpers.js              # Type detect, filename builder, subfolder router

frontend/                           # React source (Vite + Tailwind)
public/desk/                        # Built static assets (served by Express)
```

---

## Notion Database Schema

| Property | Type | Notes |
|---|---|---|
| title | Title | Auto-set; never overwritten |
| type | Select | text / audio / image / video / file / link |
| timestamp | Date | Message date |
| message_id | Text | Dedup key |
| file_url | URL | Google Drive web link |
| raw_content | Text | Message text or transcription |
| drive_file_id | Text | Drive file ID for move operations |
| summary | Text | AI-generated (only if empty) |
| tags | Multi-select | AI-generated (only if empty) |
| story | Relation | → Stories database |
| processed | Checkbox | Manual flag |

---

## Setup

### 1 — Clone & install

```bash
git clone https://github.com/prateeks0221-code/Dump_bot.git
cd Dump_bot
cp .env.example .env
npm install
```

### 2 — Fill `.env`

```env
TELEGRAM_BOT_TOKEN=        # @BotFather → /newbot
TELEGRAM_WEBHOOK_SECRET=   # any random string
WEBHOOK_URL=               # https://your-domain (Railway / ngrok)

GOOGLE_CLIENT_EMAIL=       # service account client_email
GOOGLE_PRIVATE_KEY=        # service account private_key (quoted, \n escaped)
GOOGLE_DRIVE_MASTER_FOLDER_ID=   # Drive folder ID
GOOGLE_DRIVE_STORIES_FOLDER_ID=  # Drive folder ID

NOTION_TOKEN=              # Internal integration token
NOTION_DATABASE_ID=        # Database UUID from URL

OPENAI_API_KEY=            # optional
OPENAI_ENABLED=true        # set false to skip AI
```

> Full step-by-step: see [SETUP.md](SETUP.md)

### 3 — Run locally

```bash
npm install
npm run build:desk    # build the Dirty Desk UI
npm run dev
npx ngrok http 3000
# set WEBHOOK_URL to the ngrok https URL → restart
```

Open the Desk at `http://localhost:3000/desk`


---

## Dirty Desk 🖥️

A read-only dark UI to triage today's Telegram dumps. Built with React + Vite + Tailwind.

### Features

- **Dark theme** — `#0f0f11` background, dense card grid
- **Zero-click preview** — thumbnails, OG unfurls, text previews, file badges
- **Time groups** — Morning / Afternoon / Evening / Night
- **Filter pills** — All · Links · Images · Files · Notes
- **Real-time search** — filters across title, content, tags, type
- **Per-card actions** — Mark read · Copy link · Open original · Archive
- **Auto-refresh** — polls for new dumps every 60 seconds
- **Image lightbox** — click any image thumbnail to expand

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/desk/items?today=true&limit=200` | Fetch today's dumps from Notion |
| PATCH | `/api/desk/items/:id` | Mark processed / update fields |
| POST | `/api/desk/items/:id/unfurl` | Retry OG metadata extraction |

### How it works

1. The Desk reads from your existing **Notion database** via the backend proxy (`/api/desk/items`)
2. No new database — the Notion DB is the single source of truth
3. Archive state is stored in `localStorage` (soft delete, local only)
4. Mark-read writes back to Notion via `PATCH /api/desk/items/:id`

### Running the Desk

```bash
# Development (hot reload on localhost:5173)
cd frontend
npm install
npm run dev

# Production build (outputs to public/desk/)
npm run build

# Or from repo root
npm run build:desk
```

---

## Deploy to Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway variables set TELEGRAM_BOT_TOKEN=xxx   # repeat for all vars
railway up
```

Railway auto-detects Node.js and runs `npm start`.  
The webhook is registered automatically on every boot.

---

## Drive → Story Sync

The poller runs every 30 s (`NOTION_POLL_INTERVAL_MS`).

| Action in Notion | Result in Drive |
|---|---|
| Assign Story relation | File moves → `Stories/{Name}/{subfolder}/` |
| Remove Story relation | File moves back → `Master_Dump/` |
| Change to different Story | File moves to new story folder |

Subfolder routing: `audio/ · assets/ · docs/`

---

## Versioning

This project follows [Semantic Versioning](https://semver.org).  
See [CHANGELOG.md](CHANGELOG.md) for release history.

---

## License

MIT
