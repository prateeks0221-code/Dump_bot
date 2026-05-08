from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import List, Optional
from enum import Enum


class OutputFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"
    SRT = "srt"
    VTT = "vtt"
    PLAIN = "plain"


@dataclass
class Word:
    start: float
    end: float
    text: str
    probability: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Segment:
    id: int
    start: float
    end: float
    text: str
    words: Optional[List[Word]] = None
    avg_logprob: float = 0.0
    no_speech_prob: float = 0.0
    compression_ratio: float = 0.0
    temperature: float = 0.0
    language: Optional[str] = None
    speaker: Optional[str] = None

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def confidence(self) -> float:
        if self.avg_logprob == 0:
            return 0.0
        import math
        return math.exp(self.avg_logprob)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["duration"] = self.duration
        d["confidence"] = self.confidence
        return d


@dataclass
class TranscriptMetadata:
    source_file: str = ""
    duration_seconds: float = 0.0
    language: str = ""
    language_probability: float = 0.0
    model_size: str = ""
    device: str = ""
    compute_type: str = ""
    num_segments: int = 0


@dataclass
class Transcript:
    segments: List[Segment] = field(default_factory=list)
    metadata: TranscriptMetadata = field(default_factory=TranscriptMetadata)

    @property
    def text(self) -> str:
        return " ".join(s.text.strip() for s in self.segments if s.text.strip())

    @property
    def duration(self) -> float:
        if not self.segments:
            return 0.0
        return self.segments[-1].end

    @property
    def word_count(self) -> int:
        return len(self.text.split())

    def segment_texts(self) -> List[str]:
        return [s.text.strip() for s in self.segments if s.text.strip()]

    def to_dict(self) -> dict:
        return {
            "metadata": asdict(self.metadata),
            "segments": [s.to_dict() for s in self.segments],
            "text": self.text,
            "duration": self.duration,
            "word_count": self.word_count,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)
