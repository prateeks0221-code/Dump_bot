from __future__ import annotations

import json
import logging
from typing import AsyncIterator, List, Optional

import httpx

from cortex.llm.base import LLMMessage, LLMProvider, LLMResponse, Role, TokenUsage

logger = logging.getLogger(__name__)

ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"


class ClaudeProvider(LLMProvider):
    name = "claude"
    default_model = "claude-sonnet-4-20250514"

    def __init__(self, api_key: str, model: Optional[str] = None, timeout: int = 120):
        self._api_key = api_key
        self._timeout = timeout
        if model:
            self.default_model = model

    def is_available(self) -> bool:
        return bool(self._api_key)

    def _build_messages(self, messages: List[LLMMessage]) -> tuple:
        system = None
        api_messages = []

        for msg in messages:
            if msg.role == Role.SYSTEM:
                system = msg.content
            else:
                api_messages.append({
                    "role": msg.role.value,
                    "content": msg.content,
                })

        return system, api_messages

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
        system, api_messages = self._build_messages(messages)

        body = {
            "model": model_id,
            "messages": api_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            body["system"] = system

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{ANTHROPIC_BASE_URL}/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        content_blocks = data.get("content", [])
        text = "".join(b["text"] for b in content_blocks if b["type"] == "text")

        usage_data = data.get("usage", {})

        return LLMResponse(
            content=text,
            provider=self.name,
            model=model_id,
            usage=TokenUsage(
                prompt_tokens=usage_data.get("input_tokens", 0),
                completion_tokens=usage_data.get("output_tokens", 0),
            ),
            finish_reason=data.get("stop_reason", ""),
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
        system, api_messages = self._build_messages(messages)

        body = {
            "model": model_id,
            "messages": api_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        if system:
            body["system"] = system

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{ANTHROPIC_BASE_URL}/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json=body,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        event = json.loads(line[6:])
                        if event.get("type") == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                yield delta["text"]
