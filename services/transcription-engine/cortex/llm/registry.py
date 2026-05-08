from __future__ import annotations

import logging
from typing import Dict, List, Optional, Type

from cortex.config import Settings, get_settings
from cortex.llm.base import LLMProvider
from cortex.llm.middleware import FallbackProvider, RateLimitedProvider, RetryProvider
from cortex.llm.providers.claude_provider import ClaudeProvider
from cortex.llm.providers.gemini import GeminiProvider
from cortex.llm.providers.openai_provider import OpenAIProvider

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """Central registry for LLM providers. Handles init, wrapping, and routing."""

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or get_settings()
        self._providers: Dict[str, LLMProvider] = {}
        self._initialize()

    def _initialize(self) -> None:
        cfg = self._settings.llm

        provider_configs = [
            ("gemini", GeminiProvider, cfg.gemini_api_key, cfg.gemini_model),
            ("openai", OpenAIProvider, cfg.openai_api_key, cfg.openai_model),
            ("claude", ClaudeProvider, cfg.anthropic_api_key, cfg.anthropic_model),
        ]

        for name, cls, api_key, model in provider_configs:
            if api_key:
                provider = cls(
                    api_key=api_key,
                    model=model,
                    timeout=cfg.timeout_seconds,
                )
                wrapped = RetryProvider(provider, max_retries=cfg.max_retries)
                self._providers[name] = wrapped
                logger.info("Registered LLM provider: %s (%s)", name, model)

    def get(self, name: str) -> LLMProvider:
        if name not in self._providers:
            available = list(self._providers.keys())
            raise KeyError(f"Provider '{name}' not available. Have: {available}")
        return self._providers[name]

    def get_default(self) -> LLMProvider:
        default = self._settings.llm.default_provider
        if default in self._providers:
            return self._providers[default]
        if self._providers:
            first = next(iter(self._providers))
            logger.warning("Default provider '%s' unavailable, falling back to '%s'", default, first)
            return self._providers[first]
        raise RuntimeError("No LLM providers configured. Set at least one API key.")

    def get_fallback_chain(self) -> FallbackProvider:
        chain = []
        for name in self._settings.llm.fallback_chain:
            if name in self._providers:
                chain.append(self._providers[name])
        if not chain:
            chain = list(self._providers.values())
        if not chain:
            raise RuntimeError("No LLM providers available for fallback chain")
        return FallbackProvider(chain)

    def register(self, name: str, provider: LLMProvider) -> None:
        self._providers[name] = provider
        logger.info("Manually registered provider: %s", name)

    @property
    def available_providers(self) -> List[str]:
        return list(self._providers.keys())

    def __contains__(self, name: str) -> bool:
        return name in self._providers
