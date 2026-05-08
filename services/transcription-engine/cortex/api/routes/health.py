from fastapi import APIRouter

from cortex.api.schemas import HealthResponse
from cortex.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health():
    settings = get_settings()
    gpu_name = None
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
    except ImportError:
        pass

    from cortex.api.deps import get_registry
    registry = get_registry()

    return HealthResponse(
        status="ok",
        gpu=gpu_name,
        whisper_model=settings.whisper.model_size,
        llm_providers=registry.available_providers,
    )
