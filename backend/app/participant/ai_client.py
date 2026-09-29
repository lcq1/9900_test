"""External AI boundary reserved for later integration."""

from typing import Any


class AIClient:
    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        _ = payload
        raise NotImplementedError("AI API is intentionally not configured yet")
