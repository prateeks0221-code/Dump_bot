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
| Logs | Winston |

---

## Project Structure

```
src/
├── index.js                        # Bootstrap, webhook register, poller start
├── config/index.js                 # All env vars
├── routes/
│   ├── telegram.js                 # POST /telegram/webhook
│   └── health.js                   # GET /health
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
│   └── ai/aiService.js             # Whisper + GPT tagging
└── utils/
    ├── logger.js                   # Winston
    └── fileHelpers.js              # Type detect, filename builder, subfolder router
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
npm run dev
npx ngrok http 3000
# set WEBHOOK_URL to the ngrok https URL → restart
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
