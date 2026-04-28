# Setup & Deployment Guide

## 1. Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **token**
2. The webhook is registered automatically on startup via `setWebhook`
3. Set `TELEGRAM_WEBHOOK_SECRET` to any random string (e.g. `openssl rand -hex 20`)

---

## 2. Google Drive — Service Account

1. [Google Cloud Console](https://console.cloud.google.com) → New project (or reuse)
2. **APIs & Services → Enable** → enable **Google Drive API**
3. **IAM → Service Accounts → Create**
   - Download JSON key
   - Copy `client_email` → `GOOGLE_CLIENT_EMAIL`
   - Copy `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` escapes)
4. In Google Drive:
   - Create folder **Master_Dump** → share with service account email (Editor)
   - Create folder **Stories** → share the same way
   - Copy each folder's ID from the URL (`?id=XXXX`) → env vars

---

## 3. Notion Integration

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
   - Copy **Internal Integration Token** → `NOTION_TOKEN`
2. Create a **Database** (full page) with these properties:

| Property      | Type         |
|---------------|--------------|
| title         | Title        |
| type          | Select       |
| timestamp     | Date         |
| message_id    | Text         |
| file_url      | URL          |
| raw_content   | Text         |
| drive_file_id | Text         |
| summary       | Text         |
| tags          | Multi-select |
| story         | Relation → another DB (Stories) |
| processed     | Checkbox     |

3. Share the database with your integration (top-right → Share → invite integration)
4. Copy database ID from URL: `notion.so/{workspace}/{DATABASE_ID}?v=...`

---

## 4. OpenAI (optional)

- Set `OPENAI_API_KEY` and `OPENAI_ENABLED=true`
- Audio → transcribed by **Whisper**
- Text/transcription → summarised + tagged by **gpt-4o-mini**

---

## 5. Local Development

```bash
cp .env.example .env
# fill in all values
npm install
npm run dev
# expose local port with ngrok:
npx ngrok http 3000
# set WEBHOOK_URL to the ngrok https URL, restart
```

---

## 6. Deploy to Railway

```bash
npm install -g @railway/cli
railway login
railway init          # link to project
railway up            # first deploy

# Set env vars:
railway variables set TELEGRAM_BOT_TOKEN=xxx
railway variables set TELEGRAM_WEBHOOK_SECRET=xxx
railway variables set WEBHOOK_URL=https://your-app.up.railway.app
railway variables set GOOGLE_CLIENT_EMAIL=xxx
railway variables set GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n"
railway variables set GOOGLE_DRIVE_MASTER_FOLDER_ID=xxx
railway variables set GOOGLE_DRIVE_STORIES_FOLDER_ID=xxx
railway variables set NOTION_TOKEN=xxx
railway variables set NOTION_DATABASE_ID=xxx
railway variables set OPENAI_API_KEY=xxx
railway variables set OPENAI_ENABLED=true
railway variables set PORT=3000

railway up            # redeploy with vars
```

Railway will auto-detect Node.js and run `npm start`.  
The webhook URL will be the Railway-assigned domain.

---

## 7. Notion → Drive Sync (Story assignment)

The poller runs every 30 s (configurable via `NOTION_POLL_INTERVAL_MS`).

- Assign a **Story** relation on any Notion entry → file moves to `Stories/{Name}/{subfolder}/`
- Remove the relation → file returns to `Master_Dump`
- Change the relation to a different story → file moves to the new story folder

Subfolder routing:
| File type       | Subfolder |
|-----------------|-----------|
| audio / voice   | audio/    |
| image / video   | assets/   |
| pdf / doc / txt | docs/     |
