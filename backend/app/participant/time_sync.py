from app.core import clock


def server_now_iso() -> str:
    return clock.now_iso()


def server_epoch_ms() -> int:
    return clock.epoch_ms()


def anchor() -> dict[str, object]:
    instant = clock.now()
    return {"iso": instant.isoformat(), "epochMs": int(instant.timestamp() * 1000)}
