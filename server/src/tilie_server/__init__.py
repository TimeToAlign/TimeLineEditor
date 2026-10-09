"""The local server of TimeLineEditor.

It serves the built editor and answers its API on the loopback interface,
guarded by a per-run token and by Host and Origin checks.
"""

from __future__ import annotations

from importlib.metadata import version

__version__ = version("tilie-server")

__all__ = ["__version__"]
