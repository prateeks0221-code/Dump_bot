# Changelog

All notable changes to this project will be documented in this file.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning: [SemVer](https://semver.org).

---

## [1.0.0] - 2026-04-28

### Added
- Telegram webhook: text, voice, audio, image, video, file, link ingestion
- Google Drive upload to `Master_Dump/` via service account JWT
- Notion entry creation with idempotency via `message_id`
- Safe-patch logic — never overwrites user-edited Notion fields
- Notion poller (configurable interval) detecting Story relation changes
- Drive file move to `Stories/{Name}/{audio|assets|docs}/` on Story assign
- Drive file return to `Master_Dump/` on Story removal
- OpenAI Whisper transcription for voice/audio (optional)
- GPT-4o-mini summary + tag generation (optional, empty-fields-only)
- Winston structured logging
- `/health` endpoint
- Railway-ready deployment config
