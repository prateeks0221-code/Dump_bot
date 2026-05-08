from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cortex import __version__
from cortex.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Cortex",
        description="AI-powered transcript intelligence engine",
        version=__version__,
    )

    origins = [o.strip() for o in settings.api.cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from cortex.api.routes import health, ingest, intelligence, transcripts, url_ingest, jobs
    app.include_router(health.router)
    app.include_router(ingest.router, prefix="/api")
    app.include_router(transcripts.router, prefix="/api")
    app.include_router(intelligence.router, prefix="/api")
    app.include_router(url_ingest.router, prefix="/api")
    app.include_router(jobs.router, prefix="/api")

    @app.on_event("startup")
    async def startup():
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        )
        logger = logging.getLogger("cortex")
        logger.info("Cortex v%s starting", __version__)
        logger.info(
            "Whisper: model=%s device=%s compute=%s",
            settings.whisper.model_size,
            settings.whisper.device,
            settings.whisper.compute_type,
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "cortex.api.app:app",
        host=settings.api.host,
        port=settings.api.port,
        reload=True,
    )
