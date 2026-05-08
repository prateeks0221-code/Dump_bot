from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Dict, List, Optional


class Role(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class LLMMessage:
    role: Role
    content: str


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass
class LLMResponse:
    content: str
    provider: str
    model: str
    usage: TokenUsage = field(default_factory=TokenUsage)
    finish_reason: str = ""
    raw: Optional[Dict] = None


class LLMProvider(ABC):
    name: str = ""
    default_model: str = ""

    @abstractmethod
    async def generate(
        self,
        messages: List[LLMMessage],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs,
    ) -> LLMResponse:
        ...

    @abstractmethod
    async def stream(
        self,
        messages: List[LLMMessage],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs,
    ) -> AsyncIterator[str]:
        ...
        yield  # pragma: no cover

    def is_available(self) -> bool:
        return True

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name!r})"
