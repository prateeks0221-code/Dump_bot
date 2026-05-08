from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Union

import numpy as np

from cortex.config import Settings, get_settings
from cortex.transcription.models import Segment, Transcript, TranscriptMetadata, Word

logger = logging.getLogger(__name__)


class WhisperEngine:
    """Wraps faster-whisper for transcription with clean output models."""

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or get_settings()
        self._model = None

    @property
    def model(self):
        if self._model is None:
            self._load_model()
        return self._model

    def _load_model(self) -> None:
        from faster_whisper import WhisperModel

        cfg = self._settings.whisper
        logger.info(
            "Loading whisper model=%s device=%s compute=%s",
            cfg.model_size,
            cfg.device,
            cfg.compute_type,
        )
        self._model = WhisperModel(
            cfg.model_size,
            device=cfg.device,
            compute_type=cfg.compute_type,
        )
        logger.info("Model loaded successfully")

    def transcribe(
        self,
        audio: Union[str, Path, np.ndarray],
        *,
        language: Optional[str] = None,
        beam_size: Optional[int] = None,
        vad_filter: Optional[bool] = None,
        word_timestamps: Optional[bool] = None,
    ) -> Transcript:
        cfg = self._settings.whisper
        audio_input = str(audio) if isinstance(audio, Path) else audio

        raw_segments, info = self.model.transcribe(
            audio_input,
            beam_size=beam_size or cfg.beam_size,
            best_of=cfg.best_of,
            temperature=cfg.temperature,
            condition_on_previous_text=cfg.condition_on_previous_text,
            vad_filter=vad_filter if vad_filter is not None else cfg.vad_filter,
            vad_parameters=dict(min_silence_duration_ms=cfg.vad_min_silence_ms),
            language=language,
            word_timestamps=word_timestamps if word_timestamps is not None else cfg.word_timestamps,
        )

        segments = []
        for idx, raw in enumerate(raw_segments):
            words = None
            if raw.words:
                words = [
                    Word(
                        start=w.start,
                        end=w.end,
                        text=w.word,
                        probability=w.probability,
                    )
                    for w in raw.words
                ]

            segments.append(
                Segment(
                    id=idx,
                    start=raw.start,
                    end=raw.end,
                    text=raw.text.strip(),
                    words=words,
                    avg_logprob=raw.avg_logprob,
                    no_speech_prob=raw.no_speech_prob,
                    compression_ratio=raw.compression_ratio,
                    temperature=raw.temperature if hasattr(raw, "temperature") else 0.0,
                    language=info.language,
                )
            )

        source = str(audio) if not isinstance(audio, np.ndarray) else "<numpy_array>"

        metadata = TranscriptMetadata(
            source_file=source,
            duration_seconds=info.duration,
            language=info.language,
            language_probability=info.language_probability,
            model_size=cfg.model_size,
            device=cfg.device,
            compute_type=cfg.compute_type,
            num_segments=len(segments),
        )

        logger.info(
            "Transcription complete: lang=%s segments=%d duration=%.1fs",
            info.language,
            len(segments),
            info.duration,
        )

        return Transcript(segments=segments, metadata=metadata)

    def detect_language(self, audio: Union[str, Path, np.ndarray]) -> tuple:
        audio_input = str(audio) if isinstance(audio, Path) else audio
        return self.model.detect_language(audio_input)
