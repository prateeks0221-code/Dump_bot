"""Cortex Transcription Engine — standalone entry point."""
from __future__ import annotations

import logging

import uvicorn
from cortex.api.app import app
from cortex.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    uvicorn.run(
        "cortex.api.app:app",
        host=settings.api.host,
        port=settings.api.port,
        reload=False,
    )
