"""Vercel Serverless entrypoint — delegates to backend/main.py."""

import os
import sys

# Make backend directory importable
_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from main import app  # noqa: F401 — Vercel expects `app` at module level
