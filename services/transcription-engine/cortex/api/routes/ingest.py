from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from cortex.api.deps import get_engine, get_extractor, get_pipeline
from cortex.api.schemas import (
    AnalysisLevelEnum,
    AnalysisMetaResponse,
    AnalysisResponse,
    IngestResponse,
    SegmentResponse,
    TranscriptMetaResponse,
    TranscriptResponse,
)
from cortex.chunker import SmartRouter, TranscriptChunker
from cortex.intelligence.levels import AnalysisLevel
from cortex.processing.extractor import AudioExtractor
from cortex.transcription.formatter import TranscriptFormatter
from cortex.transcription.models import OutputFormat

router = APIRouter(tags=["ingest"])
logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma"}


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile = File(...),
    level: AnalysisLevelEnum = Form(AnalysisLevelEnum.L3),
    provider: str = Form(None),
    language: str = Form(None),
    output_format: OutputFormatEnum = Form(OutputFormatEnum.json),
    word_timestamps: bool = Form(False),
):
    suffix = Path(file.filename or "upload.mp4").suffix.lower()

    if suffix not in VIDEO_EXTENSIONS | AUDIO_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {suffix}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        if suffix in VIDEO_EXTENSIONS:
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

        # Token optimization
        chunker = TranscriptChunker()
        chunks = chunker.chunk(transcript)
        router_ = SmartRouter(max_words=4000)
        selected = router_.select_chunks(chunks)
        transcript.text = " ".join(c.text for c in selected)

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

        transcript_resp = TranscriptResponse(
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

        # Run L1, L2, L3 analysis
        analysis_results = {}
        pipeline = get_pipeline()

        for level_enum in [AnalysisLevelEnum.L1, AnalysisLevelEnum.L2, AnalysisLevelEnum.L3]:
            try:
                analysis_level = AnalysisLevel(level_enum.value)
                result = await pipeline.analyze(
                    transcript,
                    level=analysis_level,
                    provider_name=provider,
                )
                analysis_results[level_enum.value] = AnalysisResponse(
                    analysis=result.data,
                    meta=AnalysisMetaResponse(
                        level=result.level.value,
                        provider=result.provider,
                        model=result.model,
                        prompt_tokens=result.prompt_tokens,
                        completion_tokens=result.completion_tokens,
                    ),
                )
            except Exception as e:
                logger.warning("Analysis %s failed: %s", level_enum.value, e)
                analysis_results[level_enum.value] = None

        return IngestResponse(
            transcript=transcript_resp,
            analysis=analysis_results.get(level.value),
            l1_analysis=analysis_results.get("L1"),
            l2_analysis=analysis_results.get("L2"),
            l3_analysis=analysis_results.get("L3"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        tmp_path.unlink(missing_ok=True)
        if suffix in VIDEO_EXTENSIONS:
            audio_path.unlink(missing_ok=True)
