from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, Optional

from cortex.intelligence.levels import AnalysisLevel, get_level_spec
from cortex.intelligence.prompts import SYSTEM_PROMPT, build_prompt
from cortex.llm.base import LLMMessage, LLMProvider, LLMResponse, Role
from cortex.llm.registry import ProviderRegistry
from cortex.transcription.models import Transcript

logger = logging.getLogger(__name__)


@dataclass
class AnalysisResult:
    level: AnalysisLevel
    data: Dict[str, Any]
    raw_response: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level.value,
            "analysis": self.data,
            "meta": {
                "provider": self.provider,
                "model": self.model,
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
            },
        }


class IntelligencePipeline:
    """Orchestrates transcript analysis through LLM providers."""

    def __init__(self, registry: ProviderRegistry):
        self._registry = registry

    async def analyze(
        self,
        transcript: Transcript,
        *,
        level: AnalysisLevel = AnalysisLevel.L1,
        provider_name: Optional[str] = None,
    ) -> AnalysisResult:
        spec = get_level_spec(level)

        duration_str = self._format_duration(transcript.metadata.duration_seconds)
        prompt = build_prompt(
            level=level,
            transcript_text=transcript.text,
            duration=duration_str,
            language=transcript.metadata.language or "unknown",
            num_segments=transcript.metadata.num_segments,
        )

        messages = [
            LLMMessage(role=Role.SYSTEM, content=SYSTEM_PROMPT),
            LLMMessage(role=Role.USER, content=prompt),
        ]

        if provider_name:
            provider = self._registry.get(provider_name)
        else:
            provider = self._registry.get_default()

        logger.info(
            "Running %s analysis via %s (max_tokens=%d)",
            level.value, provider.name, spec.max_tokens,
        )

        response = await provider.generate(
            messages,
            temperature=spec.temperature,
            max_tokens=spec.max_tokens,
        )

        parsed = self._parse_json_response(response.content)

        return AnalysisResult(
            level=level,
            data=parsed,
            raw_response=response.content,
            provider=response.provider,
            model=response.model,
            prompt_tokens=response.usage.prompt_tokens,
            completion_tokens=response.usage.completion_tokens,
        )

    async def analyze_stream(
        self,
        transcript: Transcript,
        *,
        level: AnalysisLevel = AnalysisLevel.L1,
        provider_name: Optional[str] = None,
    ) -> AsyncIterator[str]:
        spec = get_level_spec(level)

        duration_str = self._format_duration(transcript.metadata.duration_seconds)
        prompt = build_prompt(
            level=level,
            transcript_text=transcript.text,
            duration=duration_str,
            language=transcript.metadata.language or "unknown",
            num_segments=transcript.metadata.num_segments,
        )

        messages = [
            LLMMessage(role=Role.SYSTEM, content=SYSTEM_PROMPT),
            LLMMessage(role=Role.USER, content=prompt),
        ]

        if provider_name:
            provider = self._registry.get(provider_name)
        else:
            provider = self._registry.get_default()

        async for chunk in provider.stream(
            messages,
            temperature=spec.temperature,
            max_tokens=spec.max_tokens,
        ):
            yield chunk

    def _parse_json_response(self, text: str) -> Dict[str, Any]:
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM response as JSON, returning raw text")
            return {"raw_text": text}

    @staticmethod
    def _format_duration(seconds: float) -> str:
        m, s = divmod(int(seconds), 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h}h {m}m {s}s"
        return f"{m}m {s}s"
