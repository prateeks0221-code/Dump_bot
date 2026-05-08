from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException

from cortex.api.deps import get_engine, get_extractor, get_pipeline
from cortex.api.schemas import (
    AnalysisLevelEnum,
    AnalysisMetaResponse,
    AnalysisResponse,
    IngestResponse,
    JobResponse,
    JobStatusEnum,
    SegmentResponse,
    TranscriptMetaResponse,
    TranscriptResponse,
    UrlIngestRequest,
)
from cortex.chunker import SmartRouter, TranscriptChunker
from cortex.downloader import download_media
from cortex.intelligence.levels import AnalysisLevel
from cortex.processing.extractor import AudioExtractor
from cortex.transcription.formatter import TranscriptFormatter
from cortex.transcription.models import OutputFormat

router = APIRouter(tags=["url-ingest"])
logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma"}


@router.post("/ingest/url", response_model=IngestResponse)
async def ingest_url(req: UrlIngestRequest):
    """Download media from URL, transcribe, and run intelligence analysis."""
    tmp_path: Path | None = None
    audio_path: Path | None = None

    try:
        # 1. Download
        logger.info("Downloading media from URL: %s", req.url)
        tmp_path = await download_media(req.url)
        suffix = tmp_path.suffix.lower()

        if suffix not in VIDEO_EXTENSIONS | AUDIO_EXTENSIONS:
            raise HTTPException(400, f"Downloaded unsupported format: {suffix}")

        # 2. Extract audio if video
        if suffix in VIDEO_EXTENSIONS:
            extractor = get_extractor()
            audio_path = tmp_path.with_suffix(".wav")
            await extractor.extract(tmp_path, output=audio_path)
        else:
            audio_path = tmp_path

        # 3. Transcribe
        engine = get_engine()
        transcript = engine.transcribe(
            audio_path,
            language=req.language,
            word_timestamps=req.word_timestamps,
        )

        # 4. Token optimization: chunk + smart route
        chunker = TranscriptChunker()
        chunks = chunker.chunk(transcript)
        router_ = SmartRouter(max_words=4000)
        selected = router_.select_chunks(chunks)
        optimized_text = " ".join(c.text for c in selected)

        # Update transcript text to optimized version for analysis
        transcript.text = optimized_text

        formatter = TranscriptFormatter()
        formatted = formatter.format(transcript, OutputFormat.MARKDOWN)

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
                source_file=req.url,
                duration_seconds=transcript.metadata.duration_seconds,
                language=transcript.metadata.language,
                language_probability=transcript.metadata.language_probability,
                model_size=transcript.metadata.model_size,
                num_segments=transcript.metadata.num_segments,
            ),
            formatted=formatted,
            word_count=transcript.word_count,
        )

        # 5. Run L1, L2, L3 analysis sequentially
        analysis_results = {}
        pipeline = get_pipeline()

        for level_enum in [AnalysisLevelEnum.L1, AnalysisLevelEnum.L2, AnalysisLevelEnum.L3]:
            try:
                level = AnalysisLevel(level_enum.value)
                result = await pipeline.analyze(
                    transcript,
                    level=level,
                    provider_name=req.provider,
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
                logger.warning("Analysis %s failed for URL %s: %s", level_enum.value, req.url, e)
                analysis_results[level_enum.value] = None

        return IngestResponse(
            transcript=transcript_resp,
            analysis=analysis_results.get(req.level.value),
            l1_analysis=analysis_results.get("L1"),
            l2_analysis=analysis_results.get("L2"),
            l3_analysis=analysis_results.get("L3"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("URL ingest failed: %s", e)
        raise HTTPException(500, str(e))
    finally:
        if tmp_path:
            tmp_path.unlink(missing_ok=True)
        if audio_path and audio_path != tmp_path:
            audio_path.unlink(missing_ok=True)
