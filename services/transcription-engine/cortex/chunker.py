"""Transcript chunking, deduplication, and token optimization."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

from cortex.transcription.models import Segment, Transcript


@dataclass
class TranscriptChunk:
    id: int
    start: float
    end: float
    text: str
    segments: List[Segment] = field(default_factory=list)
    word_count: int = 0


class TranscriptChunker:
    """
    Semantic + timestamp-aware chunker for long transcripts.
    Optimizes token usage by deduplicating filler content and compressing.
    """

    # Common filler words/phrases to deprioritize
    FILLER_PATTERNS = [
        r"\b(um|uh|ah|eh|hm|mm)\b",
        r"\b(you know|like like|sort of|kind of|i mean|basically|literally)\b",
        r"\b(right right|yeah yeah|okay okay|ok ok)\b",
    ]

    # Repetitive patterns
    REPETITION_THRESHOLD = 3  # identical sentences repeated >3 times

    def __init__(
        self,
        max_chunk_words: int = 1500,
        max_chunk_duration: float = 300.0,
        paragraph_gap: float = 2.0,
    ):
        self.max_chunk_words = max_chunk_words
        self.max_chunk_duration = max_chunk_duration
        self.paragraph_gap = paragraph_gap

    def chunk(self, transcript: Transcript) -> List[TranscriptChunk]:
        """Split transcript into semantic, timestamp-aware chunks."""
        segments = transcript.segments
        if not segments:
            return []

        # Stage 1: Clean segments
        cleaned = [self._clean_segment(s) for s in segments]

        # Stage 2: Group into paragraphs by silence gap
        paragraphs = self._group_paragraphs(cleaned)

        # Stage 3: Merge paragraphs into chunks respecting size limits
        chunks = self._build_chunks(paragraphs)

        return chunks

    def compress(self, text: str, aggressive: bool = False) -> str:
        """Remove filler and deduplicate repetitive text."""
        # Remove filler words
        for pattern in self.FILLER_PATTERNS:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)

        # Normalize whitespace
        text = re.sub(r"\s+", " ", text).strip()

        if aggressive:
            # Deduplicate repeated sentences
            sentences = re.split(r"(?<=[.!?])\s+", text)
            seen = set()
            filtered = []
            for s in sentences:
                key = s.lower().strip()
                if key not in seen:
                    seen.add(key)
                    filtered.append(s)
                elif len(seen) < self.REPETITION_THRESHOLD:
                    # Allow a few repeats initially
                    filtered.append(s)
            text = " ".join(filtered)

        return text

    def _clean_segment(self, segment: Segment) -> Segment:
        text = segment.text.strip()
        # Remove standalone filler tokens
        for pattern in self.FILLER_PATTERNS:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s+", " ", text).strip()
        return Segment(
            id=segment.id,
            start=segment.start,
            end=segment.end,
            text=text,
            words=segment.words,
            avg_logprob=segment.avg_logprob,
            no_speech_prob=segment.no_speech_prob,
            compression_ratio=segment.compression_ratio,
            temperature=segment.temperature,
            language=segment.language,
        )

    def _group_paragraphs(self, segments: List[Segment]) -> List[List[Segment]]:
        if not segments:
            return []
        paragraphs: List[List[Segment]] = [[segments[0]]]
        for i in range(1, len(segments)):
            gap = segments[i].start - segments[i - 1].end
            if gap > self.paragraph_gap:
                paragraphs.append([])
            paragraphs[-1].append(segments[i])
        return paragraphs

    def _build_chunks(self, paragraphs: List[List[Segment]]) -> List[TranscriptChunk]:
        chunks: List[TranscriptChunk] = []
        current: List[Segment] = []
        current_words = 0
        current_duration = 0.0

        for para in paragraphs:
            para_word_count = sum(len(s.text.split()) for s in para)
            para_duration = para[-1].end - para[0].start if para else 0.0

            # If adding this paragraph exceeds limits, finalize current chunk
            if current and (
                current_words + para_word_count > self.max_chunk_words
                or current_duration + para_duration > self.max_chunk_duration
            ):
                chunks.append(self._make_chunk(current))
                current = []
                current_words = 0
                current_duration = 0.0

            current.extend(para)
            current_words += para_word_count
            current_duration += para_duration

        if current:
            chunks.append(self._make_chunk(current))

        return chunks

    def _make_chunk(self, segments: List[Segment]) -> TranscriptChunk:
        text = " ".join(s.text for s in segments)
        words = len(text.split())
        return TranscriptChunk(
            id=segments[0].id if segments else 0,
            start=segments[0].start if segments else 0.0,
            end=segments[-1].end if segments else 0.0,
            text=text,
            segments=list(segments),
            word_count=words,
        )


class SmartRouter:
    """
    Routes only relevant transcript sections to the LLM.
    Priority scoring based on information density.
    """

    def __init__(self, max_words: int = 3000):
        self.max_words = max_words

    def select_chunks(self, chunks: List[TranscriptChunk]) -> List[TranscriptChunk]:
        """Select highest-priority chunks up to max_words."""
        if not chunks:
            return []

        # Score each chunk by information density
        scored = [(self._score(c), c) for c in chunks]
        scored.sort(key=lambda x: x[0], reverse=True)

        selected = []
        total_words = 0
        for _, chunk in scored:
            if total_words + chunk.word_count > self.max_words and selected:
                break
            selected.append(chunk)
            total_words += chunk.word_count

        # Restore chronological order
        selected.sort(key=lambda c: c.start)
        return selected

    def _score(self, chunk: TranscriptChunk) -> float:
        text = chunk.text.lower()
        words = chunk.word_count or 1

        # Base density: unique words / total words
        unique_ratio = len(set(text.split())) / words

        # Boost for actionable / analytical language
        boost = 0.0
        analytical_terms = [
            "because", "therefore", "however", "conclusion", "result",
            "strategy", "important", "critical", "recommend", "action",
            "insight", "pattern", "trend", "analysis", "finding",
        ]
        for term in analytical_terms:
            if term in text:
                boost += 0.05

        # Penalize very short chunks (likely fragmented)
        if words < 10:
            penalty = 0.3
        else:
            penalty = 0.0

        return unique_ratio + boost - penalty
