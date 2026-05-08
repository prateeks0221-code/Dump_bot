"""Dependency injection for FastAPI routes."""
from __future__ import annotations

from typing import Optional

from cortex.config import Settings, get_settings
from cortex.intelligence.pipeline import IntelligencePipeline
from cortex.llm.registry import ProviderRegistry
from cortex.processing.extractor import AudioExtractor
from cortex.transcription.engine import WhisperEngine

_engine: Optional[WhisperEngine] = None
_extractor: Optional[AudioExtractor] = None
_registry: Optional[ProviderRegistry] = None
_pipeline: Optional[IntelligencePipeline] = None


def get_engine() -> WhisperEngine:
    global _engine
    if _engine is None:
        _engine = WhisperEngine()
    return _engine


def get_extractor() -> AudioExtractor:
    global _extractor
    if _extractor is None:
        _extractor = AudioExtractor()
    return _extractor


def get_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry


def get_pipeline() -> IntelligencePipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = IntelligencePipeline(get_registry())
    return _pipeline
