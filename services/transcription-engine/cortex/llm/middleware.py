from __future__ import annotations

import asyncio
import logging
import time
from typing import AsyncIterator, List, Optional

from cortex.llm.base import LLMMessage, LLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class RetryProvider(LLMProvider):
    """Wraps a provider with retry logic."""

    def __init__(self, provider: LLMProvider, max_retries: int = 3, base_delay: float = 1.0):
        self._inner = provider
        self._max_retries = max_retries
        self._base_delay = base_delay
        self.name = provider.name
        self.default_model = provider.default_model

    async def generate(self, messages: List[LLMMessage], **kwargs) -> LLMResponse:
        last_error = None
        for attempt in range(self._max_retries + 1):
            try:
                return await self._inner.generate(messages, **kwargs)
            except Exception as e:
                last_error = e
                if attempt < self._max_retries:
                    delay = self._base_delay * (2 ** attempt)
                    logger.warning(
                        "Retry %d/%d for %s: %s (delay=%.1fs)",
                        attempt + 1, self._max_retries, self.name, e, delay,
                    )
                    await asyncio.sleep(delay)
        raise last_error

    async def stream(self, messages: List[LLMMessage], **kwargs) -> AsyncIterator[str]:
        last_error = None
        for attempt in range(self._max_retries + 1):
            try:
                async for chunk in self._inner.stream(messages, **kwargs):
                    yield chunk
                return
            except Exception as e:
                last_error = e
                if attempt < self._max_retries:
                    delay = self._base_delay * (2 ** attempt)
                    logger.warning(
                        "Stream retry %d/%d for %s: %s",
                        attempt + 1, self._max_retries, self.name, e,
                    )
                    await asyncio.sleep(delay)
        raise last_error

    def is_available(self) -> bool:
        return self._inner.is_available()


class FallbackProvider(LLMProvider):
    """Try providers in order until one succeeds."""

    def __init__(self, providers: List[LLMProvider]):
        if not providers:
            raise ValueError("At least one provider required")
        self._providers = providers
        self.name = "fallback"
        self.default_model = providers[0].default_model

    async def generate(self, messages: List[LLMMessage], **kwargs) -> LLMResponse:
        errors = []
        for provider in self._providers:
            if not provider.is_available():
                continue
            try:
                return await provider.generate(messages, **kwargs)
            except Exception as e:
                logger.warning("Fallback: %s failed: %s", provider.name, e)
                errors.append((provider.name, e))

        error_summary = "; ".join(f"{n}: {e}" for n, e in errors)
        raise RuntimeError(f"All providers failed: {error_summary}")

    async def stream(self, messages: List[LLMMessage], **kwargs) -> AsyncIterator[str]:
        errors = []
        for provider in self._providers:
            if not provider.is_available():
                continue
            try:
                async for chunk in provider.stream(messages, **kwargs):
                    yield chunk
                return
            except Exception as e:
                logger.warning("Fallback stream: %s failed: %s", provider.name, e)
                errors.append((provider.name, e))

        error_summary = "; ".join(f"{n}: {e}" for n, e in errors)
        raise RuntimeError(f"All providers failed: {error_summary}")

    def is_available(self) -> bool:
        return any(p.is_available() for p in self._providers)


class RateLimitedProvider(LLMProvider):
    """Simple token-bucket rate limiter."""

    def __init__(self, provider: LLMProvider, requests_per_minute: int = 60):
        self._inner = provider
        self._rpm = requests_per_minute
        self._tokens = float(requests_per_minute)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()
        self.name = provider.name
        self.default_model = provider.default_model

    async def _acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            self._tokens = min(self._rpm, self._tokens + elapsed * (self._rpm / 60.0))
            self._last_refill = now

            if self._tokens < 1:
                wait = (1 - self._tokens) / (self._rpm / 60.0)
                await asyncio.sleep(wait)
                self._tokens = 0
            else:
                self._tokens -= 1

    async def generate(self, messages: List[LLMMessage], **kwargs) -> LLMResponse:
        await self._acquire()
        return await self._inner.generate(messages, **kwargs)

    async def stream(self, messages: List[LLMMessage], **kwargs) -> AsyncIterator[str]:
        await self._acquire()
        async for chunk in self._inner.stream(messages, **kwargs):
            yield chunk

    def is_available(self) -> bool:
        return self._inner.is_available()
