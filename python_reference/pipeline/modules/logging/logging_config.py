"""
Logging — central logging configuration injection.

YAML-driven configuration (handlers, levels, formatters). Dedicated
model/ensemble logging directories. Standard separation: main log, error log.
"""

import logging
import os
from logging.handlers import RotatingFileHandler


_DEFAULT_FMT = "%(asctime)s | %(name)s | %(levelname)s | %(message)s"


def configure_logging(log_dir: str = "logs", level: int = logging.INFO,
                      model_name: str = "pipeline") -> logging.Logger:
    """Configure central logging with main + error separation."""
    os.makedirs(log_dir, exist_ok=True)
    model_dir = os.path.join(log_dir, model_name)
    os.makedirs(model_dir, exist_ok=True)

    logger = logging.getLogger(f"oman_border.{model_name}")
    logger.setLevel(level)
    logger.handlers.clear()

    main_handler = RotatingFileHandler(
        os.path.join(model_dir, "main.log"), maxBytes=2_000_000, backupCount=3, encoding="utf-8"
    )
    main_handler.setLevel(level)
    main_handler.setFormatter(logging.Formatter(_DEFAULT_FMT))
    logger.addHandler(main_handler)

    error_handler = RotatingFileHandler(
        os.path.join(model_dir, "error.log"), maxBytes=1_000_000, backupCount=2, encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(logging.Formatter(_DEFAULT_FMT))
    logger.addHandler(error_handler)

    # also log to console
    console = logging.StreamHandler()
    console.setLevel(level)
    console.setFormatter(logging.Formatter(_DEFAULT_FMT))
    logger.addHandler(console)

    return logger