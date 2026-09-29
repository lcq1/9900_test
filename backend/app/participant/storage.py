"""Cloud-storage boundary reserved for later integration."""

from dataclasses import dataclass


@dataclass(frozen=True)
class UploadRequest:
    object_key: str
    mime_type: str
    size: int


class ObjectStorageClient:
    def create_upload_url(self, request: UploadRequest) -> str:
        _ = request
        raise NotImplementedError("Cloud storage is intentionally not configured yet")
