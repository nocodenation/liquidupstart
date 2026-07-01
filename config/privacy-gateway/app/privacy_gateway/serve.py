from __future__ import annotations

import asyncio
import logging

import uvicorn

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.mitm.certs import ensure_ca

logger = logging.getLogger(__name__)


async def _serve() -> None:
    settings = Settings()
    app = create_app(settings)
    servers = [uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=8080))]

    if settings.mitm_active:
        ca = ensure_ca(settings.ca_dir)
        logger.info("mode-B TLS listener on :%d (CA %s)", settings.mitm_port, ca.ca_cert)
        servers.append(
            uvicorn.Server(
                uvicorn.Config(
                    app, host="0.0.0.0", port=settings.mitm_port,
                    ssl_certfile=str(ca.leaf_cert), ssl_keyfile=str(ca.leaf_key),
                )
            )
        )

    await asyncio.gather(*(s.serve() for s in servers))


def main() -> None:
    asyncio.run(_serve())


if __name__ == "__main__":
    main()
