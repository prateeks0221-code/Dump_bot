from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AnalysisLevelEnum(str, Enum):
    L1 = "L1"
    L2 = "L2"
    L3 = "L3"


class OutputFormatEnum(str, Enum):
    markdown = "markdown"
    json = "json"
    srt = "srt"
    vtt = "vtt"
    plain = "plain"


# --- Request Schemas ---

class TranscribeRequest(BaseModel):
    language: Optional[str] = None
    beam_size: Optional[int] = None
    vad_filter: Optional[bool] = None
    word_timestamps: Optional[bool] = None
    output_format: OutputFormatEnum = OutputFormatEnum.json


class AnalyzeRequest(BaseModel):
    transcript_text: Optional[str] = None
    level: AnalysisLevelEnum = AnalysisLevelEnum.L1
    provider: Optional[str] = None


class IngestRequest(BaseModel):
    level: AnalysisLevelEnum = AnalysisLevelEnum.L1
    provider: Optional[str] = None
    language: Optional[str] = None
    output_format: OutputFormatEnum = OutputFormatEnum.json
    word_timestamps: bool = False


# --- Response Schemas ---

class SegmentResponse(BaseModel):
    id: int
    start: float
    end: float
    text: str
    confidence: float = 0.0
    language: Optional[str] = None
    speaker: Optional[str] = None


class TranscriptMetaResponse(BaseModel):
    source_file: str = ""
    duration_seconds: float = 0.0
    language: str = ""
    language_probability: float = 0.0
    model_size: str = ""
    num_segments: int = 0


class TranscriptResponse(BaseModel):
    text: str
    segments: List[SegmentResponse]
    metadata: TranscriptMetaResponse
    formatted: Optional[str] = None
    word_count: int = 0


class AnalysisMetaResponse(BaseModel):
    level: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


class AnalysisResponse(BaseModel):
    analysis: Dict[str, Any]
    meta: AnalysisMetaResponse


class IngestResponse(BaseModel):
    transcript: TranscriptResponse
    analysis: Optional[AnalysisResponse] = None
    l1_analysis: Optional[AnalysisResponse] = None
    l2_analysis: Optional[AnalysisResponse] = None
    l3_analysis: Optional[AnalysisResponse] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    gpu: Optional[str] = None
    whisper_model: str = ""
    llm_providers: List[str] = Field(default_factory=list)


class JobStatusEnum(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class UrlIngestRequest(BaseModel):
    url: str
    level: AnalysisLevelEnum = AnalysisLevelEnum.L3
    provider: Optional[str] = None
    language: Optional[str] = None
    word_timestamps: bool = False


class JobResponse(BaseModel):
    job_id: str
    status: JobStatusEnum
    created_at: str
    updated_at: str
    progress_percent: int = 0
    stage: str = ""
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
