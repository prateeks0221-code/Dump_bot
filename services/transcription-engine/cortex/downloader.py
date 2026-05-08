"""Media downloader for URLs (YouTube, Instagram, direct links)."""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# yt-dlp is imported lazily so the module loads even if it's not installed

YTDLP_OPTS = {
    "format": "bestaudio/best",
    "outtmpl": "%(id)s.%(ext)s",
    "quiet": True,
    "no_warnings": True,
    "extract_audio": False,
    "headers": {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    },
}


def _is_youtube(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return any(h in host for h in ("youtube.com", "youtu.be", "youtube-nocookie.com"))


def _is_instagram(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return "instagram.com" in host


def _is_direct_media(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.endswith((".mp3", ".wav", ".mp4", ".mov", ".mkv", ".m4a", ".flac", ".ogg", ".webm"))


async def download_media(url: str, output_dir: Optional[Path] = None) -> Path:
    """Download media from URL to a local file. Returns the path."""
    output_dir = output_dir or Path(tempfile.gettempdir())
    output_dir.mkdir(parents=True, exist_ok=True)

    if _is_youtube(url) or _is_instagram(url):
        return await _download_with_ytdlp(url, output_dir)

    if _is_direct_media(url):
        return await _download_direct(url, output_dir)

    # Fallback: try yt-dlp for any URL
    try:
        return await _download_with_ytdlp(url, output_dir)
    except Exception as e:
        logger.warning("yt-dlp fallback failed for %s: %s", url, e)

    raise ValueError(f"Unsupported URL or unable to download: {url}")


async def _download_with_ytdlp(url: str, output_dir: Path) -> Path:
    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("yt-dlp is required for URL downloading. Install: pip install yt-dlp") from exc

    opts = {
        **YTDLP_OPTS,
        "outtmpl": str(output_dir / "%(id)s.%(ext)s"),
        "cookiefile": None,
    }

    def _run():
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            return Path(filename)

    # yt-dlp is sync; run in thread to avoid blocking the event loop
    import asyncio
    path = await asyncio.get_event_loop().run_in_executor(None, _run)

    if not path.exists():
        # yt-dlp may have changed extension (e.g., .webm -> .m4a with extract_audio)
        candidates = list(output_dir.glob(f"{path.stem}.*"))
        if candidates:
            path = candidates[0]
        else:
            raise FileNotFoundError(f"yt-dlp reported success but file not found: {path}")

    logger.info("Downloaded via yt-dlp: %s -> %s", url, path)
    return path


async def _download_direct(url: str, output_dir: Path) -> Path:
    ext = Path(urlparse(url).path).suffix or ".bin"
    tmp_path = output_dir / f"direct_{hash(url) & 0xFFFFFFFF}{ext}"

    async with httpx.AsyncClient(follow_redirects=True, timeout=300) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        tmp_path.write_bytes(resp.content)

    logger.info("Downloaded direct: %s -> %s (%d bytes)", url, tmp_path, tmp_path.stat().st_size)
    return tmp_path
