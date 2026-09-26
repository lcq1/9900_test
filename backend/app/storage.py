"""S3-compatible object-storage adapter.

This module will issue short-lived signed URLs only after services validate the
file type, size and experiment ownership. It must never expose storage secrets.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class UploadRequest:
    """Validated metadata needed to request a signed upload URL."""

    object_key: str
    mime_type: str
    size: int


class ObjectStorageClient:
    """Boundary around the selected S3-compatible provider SDK."""

    def create_upload_url(self, request: UploadRequest) -> str:
        """Return a constrained, short-lived URL after implementation."""

        raise NotImplementedError("Object storage provider is not configured")
