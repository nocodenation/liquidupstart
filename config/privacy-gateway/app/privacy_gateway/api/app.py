from fastapi import FastAPI
from fastapi.responses import JSONResponse

from privacy_gateway.api.routes import anthropic, health, openai, responses
from privacy_gateway.config import Settings
from privacy_gateway.core.errors import LLMUnavailable
from privacy_gateway.core.mitm import dispatch as mitm_dispatch
from privacy_gateway.logging_config import configure_logging


def create_app(settings: Settings | None = None, gateway=None, upstream=None) -> FastAPI:
    settings = settings or Settings()
    logger = configure_logging(settings.log_level)
    app = FastAPI(title="privacy-gateway")

    @app.exception_handler(LLMUnavailable)
    async def _llm_unavailable(request, exc):
        logger.warning("local LLM unavailable: %s", exc)
        return JSONResponse(
            {"error": "local_llm_unavailable", "detail": str(exc)}, status_code=502
        )
    app.state.settings = settings
    app.state.gateway = gateway
    app.state.upstream = upstream
    app.include_router(health.router)
    app.include_router(anthropic.router)
    app.include_router(openai.router)
    app.include_router(responses.router)
    app.include_router(mitm_dispatch.router)
    logger.info(
        "privacy-gateway ready: upstream=%s log_level=%s", settings.upstream, settings.log_level
    )
    return app
