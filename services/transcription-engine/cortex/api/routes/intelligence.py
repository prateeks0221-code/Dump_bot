from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from cortex.api.deps import get_pipeline, get_registry
from cortex.api.schemas import (
    AnalysisLevelEnum,
    AnalysisMetaResponse,
    AnalysisResponse,
    AnalyzeRequest,
)
from cortex.intelligence.levels import AnalysisLevel
from cortex.transcription.models import Transcript, TranscriptMetadata, Segment

router = APIRouter(tags=["intelligence"])


def _text_to_transcript(text: str) -> Transcript:
    return Transcript(
        segments=[Segment(id=0, start=0.0, end=0.0, text=text)],
        metadata=TranscriptMetadata(
            num_segments=1,
            duration_seconds=0.0,
            language="unknown",
        ),
    )


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest):
    if not req.transcript_text:
        raise HTTPException(400, "transcript_text is required")

    transcript = _text_to_transcript(req.transcript_text)
    level = AnalysisLevel(req.level.value)

    try:
        pipeline = get_pipeline()
        result = await pipeline.analyze(
            transcript,
            level=level,
            provider_name=req.provider,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

    return AnalysisResponse(
        analysis=result.data,
        meta=AnalysisMetaResponse(
            level=result.level.value,
            provider=result.provider,
            model=result.model,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
        ),
    )


@router.post("/analyze/stream")
async def analyze_stream(req: AnalyzeRequest):
    if not req.transcript_text:
        raise HTTPException(400, "transcript_text is required")

    transcript = _text_to_transcript(req.transcript_text)
    level = AnalysisLevel(req.level.value)

    pipeline = get_pipeline()

    async def event_generator():
        async for chunk in pipeline.analyze_stream(
            transcript,
            level=level,
            provider_name=req.provider,
        ):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )


@router.get("/providers")
async def list_providers():
    registry = get_registry()
    return {"providers": registry.available_providers}
