import os
from dataclasses import dataclass, field
from typing import Optional, Tuple


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _env_int(key: str, default: int = 0) -> int:
    return int(os.environ.get(key, str(default)))


def _env_bool(key: str, default: bool = False) -> bool:
    return os.environ.get(key, str(default)).lower() in ("1", "true", "yes")


def _env_float(key: str, default: float = 0.0) -> float:
    return float(os.environ.get(key, str(default)))


@dataclass(frozen=True)
class WhisperSettings:
    model_size: str = "medium"
    device: str = "cuda"
    compute_type: str = "int8_float16"
    beam_size: int = 5
    best_of: int = 5
    temperature: float = 0.0
    vad_filter: bool = True
    vad_min_silence_ms: int = 200
    condition_on_previous_text: bool = True
    word_timestamps: bool = False


@dataclass(frozen=True)
class LLMSettings:
    default_provider: str = "gemini"
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.0-flash"
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-sonnet-4-20250514"
    kimi_api_key: Optional[str] = None
    kimi_model: str = "moonshot-v1-8k"
    max_retries: int = 3
    timeout_seconds: int = 120
    fallback_chain: Tuple[str, ...] = ("gemini", "openai", "claude")


@dataclass(frozen=True)
class APISettings:
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "*"
    max_upload_mb: int = 500


@dataclass
class Settings:
    whisper: WhisperSettings = field(default_factory=WhisperSettings)
    llm: LLMSettings = field(default_factory=LLMSettings)
    api: APISettings = field(default_factory=APISettings)
    ffmpeg_path: Optional[str] = None
    data_dir: str = "./data"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            whisper=WhisperSettings(
                model_size=_env("WHISPER_MODEL", "medium"),
                device=_env("WHISPER_DEVICE", "cuda"),
                compute_type=_env("WHISPER_COMPUTE", "int8_float16"),
                beam_size=_env_int("WHISPER_BEAM_SIZE", 5),
                best_of=_env_int("WHISPER_BEST_OF", 5),
                temperature=_env_float("WHISPER_TEMPERATURE", 0.0),
                vad_filter=_env_bool("WHISPER_VAD", True),
                vad_min_silence_ms=_env_int("WHISPER_VAD_SILENCE_MS", 200),
                condition_on_previous_text=_env_bool("WHISPER_CONDITION_PREV", True),
                word_timestamps=_env_bool("WHISPER_WORD_TIMESTAMPS", False),
            ),
            llm=LLMSettings(
                default_provider=_env("LLM_DEFAULT_PROVIDER", "gemini"),
                gemini_api_key=_env("GEMINI_API_KEY") or None,
                gemini_model=_env("GEMINI_MODEL", "gemini-2.0-flash"),
                openai_api_key=_env("OPENAI_API_KEY") or None,
                openai_model=_env("OPENAI_MODEL", "gpt-4o-mini"),
                anthropic_api_key=_env("ANTHROPIC_API_KEY") or None,
                anthropic_model=_env("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
                kimi_api_key=_env("KIMI_API_KEY") or None,
                kimi_model=_env("KIMI_MODEL", "moonshot-v1-8k"),
                max_retries=_env_int("LLM_MAX_RETRIES", 3),
                timeout_seconds=_env_int("LLM_TIMEOUT", 120),
            ),
            api=APISettings(
                host=_env("API_HOST", "0.0.0.0"),
                port=_env_int("API_PORT", 8000),
                cors_origins=_env("API_CORS_ORIGINS", "*"),
                max_upload_mb=_env_int("API_MAX_UPLOAD_MB", 500),
            ),
            ffmpeg_path=_env("FFMPEG_PATH") or None,
            data_dir=_env("DATA_DIR", "./data"),
        )


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings.from_env()
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None
