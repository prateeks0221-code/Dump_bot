from __future__ import annotations

import json
import logging
from typing import AsyncIterator, List, Optional

import httpx

from cortex.llm.base import LLMMessage, LLMProvider, LLMResponse, Role, TokenUsage

logger = logging.getLogger(__name__)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiProvider(LLMProvider):
    name = "gemini"
    default_model = "gemini-2.0-flash"

    def __init__(self, api_key: str, model: Optional[str] = None, timeout: int = 120):
        self._api_key = api_key
        self._timeout = timeout
        if model:
            self.default_model = model

    def is_available(self) -> bool:
        return bool(self._api_key)

    def _build_contents(self, messages: List[LLMMessage]) -> tuple:
        system_instruction = None
        contents = []

        for msg in messages:
            if msg.role == Role.SYSTEM:
                system_instruction = {"parts": [{"text": msg.content}]}
            else:
                role = "user" if msg.role == Role.USER else "model"
                contents.append({"role": role, "parts": [{"text": msg.content}]})

        return system_instruction, contents

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
        url = f"{GEMINI_BASE_URL}/models/{model_id}:generateContent"

        system_instruction, contents = self._build_contents(messages)

        body = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_instruction:
            body["systemInstruction"] = system_instruction

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                url,
                params={"key": self._api_key},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        candidate = data["candidates"][0]
        text = candidate["content"]["parts"][0]["text"]

        usage_data = data.get("usageMetadata", {})
        usage = TokenUsage(
            prompt_tokens=usage_data.get("promptTokenCount", 0),
            completion_tokens=usage_data.get("candidatesTokenCount", 0),
        )

        return LLMResponse(
            content=text,
            provider=self.name,
            model=model_id,
            usage=usage,
            finish_reason=candidate.get("finishReason", ""),
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
        url = f"{GEMINI_BASE_URL}/models/{model_id}:streamGenerateContent"

        system_instruction, contents = self._build_contents(messages)

        body = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_instruction:
            body["systemInstruction"] = system_instruction

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                url,
                params={"key": self._api_key, "alt": "sse"},
                json=body,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        chunk_data = json.loads(line[6:])
                        candidates = chunk_data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            for part in parts:
                                if "text" in part:
                                    yield part["text"]
