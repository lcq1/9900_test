"""External AI API adapter with a narrow, provider-independent interface."""

from typing import Any


class AIClient:
    """Send filtered inputs to the configured text or multimodal provider."""

    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Execute one provider request; retry policy belongs in the job worker."""

        _ = payload
        raise NotImplementedError("AI provider is not configured")
