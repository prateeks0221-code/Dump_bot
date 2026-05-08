from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from cortex.config import Settings, get_settings

logger = logging.getLogger(__name__)

SUPPORTED_MEDIA = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v",
    ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma",
}


class AudioExtractor:
    """Extract and normalize audio from media files using FFmpeg."""

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or get_settings()
        self._ffmpeg = self._find_ffmpeg()

    def _find_ffmpeg(self) -> str:
        if self._settings.ffmpeg_path:
            return self._settings.ffmpeg_path

        manual_paths = [
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        ]
        for p in manual_paths:
            if Path(p).exists():
                return p

        found = shutil.which("ffmpeg")
        if found:
            return found

        raise RuntimeError(
            "FFmpeg not found. Set FFMPEG_PATH env var, install to C:\\ffmpeg, or add to PATH."
        )

    async def extract(
        self,
        source: Path,
        *,
        output: Optional[Path] = None,
        sample_rate: int = 16000,
        mono: bool = True,
    ) -> Path:
        if not source.exists():
            raise FileNotFoundError(f"Source not found: {source}")

        if source.suffix.lower() not in SUPPORTED_MEDIA:
            raise ValueError(f"Unsupported format: {source.suffix}")

        if output is None:
            output = source.with_suffix(".wav")

        cmd = [
            self._ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel", "error",
            "-i", str(source),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", str(sample_rate),
        ]
        if mono:
            cmd.extend(["-ac", "1"])
        cmd.append(str(output))

        logger.info("Extracting audio: %s -> %s", source.name, output.name)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace")
            if "does not contain any stream" in err or "Invalid argument" in err:
                raise RuntimeError(f"No audio track in: {source.name}")
            raise RuntimeError(
                f"FFmpeg failed for {source.name} (exit {proc.returncode}): {err}"
            )

        logger.info("Audio extracted: %s (%.1f MB)", output.name, output.stat().st_size / 1e6)
        return output

    def extract_sync(
        self,
        source: Path,
        *,
        output: Optional[Path] = None,
        sample_rate: int = 16000,
        mono: bool = True,
    ) -> Path:
        return asyncio.get_event_loop().run_until_complete(
            self.extract(source, output=output, sample_rate=sample_rate, mono=mono)
        )

    async def probe_duration(self, source: Path) -> float:
        ffprobe = self._ffmpeg.replace("ffmpeg", "ffprobe")
        cmd = [
            ffprobe,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        try:
            return float(stdout.decode().strip())
        except ValueError:
            return 0.0

    @staticmethod
    def is_supported(path: Path) -> bool:
        return path.suffix.lower() in SUPPORTED_MEDIA
