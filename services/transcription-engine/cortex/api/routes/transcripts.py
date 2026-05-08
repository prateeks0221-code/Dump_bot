from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from cortex.api.deps import get_engine, get_extractor
from cortex.api.schemas import (
    OutputFormatEnum,
    SegmentResponse,
    TranscriptMetaResponse,
    TranscriptResponse,
)
from cortex.processing.extractor import AudioExtractor
from cortex.transcription.formatter import TranscriptFormatter
from cortex.transcription.models import OutputFormat

router = APIRouter(tags=["transcripts"])

MEDIA_EXTENSIONS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v",
    ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac",
}


@router.post("/transcribe", response_model=TranscriptResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(None),
    output_format: OutputFormatEnum = Form(OutputFormatEnum.json),
    word_timestamps: bool = Form(False),
):
    suffix = Path(file.filename or "upload.mp4").suffix.lower()
    if suffix not in MEDIA_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {suffix}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        video_exts = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}
        if suffix in video_exts:
            extractor = get_extractor()
            audio_path = tmp_path.with_suffix(".wav")
            await extractor.extract(tmp_path, output=audio_path)
        else:
            audio_path = tmp_path

        engine = get_engine()
        transcript = engine.transcribe(
            audio_path,
            language=language,
            word_timestamps=word_timestamps,
        )

        formatter = TranscriptFormatter()
        fmt = OutputFormat(output_format.value)
        formatted = formatter.format(transcript, fmt)

        segments = [
            SegmentResponse(
                id=s.id,
                start=s.start,
                end=s.end,
                text=s.text,
                confidence=s.confidence,
                language=s.language,
                speaker=s.speaker,
            )
            for s in transcript.segments
        ]

        return TranscriptResponse(
            text=transcript.text,
            segments=segments,
            metadata=TranscriptMetaResponse(
                source_file=file.filename or "",
                duration_seconds=transcript.metadata.duration_seconds,
                language=transcript.metadata.language,
                language_probability=transcript.metadata.language_probability,
                model_size=transcript.metadata.model_size,
                num_segments=transcript.metadata.num_segments,
            ),
            formatted=formatted,
            word_count=transcript.word_count,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        tmp_path.unlink(missing_ok=True)
        if suffix in video_exts and audio_path != tmp_path:
            audio_path.unlink(missing_ok=True)
