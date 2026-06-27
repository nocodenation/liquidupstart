from __future__ import annotations

import logging
import sys

LOGGER_NAME = "privacy_gateway"
_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging(level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(level.upper())
    logger.propagate = False
    for handler in logger.handlers:
        if getattr(handler, "_pg_handler", False):
            handler.setLevel(level.upper())
            return logger
    handler = logging.StreamHandler(sys.stdout)
    handler._pg_handler = True
    handler.setFormatter(logging.Formatter(_FORMAT))
    logger.addHandler(handler)
    return logger
