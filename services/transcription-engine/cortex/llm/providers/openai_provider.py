from __future__ import annotations

import json
import logging
from typing import AsyncIterator, List, Optional

import httpx

from cortex.llm.base import LLMMessage, LLMProvider, LLMResponse, Role, TokenUsage

logger = logging.getLogger(__name__)

OPENAI_BASE_URL = "https://api.openai.com/v1"


class OpenAIProvider(LLMProvider):
    name = "openai"
    default_model = "gpt-4o-mini"

    def __init__(self, api_key: str, model: Optional[str] = None, timeout: int = 120):
        self._api_key = api_key
        self._timeout = timeout
        if model:
            self.default_model = model

    def is_available(self) -> bool:
        return bool(self._api_key)

    def _build_messages(self, messages: List[LLMMessage]) -> List[dict]:
        return [{"role": msg.role.value, "content": msg.content} for msg in messages]

    async def generate(
        self,
        messages: List[LLMMessage],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs,
    ) -> LLMResponse:
        model_id = model or self.default_model

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": model_id,
                    "messages": self._build_messages(messages),
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]
        usage_data = data.get("usage", {})

        return LLMResponse(
            content=choice["message"]["content"],
            provider=self.name,
            model=model_id,
            usage=TokenUsage(
                prompt_tokens=usage_data.get("prompt_tokens", 0),
                completion_tokens=usage_data.get("completion_tokens", 0),
            ),
            finish_reason=choice.get("finish_reason", ""),
            raw=data,
        )

    async def stream(
        self,
        messages: List[LLMMessage],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs,
    ) -> AsyncIterator[str]:
        model_id = model or self.default_model

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": model_id,
                    "messages": self._build_messages(messages),
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line.strip() != "data: [DONE]":
                        chunk = json.loads(line[6:])
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta and delta["content"]:
                            yield delta["content"]
